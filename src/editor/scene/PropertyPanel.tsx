import { useEffect, useRef, useState } from "react";
import type { DocStore } from "../../core/doc-store.js";
import type {
  BalloonElement,
  Bgm,
  EffectType,
  ProjectDoc,
  SceneDoc,
  SceneElement,
  Talk,
  Transition,
} from "../../core/schema/project.js";
import type { CharacterDoc } from "../../core/schema/character.js";
import type { AssetResolver } from "../../io/asset-resolver.js";
import type { FileSystemAdapter } from "../../io/fs.js";
import type { ThumbnailService } from "../thumbs/thumbnail-service.js";
import { EXPRESSION_PRESETS } from "../../runtime/expression.js";
import { evaluateCamera } from "../../runtime/scene-eval.js";
import { EASINGS } from "../../runtime/easing.js";
import { CLIPS } from "../../presets/clips/index.js";
import {
  addAction,
  addCameraKey,
  addExpressionKey,
  addTalk,
  removeAction,
  removeCameraKey,
  removeExpressionKey,
  removeTalk,
  setBalloonProps,
  setBgm,
  setElementEnter,
  setElementExit,
  setElementLocked,
  setElementZ,
  setSceneTransition,
  setTextProps,
  sitCharacterOnObject,
  updateAction,
  updateCameraKey,
  updateElementTransform,
  updateExpressionKey,
  updateTalk,
} from "../../core/commands-project.js";
import { audioLabel, listAudioOptions } from "./audio-options.js";
import { getObjectSeat, objectLabel } from "./objects-catalog.js";
import { spriteClipLabel } from "../newchar/sprite-clips.js";
import { Section } from "../ui/Section.js";
import { SegmentedButtons } from "../ui/SegmentedButtons.js";
import { Popover } from "../ui/Popover.js";
import { ExpressionPicker } from "../ui/ExpressionPicker.js";
import { ClipPicker } from "../ui/ClipPicker.js";
import { IconLock, IconUnlock } from "../ui/icons.js";

interface Props {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  scene: SceneDoc;
  element: SceneElement | null;
  t: number;
  resolver: AssetResolver;
  thumbs: ThumbnailService | null;
  fs: FileSystemAdapter | null;
}

// 音声選択肢を非同期ロードして提供する共有フック
function useAudioOptions(fs: FileSystemAdapter | null): string[] {
  const [opts, setOpts] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void listAudioOptions(fs).then((o) => {
      if (live) setOpts(o);
    });
    return () => {
      live = false;
    };
  }, [fs]);
  return opts;
}

const TRANS_TYPES: Transition["type"][] = ["cut", "fade", "wipe", "slide"];
const TRANS_LABEL: Record<Transition["type"], string> = {
  cut: "カット",
  fade: "フェード",
  wipe: "ワイプ",
  slide: "スライド",
};
const EASING_NAMES = Object.keys(EASINGS);

const EFFECTS: EffectType[] = ["cut", "fade", "slideL", "slideR", "slideT", "slideB", "pop"];
const EFFECT_LABEL: Record<EffectType, string> = {
  cut: "✂",
  fade: "◐",
  slideL: "←",
  slideR: "→",
  slideT: "↑",
  slideB: "↓",
  pop: "◎",
};
const EFFECT_TITLE: Record<EffectType, string> = {
  cut: "カット",
  fade: "フェード",
  slideL: "左から",
  slideR: "右から",
  slideT: "上から",
  slideB: "下から",
  pop: "ポップ",
};

const KIND_LABEL: Record<SceneElement["kind"], string> = {
  character: "キャラクター",
  text: "テキスト",
  balloon: "吹き出し",
  object: "オブジェクト",
};

