import { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import type { DocStore } from "../../core/doc-store.js";
import type { CharacterDoc } from "../../core/schema/character.js";
import {
  computeBoneWorld,
  buildRenderList,
  headDecalMatrix,
} from "../../runtime/pose.js";
import {
  buildCharacterContainer,
  CharacterView,
} from "../../render/character-pixi.js";
import { HairSimulator } from "../../runtime/hair-physics.js";
import {
  blinkAt,
  EXPRESSION_PRESETS,
  resolveFace,
} from "../../runtime/expression.js";
import { mulberry32 } from "../../runtime/rand.js";
import { ClipPlayer } from "../../runtime/clip-player.js";
import { CLIPS, CLIP_ORDER } from "../../presets/clips/index.js";
import { POSES } from "./poses.js";

const PREVIEW_W = 260;
const PREVIEW_H = 340;
const GROUND_Y = 300;
const SCALE = 0.43;
const MULTI_W = 1000;
const MULTI_H = 360;
const MULTI_GROUND_Y = 320;
const MULTI_SCALE = 0.43;

interface Props {
  charStore: DocStore<CharacterDoc>;
}

type Mode = { kind: "pose"; index: number } | { kind: "clip"; id: string };

interface PreviewState {
  mode: Mode;
  expression: string;
  blinkOn: boolean;
}

export function PosePreview({ charStore }: Props) {
  const singleRef = useRef<HTMLDivElement>(null);
  const multiRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>({ kind: "pose", index: 0 });
  const [clipSel, setClipSel] = useState<string>("walk");
  const [flip, setFlip] = useState(false);
  const [expression, setExpression] = useState("neutral");
  const [blinkOn, setBlinkOn] = useState(true);
  const [multiMode, setMultiMode] = useState(false);
  const [zoomUp, setZoomUp] = useState(false); // 上半身ズーム(表情・髪の確認用)

  // ticker内から最新状態を読むためのref(effect再実行を避ける)
  const stRef = useRef<PreviewState & { zoomUp: boolean; flip: boolean }>({ mode, expression, blinkOn, zoomUp, flip });
  stRef.current = { mode, expression, blinkOn, zoomUp, flip };

  // 単体プレビュー(静止/アニメ共通の常駐ループ)
  useEffect(() => {
    const host = singleRef.current;
    if (!host || multiMode) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      await app.init({
        width: PREVIEW_W,
        height: PREVIEW_H,
        background: "#f4f1ec",
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      const view = new CharacterView();
      app.stage.addChild(view.container);
      const applyCamera = () => {
        const sx = stRef.current.zoomUp ? 0.85 : SCALE;
        if (stRef.current.zoomUp) {
          // 上半身: 頭頂(-348)〜腰(+50)あたりをフレーミング
          view.container.position.set(PREVIEW_W / 2, 306);
        } else {
          view.container.position.set(PREVIEW_W / 2, GROUND_Y - 310 * SCALE);
        }
        view.container.scale.set(stRef.current.flip ? -sx : sx, sx);
      };
      applyCamera();

      let t = 0;
      let sim: HairSimulator | null = null;
      let simDocRev = -1;
      const player = new ClipPlayer();
      const blinkSchedule: number[] = [];
      const rng = mulberry32(7);

      const unsub = charStore.subscribe(() => {
        simDocRev = -1; // doc変更で物理を作り直す
      });

      app.ticker.add(() => {
        applyCamera();
        const st = stRef.current;
        const doc = charStore.doc;
        const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 15);
        t += dt;

        const blink = st.blinkOn ? blinkAt(t, rng, blinkSchedule) : 0;
        const face = resolveFace(doc, { preset: st.expression, blink });

        if (st.mode.kind === "clip") {
          const clip = CLIPS[st.mode.id];
          if (clip && player.currentClipId !== clip.id) {
            player.play(clip, t);
          }
          if (!sim || simDocRev !== charStore.revision) {
            sim = new HairSimulator(doc);
            simDocRev = charStore.revision;
          }
          const frame = player.evaluate(t);
          if (frame) {
            const bones = computeBoneWorld(doc, frame.pose);
            const hm = headDecalMatrix(bones);
            const vv = st.flip ? -frame.virtualVelocity : frame.virtualVelocity;
            if (hm) sim.step(hm, dt, [vv, 0]);
            const items = buildRenderList(doc, bones, {
              face,
              hairDeform: sim.getDeforms(),
              handShape: frame.handShape,
            });
            view.update(doc, items);
          }
        } else {
          sim = null;
          player.stop();
          const def = POSES[st.mode.index] ?? POSES[0]!;
          const bones = computeBoneWorld(doc, def.pose);
          const items = buildRenderList(doc, bones, {
            face,
            handShape: def.handShape,
          });
          view.update(doc, items);
        }
      });

      return unsub;
    })();

    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiMode, charStore]);

  // 4ポーズ一覧(静止)
  useEffect(() => {
    const host = multiRef.current;
    if (!host || !multiMode) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      await app.init({
        width: MULTI_W,
        height: MULTI_H,
        background: "#f4f1ec",
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      const rebuild = () => {
        app.stage.removeChildren();
        const char = charStore.doc;
        const face = resolveFace(char, { preset: stRef.current.expression });
        POSES.forEach((def, i) => {
          const bones = computeBoneWorld(char, def.pose);
          const items = buildRenderList(char, bones, { face, handShape: def.handShape });
          const c = buildCharacterContainer(char, items);
          c.position.set(130 + i * 185, MULTI_GROUND_Y - 310 * MULTI_SCALE);
          c.scale.set(MULTI_SCALE);
          app.stage.addChild(c);
        });
      };

      rebuild();
      const unsub = charStore.subscribe(rebuild);
      return unsub;
    })();

    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiMode, charStore, expression]);

  const chip = (active: boolean) => ({
    padding: "2px 8px",
    fontSize: "11px",
    background: active ? "#5B7DB1" : "#eee",
    color: active ? "#fff" : "#333",
    border: "1px solid #ccc",
    borderRadius: "3px",
    cursor: "pointer",
  });

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "4px", flexWrap: "wrap" }}>
        {POSES.map((p, i) => (
          <button
            key={p.label}
            onClick={() => { setMultiMode(false); setMode({ kind: "pose", index: i }); }}
            style={chip(!multiMode && mode.kind === "pose" && mode.index === i)}
          >
            {p.label}
          </button>
        ))}
        <button onClick={() => setMultiMode((m) => !m)} style={chip(multiMode)}>
          4ポーズ
        </button>
      </div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "4px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "#888" }}>アニメ:</span>
        <select
          value={clipSel}
          onChange={(e) => {
            setClipSel(e.target.value);
            // 再生中なら即座に切替(クロスフェード遷移)
            if (mode.kind === "clip") setMode({ kind: "clip", id: e.target.value });
          }}
          style={{ fontSize: "11px" }}
        >
          {CLIP_ORDER.map((id) => (
            <option key={id} value={id}>{CLIPS[id]?.label ?? id}</option>
          ))}
        </select>
        <button
          onClick={() => { setMultiMode(false); setMode({ kind: "clip", id: clipSel }); }}
          style={chip(!multiMode && mode.kind === "clip")}
        >
          ▶再生
        </button>
        <button
          onClick={() => setMode({ kind: "pose", index: 0 })}
          style={chip(false)}
        >
          ⏹停止
        </button>
        <label style={{ fontSize: "11px", color: "#555", display: "flex", alignItems: "center", gap: "2px" }}>
          <input
            type="checkbox"
            checked={flip}
            onChange={(e) => setFlip(e.target.checked)}
          />
          反転
        </label>
      </div>
      <div style={{ display: "flex", gap: "6px", marginBottom: "4px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "#888" }}>表情:</span>
        <select
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          style={{ fontSize: "11px" }}
        >
          {Object.entries(EXPRESSION_PRESETS).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>
        <label style={{ fontSize: "11px", color: "#555", display: "flex", alignItems: "center", gap: "2px" }}>
          <input
            type="checkbox"
            checked={blinkOn}
            onChange={(e) => setBlinkOn(e.target.checked)}
          />
          まばたき
        </label>
        <button onClick={() => setZoomUp((z) => !z)} style={chip(zoomUp)}>
          上半身
        </button>
      </div>
      {!multiMode && <div ref={singleRef} />}
      {multiMode && <div ref={multiRef} />}
    </div>
  );
}
