import { useEffect, useState } from "react";
import type { DocStore } from "../../core/doc-store.js";
import type {
  CharacterElement,
  ProjectDoc,
  SceneElement,
} from "../../core/schema/project.js";
import type { CharacterDoc } from "../../core/schema/character.js";
import type { AssetResolver } from "../../io/asset-resolver.js";
import type { ThumbnailService } from "../thumbs/thumbnail-service.js";
import { EXPRESSION_PRESETS } from "../../runtime/expression.js";
import { CLIPS } from "../../presets/clips/index.js";
import type { CameraKey } from "../../core/schema/project.js";
import {
  setElementEnter,
  setElementExit,
  updateAction,
  updateCameraKey,
  updateExpressionKey,
} from "../../core/commands-project.js";
import { actionBlocks, clampTime, snapCandidates, snapTime } from "./time-snap.js";
import { audioLabel } from "./audio-options.js";
import { updateTalk } from "../../core/commands-project.js";
import {
  IconCamera,
  IconCharacter,
  IconText,
  IconBalloon,
  IconBackground,
  IconLock,
} from "../ui/icons.js";

export const LANE_H = 30;
export const NAME_W = 110;

// ---------------------------------------------------------------------------
// 共通: 時刻ドラッグ(ローカルプレビュー → pointerupで1回commit)
// ---------------------------------------------------------------------------

interface DragArgs {
  startValue: number; // ドラッグ開始時の値(秒)
  duration: number;
  pxPerSec: () => number; // 現在のトラック幅換算(秒→px)
  candidates: readonly number[]; // スナップ候補(自分以外)
  toDelta: (dxPx: number) => number; // px差 → 秒差
  onPreview: (v: number | null) => void; // プレビュー値(null=確定/解除)
  onCommit: (v: number) => void; // pointerup 1回
}