export function PropertyPanel({ store, sceneId, scene, element, t, resolver, thumbs, fs }: Props) {
  if (!element) {
    return <SceneSettings store={store} sceneId={sceneId} scene={scene} t={t} fs={fs} />;
  }
  const id = element.id;
  const tf = element.transform;

  if (element.locked) {
    return (
      <div style={{ padding: "8px", fontSize: "12px", color: "var(--text)" }}>
        <div style={{ fontWeight: 700, marginBottom: "6px", color: "var(--text-dim)" }}>
          {KIND_LABEL[element.kind]}
        </div>
        <div style={{ margin: "8px 0", color: "var(--warn)", display: "flex", alignItems: "center", gap: "6px" }}>
          <IconLock />
          ロック中
        </div>
        <button
          className="ui-btn"
          onClick={() => setElementLocked(store, sceneId, id, false)}
        >
          <IconUnlock /> ロック解除
        </button>
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", height: "100%", background: "var(--bg-panel)", color: "var(--text)" }}>
      <div style={{ padding: "6px 8px", fontWeight: 700, fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {KIND_LABEL[element.kind]}
      </div>

      {/* 配置 */}
      <Section title="配置" defaultOpen={true}>
        <div className="ui-row">
          <label>X</label>
          <input
            type="number"
            className="ui-num"
            value={Math.round(tf.x)}
            onChange={(e) => updateElementTransform(store, sceneId, id, { x: Number(e.target.value) })}
          />
          <label>Y</label>
          <input
            type="number"
            className="ui-num"
            value={Math.round(tf.y)}
            onChange={(e) => updateElementTransform(store, sceneId, id, { y: Number(e.target.value) })}
          />
        </div>
        <div className="ui-row">
          <label>拡大</label>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.05"
            value={tf.scale}
            style={{ flex: 1 }}
            onChange={(e) => updateElementTransform(store, sceneId, id, { scale: Number(e.target.value) })}
          />
          <span style={{ color: "var(--text-dim)", fontSize: "11px", minWidth: "32px" }}>{tf.scale.toFixed(2)}</span>
        </div>
        <div className="ui-row">
          {element.kind === "character" && (
            <label style={{ display: "flex", alignItems: "center", gap: "3px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={tf.flipX}
                onChange={(e) => updateElementTransform(store, sceneId, id, { flipX: e.target.checked })}
              />
              左右反転
            </label>
          )}
          <label>Z</label>
          <input
            type="number"
            className="ui-num"
            value={element.z}
            onChange={(e) => setElementZ(store, sceneId, id, Number(e.target.value))}
          />
          <button
            className="ui-btn"
            onClick={() => setElementLocked(store, sceneId, id, true)}
            title="ロック"
          >
            <IconLock />
          </button>
        </div>
      </Section>

      {/* 登場/退場 */}
      <Section title="登場・退場" defaultOpen={true}>
        <div className="ui-row" style={{ flexWrap: "wrap", gap: "4px" }}>
          <label style={{ minWidth: "28px" }}>登場</label>
          <SegmentedButtons
            value={element.enter.type}
            options={EFFECTS.map((ef) => ({
              value: ef,
              label: EFFECT_LABEL[ef],
              title: EFFECT_TITLE[ef],
            }))}
            onChange={(v) => setElementEnter(store, sceneId, id, { type: v })}
          />
        </div>
        <div className="ui-row">
          <label>遅延</label>
          <input
            type="number"
            step="0.1"
            min="0"
            className="ui-num"
            style={{ width: "48px" }}
            value={element.enter.delay}
            onChange={(e) => setElementEnter(store, sceneId, id, { delay: Number(e.target.value) })}
          />
          <label>長</label>
          <input
            type="number"
            step="0.1"
            min="0"
            className="ui-num"
            style={{ width: "48px" }}
            value={element.enter.dur}
            onChange={(e) => setElementEnter(store, sceneId, id, { dur: Number(e.target.value) })}
          />
        </div>
        <div className="ui-row" style={{ flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
          <label style={{ minWidth: "28px" }}>退場</label>
          <SegmentedButtons
            value={element.exit.type}
            options={EFFECTS.map((ef) => ({
              value: ef,
              label: EFFECT_LABEL[ef],
              title: EFFECT_TITLE[ef],
            }))}
            onChange={(v) => setElementExit(store, sceneId, id, { type: v })}
          />
        </div>
        <div className="ui-row">
          <label style={{ display: "flex", alignItems: "center", gap: "3px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={element.exit.at !== null}
              onChange={(e) =>
                setElementExit(store, sceneId, id, { at: e.target.checked ? 3 : null })
              }
            />
            退場時刻
          </label>
          {element.exit.at !== null && (
            <input
              type="number"
              step="0.1"
              min="0"
              className="ui-num"
              style={{ width: "48px" }}
              value={element.exit.at}
              onChange={(e) => setElementExit(store, sceneId, id, { at: Number(e.target.value) })}
            />
          )}
          <label>長</label>
          <input
            type="number"
            step="0.1"
            min="0"
            className="ui-num"
            style={{ width: "48px" }}
            value={element.exit.dur}
            onChange={(e) => setElementExit(store, sceneId, id, { dur: Number(e.target.value) })}
          />
        </div>
      </Section>

      {element.kind === "character" && (
        <CharacterSections
          store={store}
          sceneId={sceneId}
          scene={scene}
          element={element}
          resolver={resolver}
          thumbs={thumbs}
          fs={fs}
        />
      )}
      {element.kind === "text" && (
        <TextSection store={store} sceneId={sceneId} element={element} />
      )}
      {element.kind === "balloon" && (
        <BalloonSection store={store} sceneId={sceneId} element={element} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// キャラ: アクション / 表情
// ---------------------------------------------------------------------------

interface CharacterSectionsProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  scene: SceneDoc;
  element: Extract<SceneElement, { kind: "character" }>;
  resolver: AssetResolver;
  thumbs: ThumbnailService | null;
  fs: FileSystemAdapter | null;
}

function CharacterSections({ store, sceneId, scene, element, resolver, thumbs, fs }: CharacterSectionsProps) {
  const id = element.id;
  const char: CharacterDoc | undefined = resolver.getCharacter(element.ref);
  const audioOptions = useAudioOptions(fs);
  // 新キャラ(スプライト)判定。アクション選択UI・着座系はスプライト専用クリップを使う
  const isSprite = resolver.getSpriteCharacter?.(element.ref) != null;
  // 座れる家具(座面アンカー持ち)を x 近接順で探す
  const seatables = scene.elements
    .filter(
      (e): e is Extract<SceneElement, { kind: "object" }> =>
        e.kind === "object" && getObjectSeat(e.src) != null,
    )
    .sort((a, b) => Math.abs(a.transform.x - element.transform.x) - Math.abs(b.transform.x - element.transform.x));

  return (
    <>
      {/* 家具に座る(スプライトキャラのみ) */}
      {isSprite && (
        <Section title="家具に座る" defaultOpen={true}>
          {seatables.length === 0 ? (
            <div style={{ color: "var(--text-dim)", fontSize: "11px" }}>
              座れる家具がシーンにありません
            </div>
          ) : (
            <>
              <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "4px" }}>
                座面に合わせて配置し、腰を下ろす動きを付けます
              </div>
              {seatables.map((obj) => (
                <div key={obj.id} style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                  <button
                    className="ui-btn"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => {
                      const seat = getObjectSeat(obj.src);
                      if (seat) sitCharacterOnObject(store, sceneId, id, obj.id, seat);
                    }}
                    title={`${objectLabel(obj.src)}の座面に座らせる`}
                  >
                    {objectLabel(obj.src)}に座る
                  </button>
                  <button
                    className="ui-btn"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => {
                      const seat = getObjectSeat(obj.src);
                      if (seat) sitCharacterOnObject(store, sceneId, id, obj.id, seat, true);
                    }}
                    title="座らせて『座って話す』所作まで付ける(セリフ音声は別途)"
                  >
                    座って話す
                  </button>
                </div>
              ))}
            </>
          )}
        </Section>
      )}

      {/* アクション */}
      <Section title="アクション" defaultOpen={true}>
        {element.actions.map((a, i) => (
          <ActionRow
            key={i}
            store={store}
            sceneId={sceneId}
            elementId={id}
            action={a}
            index={i}
            char={char ?? null}
            thumbs={thumbs}
            isSprite={isSprite}
          />
        ))}
        <button
          className="ui-btn"
          style={{ marginTop: "4px", width: "100%", justifyContent: "center" }}
          onClick={() => addAction(store, sceneId, id, { t: 0, clip: "wave", speed: 1 })}
        >
          + アクション
        </button>
      </Section>

      {/* 表情 */}
      <Section title="表情" defaultOpen={true}>
        {element.expressions.map((ex, i) => (
          <ExpressionRow
            key={i}
            store={store}
            sceneId={sceneId}
            elementId={id}
            exKey={ex}
            index={i}
            char={char ?? null}
            thumbs={thumbs}
          />
        ))}
        <button
          className="ui-btn"
          style={{ marginTop: "4px", width: "100%", justifyContent: "center" }}
          onClick={() => addExpressionKey(store, sceneId, id, { t: 0, preset: "smile" })}
        >
          + 表情キー
        </button>
      </Section>

      {/* セリフ音声 */}
      <Section title="セリフ音声" defaultOpen={true}>
        {element.talks.map((talk, i) => (
          <TalkRow
            key={i}
            store={store}
            sceneId={sceneId}
            elementId={id}
            talk={talk}
            index={i}
            options={audioOptions}
          />
        ))}
        <button
          className="ui-btn"
          style={{ marginTop: "4px", width: "100%", justifyContent: "center" }}
          disabled={audioOptions.length === 0}
          onClick={() => {
            const first = audioOptions[0];
            if (first) addTalk(store, sceneId, id, { t: 0, audio: first, gain: 1 });
          }}
        >
          + セリフ音声
        </button>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// セリフ音声行
// ---------------------------------------------------------------------------

interface TalkRowProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  elementId: string;
  talk: Talk;
  index: number;
  options: string[];
}

function TalkRow({ store, sceneId, elementId, talk, index: i, options }: TalkRowProps) {
  // 選択肢に無いパス(プロジェクト固有等)も値として保持できるよう補う
  const opts = options.includes(talk.audio) ? options : [talk.audio, ...options];
  return (
    <div className="ui-row" style={{ marginBottom: "4px" }}>
      <label>t</label>
      <input
        type="number"
        step="0.1"
        min="0"
        className="ui-num"
        style={{ width: "44px" }}
        value={talk.t}
        onChange={(e) => updateTalk(store, sceneId, elementId, i, { t: Number(e.target.value) })}
      />
      <select
        className="ui-input"
        style={{ flex: 1, fontSize: "11px", minWidth: 0 }}
        value={talk.audio}
        onChange={(e) => updateTalk(store, sceneId, elementId, i, { audio: e.target.value })}
      >
        {opts.map((p) => (
          <option key={p} value={p}>
            {audioLabel(p)}
          </option>
        ))}
      </select>
      <button
        className="ui-btn"
        onClick={() => removeTalk(store, sceneId, elementId, i)}
        title="削除"
        style={{ padding: "2px 6px" }}
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// アクション行
// ---------------------------------------------------------------------------

interface ActionRowProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  elementId: string;
  action: { t: number; clip: string; speed?: number; moveTo?: { x: number; y?: number } };
  index: number;
  char: CharacterDoc | null;
  thumbs: ThumbnailService | null;
  isSprite: boolean;
}

function ActionRow({ store, sceneId, elementId, action: a, index: i, char, thumbs, isSprite }: ActionRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const clipLabel = isSprite ? spriteClipLabel(a.clip) : (CLIPS[a.clip]?.label ?? a.clip);

  return (
    <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px", marginBottom: "4px" }}>
      <div className="ui-row">
        <label>t</label>
        <input
          type="number"
          step="0.1"
          min="0"
          className="ui-num"
          style={{ width: "48px" }}
          value={a.t}
          onChange={(e) => updateAction(store, sceneId, elementId, i, { t: Number(e.target.value) })}
        />
        <button
          ref={anchorRef}
          className="ui-btn"
          style={{ flex: 1, justifyContent: "flex-start", overflow: "hidden" }}
          onClick={() => setPickerOpen((o) => !o)}
        >
          {clipLabel}
        </button>
        <button
          className="ui-btn ui-btn--danger"
          onClick={() => removeAction(store, sceneId, elementId, i)}
          title="削除"
          style={{ padding: "2px 6px" }}
        >
          ×
        </button>
      </div>
      <Popover anchorEl={anchorRef.current} open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <ClipPicker
          char={char}
          value={a.clip}
          thumbs={thumbs}
          isSprite={isSprite}
          onPick={(clipId) => {
            updateAction(store, sceneId, elementId, i, { clip: clipId });
            setPickerOpen(false);
          }}
        />
      </Popover>
      <div className="ui-row">
        <label>移動先 X</label>
        <input
          type="number"
          className="ui-num"
          style={{ width: "52px" }}
          placeholder="—"
          value={a.moveTo?.x ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              updateAction(store, sceneId, elementId, i, { moveTo: undefined });
            } else {
              updateAction(store, sceneId, elementId, i, {
                moveTo: { x: Number(v), ...(a.moveTo?.y !== undefined ? { y: a.moveTo.y } : {}) },
              });
            }
          }}
        />
        <label>Y</label>
        <input
          type="number"
          className="ui-num"
          style={{ width: "52px" }}
          placeholder="維持"
          disabled={a.moveTo === undefined}
          value={a.moveTo?.y ?? ""}
          onChange={(e) => {
            if (a.moveTo === undefined) return;
            const v = e.target.value;
            updateAction(store, sceneId, elementId, i, {
              moveTo: v === "" ? { x: a.moveTo.x } : { x: a.moveTo.x, y: Number(v) },
            });
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 表情キー行
// ---------------------------------------------------------------------------

interface ExpressionRowProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  elementId: string;
  exKey: { t: number; preset: string };
  index: number;
  char: CharacterDoc | null;
  thumbs: ThumbnailService | null;
}

function ExpressionRow({ store, sceneId, elementId, exKey: ex, index: i, char, thumbs }: ExpressionRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const def = EXPRESSION_PRESETS[ex.preset];

  return (
    <div className="ui-row" style={{ marginBottom: "4px" }}>
      <label>t</label>
      <input
        type="number"
        step="0.1"
        min="0"
        className="ui-num"
        style={{ width: "48px" }}
        value={ex.t}
        onChange={(e) => updateExpressionKey(store, sceneId, elementId, i, { t: Number(e.target.value) })}
      />
      <button
        ref={anchorRef}
        className="ui-btn"
        style={{ flex: 1, justifyContent: "flex-start" }}
        onClick={() => setPickerOpen((o) => !o)}
      >
        {def?.label ?? ex.preset}
      </button>
      <Popover anchorEl={anchorRef.current} open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <ExpressionPicker
          char={char}
          value={ex.preset}
          thumbs={thumbs}
          onPick={(preset) => {
            updateExpressionKey(store, sceneId, elementId, i, { preset });
            setPickerOpen(false);
          }}
        />
      </Popover>
      <button
        className="ui-btn"
        onClick={() => removeExpressionKey(store, sceneId, elementId, i)}
        title="削除"
        style={{ padding: "2px 6px" }}
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// テキスト要素
// ---------------------------------------------------------------------------

interface TextSectionProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  element: Extract<SceneElement, { kind: "text" }>;
}

function TextSection({ store, sceneId, element }: TextSectionProps) {
  const id = element.id;
  return (
    <Section title="テキスト内容" defaultOpen={true}>
      <textarea
        className="ui-input"
        style={{ width: "100%", resize: "vertical", minHeight: "48px" }}
        rows={2}
        value={element.text}
        onChange={(e) => setTextProps(store, sceneId, id, { text: e.target.value })}
      />
      <div className="ui-row">
        <label>サイズ</label>
        <input
          type="number"
          className="ui-num"
          value={element.size}
          onChange={(e) => setTextProps(store, sceneId, id, { size: Number(e.target.value) })}
        />
        <label>色</label>
        <input
          type="color"
          value={element.color}
          onChange={(e) => setTextProps(store, sceneId, id, { color: e.target.value }, `el:${id}:color`)}
        />
      </div>
      <div className="ui-row">
        <label style={{ display: "flex", alignItems: "center", gap: "3px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={element.strokeColor !== null}
            onChange={(e) =>
              setTextProps(store, sceneId, id, {
                strokeColor: e.target.checked ? "#ffffff" : null,
              })
            }
          />
          縁取り
        </label>
        {element.strokeColor !== null && (
          <>
            <input
              type="color"
              value={element.strokeColor}
              onChange={(e) => setTextProps(store, sceneId, id, { strokeColor: e.target.value }, `el:${id}:strokeC`)}
            />
            <input
              type="number"
              className="ui-num"
              style={{ width: "48px" }}
              value={element.strokeWidth}
              onChange={(e) => setTextProps(store, sceneId, id, { strokeWidth: Number(e.target.value) })}
            />
          </>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 吹き出し要素
// ---------------------------------------------------------------------------

const BALLOON_SHAPES: { shape: BalloonElement["shape"]; label: string }[] = [
  { shape: "round", label: "角丸" },
  { shape: "cloud", label: "雲" },
  { shape: "spike", label: "トゲ" },
];

interface BalloonSectionProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  element: Extract<SceneElement, { kind: "balloon" }>;
}

function BalloonSection({ store, sceneId, element }: BalloonSectionProps) {
  const id = element.id;
  return (
    <Section title="吹き出し" defaultOpen={true}>
      <div className="ui-row">
        <label>形状</label>
        <SegmentedButtons
          value={element.shape}
          options={BALLOON_SHAPES.map(({ shape, label }) => ({ value: shape, label }))}
          onChange={(shape) => setBalloonProps(store, sceneId, id, { shape })}
        />
      </div>
      <textarea
        className="ui-input"
        style={{ width: "100%", resize: "vertical", minHeight: "40px", marginTop: "4px" }}
        rows={2}
        value={element.text}
        onChange={(e) => setBalloonProps(store, sceneId, id, { text: e.target.value })}
      />
      <div className="ui-row" style={{ marginTop: "4px" }}>
        <label>幅</label>
        <input
          type="number"
          className="ui-num"
          style={{ width: "52px" }}
          value={Math.round(element.w)}
          onChange={(e) => setBalloonProps(store, sceneId, id, { w: Number(e.target.value) }, `el:${id}:balloon`)}
        />
        <label>高</label>
        <input
          type="number"
          className="ui-num"
          style={{ width: "52px" }}
          value={Math.round(element.h)}
          onChange={(e) => setBalloonProps(store, sceneId, id, { h: Number(e.target.value) }, `el:${id}:balloon`)}
        />
      </div>
      <div className="ui-row">
        <label>文字</label>
        <input
          type="number"
          className="ui-num"
          value={element.size}
          onChange={(e) => setBalloonProps(store, sceneId, id, { size: Number(e.target.value) }, `el:${id}:balloon`)}
        />
      </div>
      <div className="ui-row">
        <label>地色</label>
        <input
          type="color"
          value={element.fill}
          onChange={(e) => setBalloonProps(store, sceneId, id, { fill: e.target.value }, `el:${id}:balloon`)}
        />
        <label>文字色</label>
        <input
          type="color"
          value={element.textColor}
          onChange={(e) => setBalloonProps(store, sceneId, id, { textColor: e.target.value }, `el:${id}:balloon`)}
        />
        <label>線色</label>
        <input
          type="color"
          value={element.lineColor}
          onChange={(e) => setBalloonProps(store, sceneId, id, { lineColor: e.target.value }, `el:${id}:balloon`)}
        />
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: "11px", marginTop: "2px" }}>
        しっぽ先端はステージ上の白丸をドラッグ
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 要素未選択時: シーン設定
// ---------------------------------------------------------------------------

interface SceneSettingsProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  scene: SceneDoc;
  t: number;
  fs: FileSystemAdapter | null;
}

function SceneSettings({ store, sceneId, scene, t, fs }: SceneSettingsProps) {
  const trans = scene.transition;
  const cam = scene.camera;
  const audioOptions = useAudioOptions(fs);
  const bgm = store.doc.bgm[0] ?? null;

  return (
    <div style={{ overflowY: "auto", height: "100%", background: "var(--bg-panel)", color: "var(--text)" }}>
      <div style={{ padding: "6px 8px", fontWeight: 700, fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        シーン設定
      </div>

      {/* BGM(プロジェクト共通・1本) */}
      <Section title="BGM" defaultOpen={true}>
        <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "4px" }}>
          プロジェクト共通・通し再生で鳴る
        </div>
        <div className="ui-row">
          <label>曲</label>
          <select
            className="ui-input"
            style={{ flex: 1, fontSize: "11px", minWidth: 0 }}
            value={bgm?.audio ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                setBgm(store, null);
              } else {
                const next: Bgm = { audio: v, gain: bgm?.gain ?? 0.5, loop: bgm?.loop ?? true };
                setBgm(store, next);
              }
            }}
          >
            <option value="">（なし）</option>
            {audioOptions.map((p) => (
              <option key={p} value={p}>
                {audioLabel(p)}
              </option>
            ))}
          </select>
        </div>
        {bgm && (
          <div className="ui-row">
            <label>音量</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bgm.gain}
              style={{ flex: 1 }}
              onChange={(e) =>
                setBgm(store, { ...bgm, gain: Number(e.target.value) })
              }
            />
            <span style={{ color: "var(--text-dim)", fontSize: "11px", minWidth: "28px" }}>
              {bgm.gain.toFixed(2)}
            </span>
          </div>
        )}
      </Section>

      {/* トランジション */}
      <Section title="トランジション" defaultOpen={true}>
        <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "4px" }}>
          前シーンからこのシーンへの切替効果
        </div>
        <div className="ui-row">
          <SegmentedButtons
            value={trans.type}
            options={TRANS_TYPES.map((tp) => ({ value: tp, label: TRANS_LABEL[tp] }))}
            onChange={(tp) => setSceneTransition(store, sceneId, { type: tp })}
          />
        </div>
        <div className="ui-row">
          <label>長さ</label>
          <input
            type="number"
            step="0.1"
            min="0"
            className="ui-num"
            style={{ width: "52px" }}
            value={trans.dur}
            onChange={(e) => setSceneTransition(store, sceneId, { dur: Number(e.target.value) })}
          />
          <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>秒</span>
        </div>
      </Section>

      {/* カメラ */}
      <Section title="カメラ" defaultOpen={true}>
        {cam.length === 0 && (
          <div style={{ color: "var(--text-dim)", fontSize: "11px" }}>キーなし(固定)</div>
        )}
        {cam.map((k, i) => (
          <div key={i} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px", marginBottom: "4px" }}>
            <div className="ui-row">
              <label>t</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="ui-num"
                style={{ width: "44px" }}
                value={k.t}
                onChange={(e) => updateCameraKey(store, sceneId, i, { t: Number(e.target.value) })}
              />
              <label>ズーム</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                className="ui-num"
                style={{ width: "44px" }}
                value={k.zoom}
                onChange={(e) => updateCameraKey(store, sceneId, i, { zoom: Number(e.target.value) })}
              />
              <button
                className="ui-btn"
                onClick={() => removeCameraKey(store, sceneId, i)}
                style={{ padding: "2px 6px" }}
              >
                ×
              </button>
            </div>
            <div className="ui-row">
              <label>X</label>
              <input
                type="number"
                className="ui-num"
                style={{ width: "52px" }}
                value={Math.round(k.x)}
                onChange={(e) => updateCameraKey(store, sceneId, i, { x: Number(e.target.value) })}
              />
              <label>Y</label>
              <input
                type="number"
                className="ui-num"
                style={{ width: "52px" }}
                value={Math.round(k.y)}
                onChange={(e) => updateCameraKey(store, sceneId, i, { y: Number(e.target.value) })}
              />
            </div>
            <div className="ui-row">
              <label>イーズ</label>
              <select
                className="ui-input"
                style={{ fontSize: "11px" }}
                value={k.ease ?? "quadInOut"}
                onChange={(e) => updateCameraKey(store, sceneId, i, { ease: e.target.value })}
              >
                {EASING_NAMES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <button
          className="ui-btn"
          style={{ marginTop: "2px", width: "100%", justifyContent: "center" }}
          onClick={() => {
            const c = evaluateCamera(cam, t);
            addCameraKey(store, sceneId, {
              t: Math.round(t * 100) / 100,
              x: c.x,
              y: c.y,
              zoom: c.zoom,
            });
          }}
        >
          + 現在時刻にキー追加(t={t.toFixed(2)}s)
        </button>
      </Section>
    </div>
  );
}