// pointerdown ハンドラを生成。3px未満の移動はクリック扱いで onCommit を呼ばない。
function makeTimeDrag(args: DragArgs) {
  return (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let moved = false;
    let preview = args.startValue;

    const onMove = (me: PointerEvent) => {
      const dxPx = me.clientX - startX;
      if (!moved && Math.abs(dxPx) >= 3) moved = true;
      const raw = args.startValue + args.toDelta(dxPx);
      const snapped = snapTime(raw, args.candidates, args.pxPerSec());
      preview = clampTime(snapped, args.duration);
      args.onPreview(preview);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      args.onPreview(null);
      if (moved) args.onCommit(preview);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
}

// 顔ミニアイコン(表情キー用)。renderCharacter は同期解決なので then で反映
function useFaceThumb(
  char: CharacterDoc | null,
  preset: string,
  thumbs: ThumbnailService | null,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!char || !thumbs) return;
    let live = true;
    void thumbs
      .renderCharacter(char, { expression: preset, face: true, w: 20, h: 20 })
      .then((u) => {
        if (live) setUrl(u);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [char, preset, thumbs]);
  return url;
}

// ---------------------------------------------------------------------------
// 1要素ぶんのレーン
// ---------------------------------------------------------------------------

interface LaneProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  el: SceneElement;
  duration: number;
  selected: boolean;
  onSelect: (id: string) => void;
  pxPerSec: () => number;
  resolver: AssetResolver;
  thumbs: ThumbnailService | null;
  onScrubEmpty: (e: React.PointerEvent) => void; // レーン余白のスクラブ
}

export function ElementLane(props: LaneProps) {
  const { el, duration, selected, onSelect, onScrubEmpty } = props;
  const pct = (time: number) => `${(clampTime(time, duration) / duration) * 100}%`;

  return (
    <div
      className={`tl-lane${selected ? " tl-lane--sel" : ""}`}
      style={{ display: "flex", alignItems: "center", height: LANE_H }}
    >
      {/* レーンヘッダ */}
      <div
        className="tl-lanehead"
        onClick={() => onSelect(el.id)}
        style={{ fontWeight: selected ? 700 : 400 }}
        title={laneName(el)}
      >
        <LaneIcon el={el} />
        <span className="tl-lanename">{laneName(el)}</span>
        {el.locked && <IconLock />}
      </div>

      {/* トラック(余白はスクラブ) */}
      <div className="tl-track" onPointerDown={onScrubEmpty}>
        <EnterBlock {...props} pct={pct} />
        <ExitBlock {...props} pct={pct} />
        {el.kind === "character" && <ActionBlocks {...props} el={el} pct={pct} />}
        {el.kind === "character" && <ExpressionMarkers {...props} el={el} pct={pct} />}
        {el.kind === "character" && <TalkBlocks {...props} el={el} pct={pct} />}
      </div>
    </div>
  );
}

function laneName(el: SceneElement): string {
  switch (el.kind) {
    case "character":
      return el.ref.replace(/^.*\//, "").replace(/\.byc\.json$/, "").replace("builtin:", "");
    case "text":
      return el.text;
    case "balloon":
      return el.text;
    case "object":
      return el.src.replace(/^.*\//, "").replace(/\.(png|jpe?g|webp|svg)$/i, "");
  }
}

function LaneIcon({ el }: { el: SceneElement }) {
  switch (el.kind) {
    case "character":
      return <IconCharacter />;
    case "text":
      return <IconText />;
    case "balloon":
      return <IconBalloon />;
    case "object":
      return <IconBackground />;
  }
}

// ---------------------------------------------------------------------------
// アクションブロック群
// ---------------------------------------------------------------------------

interface BlockProps extends LaneProps {
  el: CharacterElement;
  pct: (time: number) => string;
}

function ActionBlocks(props: BlockProps) {
  const { store, sceneId, el, duration, pxPerSec, pct } = props;
  const [preview, setPreview] = useState<{ index: number; t: number } | null>(null);

  const origin: [number, number] = [el.transform.x, el.transform.y];
  const blocks = actionBlocks(origin, el.actions, duration);

  return (
    <>
      {blocks.map((b) => {
        const isDrag = preview?.index === b.index;
        const t = isDrag ? preview!.t : b.t;
        // ドラッグ中は end も追従させて見た目を保つ(隣接ブロックは元のまま)
        const left = pct(t);
        const widthPct = `${(Math.max(0, b.end - t) / duration) * 100}%`;
        const arrivalShift = b.arrival - b.t; // moveTo帯の長さ(秒)
        const arrivalT = t + arrivalShift;

        const others = allOtherTimes(el, { action: b.index });
        const onDown = makeTimeDrag({
          startValue: b.t,
          duration,
          pxPerSec,
          candidates: snapCandidates(others, duration),
          toDelta: (dxPx) => dxPx / pxPerSec(),
          onPreview: (v) => setPreview(v === null ? null : { index: b.index, t: v }),
          onCommit: (v) => updateAction(store, sceneId, el.id, b.index, { t: v }),
        });

        return (
          <div
            key={b.index}
            className="tl-block"
            onPointerDown={onDown}
            title={`${CLIPS[b.clip]?.label ?? b.clip} t=${t.toFixed(2)}s`}
            style={{ left, width: widthPct }}
          >
            {b.hasMove && (
              <>
                {/* moveTo 走行帯(到着まで ▸ 模様) */}
                <div
                  className="tl-travel"
                  style={{ width: `${(Math.max(0, arrivalT - t) / Math.max(1e-6, b.end - t)) * 100}%` }}
                />
                {/* 到着点の縦線 */}
                <div
                  className="tl-arrival"
                  style={{ left: `${(Math.max(0, arrivalT - t) / Math.max(1e-6, b.end - t)) * 100}%` }}
                />
              </>
            )}
            <span className="tl-block__label">{CLIPS[b.clip]?.label ?? b.clip}</span>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// 表情キー(◆ + 顔ミニ)
// ---------------------------------------------------------------------------

function ExpressionMarkers(props: BlockProps) {
  const { store, sceneId, el, duration, pxPerSec, pct, resolver, thumbs } = props;
  const [preview, setPreview] = useState<{ index: number; t: number } | null>(null);
  const char = resolver.getCharacter(el.ref) ?? null;

  return (
    <>
      {el.expressions.map((ex, i) => {
        const isDrag = preview?.index === i;
        const t = isDrag ? preview!.t : ex.t;
        // 候補: 他キー全般(allOtherTimes は全 expressions を含むので自分の t を1つ除く)
        const others = allOtherTimes(el, "none");
        const selfIdx = others.indexOf(ex.t);
        if (selfIdx !== -1) others.splice(selfIdx, 1);
        const onDown = makeTimeDrag({
          startValue: ex.t,
          duration,
          pxPerSec,
          candidates: snapCandidates(others, duration),
          toDelta: (dxPx) => dxPx / pxPerSec(),
          onPreview: (v) => setPreview(v === null ? null : { index: i, t: v }),
          onCommit: (v) => updateExpressionKey(store, sceneId, el.id, i, { t: v }),
        });
        return (
          <ExpressionMarker
            key={i}
            left={pct(t)}
            preset={ex.preset}
            char={char}
            thumbs={thumbs}
            tLabel={t}
            onDown={onDown}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// セリフ音声ブロック(レーン下半分・幅=音声長。ドラッグでt)
// ---------------------------------------------------------------------------

function TalkBlocks(props: BlockProps) {
  const { store, sceneId, el, duration, pxPerSec, pct, resolver } = props;
  const [preview, setPreview] = useState<{ index: number; t: number } | null>(null);

  return (
    <>
      {el.talks.map((talk, i) => {
        const isDrag = preview?.index === i;
        const t = isDrag ? preview!.t : talk.t;
        // 未ロード時は 0.5s 仮幅。ロード後は実音声長
        const dur = resolver.getAudio(talk.audio)?.duration ?? 0.5;
        const widthPct = `${(Math.max(0.05, dur) / duration) * 100}%`;

        // 候補: 他キー全般 + 自分以外のtalk
        const others = allOtherTimes(el, "none");
        el.talks.forEach((o, j) => {
          if (j !== i) others.push(o.t);
        });
        const onDown = makeTimeDrag({
          startValue: talk.t,
          duration,
          pxPerSec,
          candidates: snapCandidates(others, duration),
          toDelta: (dxPx) => dxPx / pxPerSec(),
          onPreview: (v) => setPreview(v === null ? null : { index: i, t: v }),
          onCommit: (v) => updateTalk(store, sceneId, el.id, i, { t: v }),
        });

        return (
          <div
            key={i}
            className="tl-talk"
            onPointerDown={onDown}
            title={`🔊 ${audioLabel(talk.audio)} t=${t.toFixed(2)}s`}
            style={{ left: pct(t), width: widthPct }}
          >
            <span className="tl-talk__label">🔊 {audioLabel(talk.audio)}</span>
          </div>
        );
      })}
    </>
  );
}

function ExpressionMarker({
  left,
  preset,
  char,
  thumbs,
  tLabel,
  onDown,
}: {
  left: string;
  preset: string;
  char: CharacterDoc | null;
  thumbs: ThumbnailService | null;
  tLabel: number;
  onDown: (e: React.PointerEvent) => void;
}) {
  const url = useFaceThumb(char, preset, thumbs);
  const def = EXPRESSION_PRESETS[preset];
  return (
    <div
      className="tl-exkey"
      onPointerDown={onDown}
      title={`${def?.label ?? preset} t=${tLabel.toFixed(2)}s`}
      style={{ left }}
    >
      <span className="tl-diamond" />
      {url ? (
        <img className="tl-face" src={url} width={20} height={20} alt={def?.label ?? preset} />
      ) : (
        <span className="tl-facechar">{(def?.label ?? preset).charAt(0)}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// enter / exit ブロック
// ---------------------------------------------------------------------------

interface EeProps extends LaneProps {
  pct: (time: number) => string;
}

function EnterBlock(props: EeProps) {
  const { store, sceneId, el, duration, pxPerSec, pct } = props;
  const [preview, setPreview] = useState<{ delay?: number; dur?: number } | null>(null);

  const delay = preview?.delay ?? el.enter.delay;
  const dur = preview?.dur ?? el.enter.dur;
  const isCut = el.enter.type === "cut";

  // 本体ドラッグ = delay
  const others = allOtherTimes(el, "enter");
  const onBodyDown = makeTimeDrag({
    startValue: el.enter.delay,
    duration,
    pxPerSec,
    candidates: snapCandidates(others, duration),
    toDelta: (dxPx) => dxPx / pxPerSec(),
    onPreview: (v) => setPreview(v === null ? null : { delay: v }),
    onCommit: (v) => setElementEnter(store, sceneId, el.id, { delay: v }),
  });
  // 右端ドラッグ = dur(delay+dur をドラッグし dur を逆算)
  const onEdgeDown = makeTimeDrag({
    startValue: el.enter.delay + el.enter.dur,
    duration,
    pxPerSec,
    candidates: snapCandidates(others, duration),
    toDelta: (dxPx) => dxPx / pxPerSec(),
    onPreview: (v) => setPreview(v === null ? null : { dur: Math.max(0, v - el.enter.delay) }),
    onCommit: (v) => setElementEnter(store, sceneId, el.id, { dur: Math.max(0, v - el.enter.delay) }),
  });

  if (isCut) {
    // cut は dur=0 扱いの細線(delayのみドラッグ可)
    return (
      <div
        className="tl-edge tl-edge--enter"
        onPointerDown={onBodyDown}
        title={`登場(カット) delay=${delay.toFixed(2)}s`}
        style={{ left: pct(delay) }}
      />
    );
  }

  return (
    <div
      className="tl-ee tl-ee--enter"
      onPointerDown={onBodyDown}
      title={`登場 ${el.enter.type} delay=${delay.toFixed(2)}s dur=${dur.toFixed(2)}s`}
      style={{ left: pct(delay), width: `${(Math.max(0, dur) / duration) * 100}%` }}
    >
      <div className="tl-ee__handle tl-ee__handle--r" onPointerDown={onEdgeDown} />
    </div>
  );
}

function ExitBlock(props: EeProps) {
  const { store, sceneId, el, duration, pxPerSec, pct } = props;
  const [preview, setPreview] = useState<{ at?: number; dur?: number } | null>(null);

  const at = el.exit.at;
  if (at === null) return null; // 退場時刻なしは非表示

  const curAt = preview?.at ?? at;
  const dur = preview?.dur ?? el.exit.dur;
  const isCut = el.exit.type === "cut";

  const others = allOtherTimes(el, "exit");
  const onBodyDown = makeTimeDrag({
    startValue: at,
    duration,
    pxPerSec,
    candidates: snapCandidates(others, duration),
    toDelta: (dxPx) => dxPx / pxPerSec(),
    onPreview: (v) => setPreview(v === null ? null : { at: v }),
    onCommit: (v) => setElementExit(store, sceneId, el.id, { at: v }),
  });
  const onEdgeDown = makeTimeDrag({
    startValue: at + el.exit.dur,
    duration,
    pxPerSec,
    candidates: snapCandidates(others, duration),
    toDelta: (dxPx) => dxPx / pxPerSec(),
    onPreview: (v) => setPreview(v === null ? null : { dur: Math.max(0, v - at) }),
    onCommit: (v) => setElementExit(store, sceneId, el.id, { dur: Math.max(0, v - at) }),
  });

  if (isCut) {
    return (
      <div
        className="tl-edge tl-edge--exit"
        onPointerDown={onBodyDown}
        title={`退場(カット) at=${curAt.toFixed(2)}s`}
        style={{ left: pct(curAt) }}
      />
    );
  }

  return (
    <div
      className="tl-ee tl-ee--exit"
      onPointerDown={onBodyDown}
      title={`退場 ${el.exit.type} at=${curAt.toFixed(2)}s dur=${dur.toFixed(2)}s`}
      style={{ left: pct(curAt), width: `${(Math.max(0, dur) / duration) * 100}%` }}
    >
      <div className="tl-ee__handle tl-ee__handle--r" onPointerDown={onEdgeDown} />
    </div>
  );
}

// この要素の「自分以外」のキー時刻を集める(スナップ候補)。
// exclude で除外対象を指定(ドラッグ中の値自身を候補に入れない)。
type ExcludeKey = "enter" | "exit" | { action: number } | "none";

function allOtherTimes(el: SceneElement, exclude: ExcludeKey): number[] {
  const out: number[] = [];
  if (exclude !== "enter" && el.enter.delay > 0) out.push(el.enter.delay);
  if (exclude !== "exit" && el.exit.at !== null) out.push(el.exit.at);
  if (el.kind === "character") {
    el.actions.forEach((a, i) => {
      if (typeof exclude === "object" && exclude.action === i) return;
      out.push(a.t);
    });
    for (const ex of el.expressions) out.push(ex.t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// カメラレーン(◆ドラッグでt / クリックで要素選択解除+そのtへスクラブ)
// ---------------------------------------------------------------------------

interface CameraLaneProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  camera: readonly CameraKey[];
  duration: number;
  pxPerSec: () => number;
  onScrubEmpty: (e: React.PointerEvent) => void;
  onPickKey: (t: number) => void; // クリック: 要素選択解除 + tへ
}

export function CameraLane(props: CameraLaneProps) {
  const { store, sceneId, camera, duration, pxPerSec, onScrubEmpty, onPickKey } = props;
  const [preview, setPreview] = useState<{ index: number; t: number } | null>(null);
  const pct = (time: number) => `${(clampTime(time, duration) / duration) * 100}%`;

  return (
    <div className="tl-lane" style={{ display: "flex", alignItems: "center", height: LANE_H }}>
      <div className="tl-lanehead" title="カメラ">
        <IconCamera />
        <span className="tl-lanename">カメラ</span>
      </div>
      <div className="tl-track tl-track--cam" onPointerDown={onScrubEmpty}>
        {camera.map((k, i) => {
          const isDrag = preview?.index === i;
          const t = isDrag ? preview!.t : k.t;
          const others = camera.filter((_, j) => j !== i).map((c) => c.t);
          // ドラッグ or クリックを兼ねるハンドラ
          const onDown = (e: React.PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            let moved = false;
            let pv = k.t;
            const onMove = (me: PointerEvent) => {
              const dxPx = me.clientX - startX;
              if (!moved && Math.abs(dxPx) >= 3) moved = true;
              const raw = k.t + dxPx / pxPerSec();
              pv = clampTime(snapTime(raw, snapCandidates(others, duration), pxPerSec()), duration);
              setPreview({ index: i, t: pv });
            };
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              setPreview(null);
              if (moved) updateCameraKey(store, sceneId, i, { t: pv });
              else onPickKey(k.t); // クリック扱い
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          };
          return (
            <div
              key={i}
              className="tl-camkey"
              onPointerDown={onDown}
              title={`カメラ t=${t.toFixed(2)}s zoom=${k.zoom}`}
              style={{ left: pct(t) }}
            >
              <span className="tl-diamond tl-diamond--cam" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

