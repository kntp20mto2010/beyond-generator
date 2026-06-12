import type { DocStore } from "../../core/doc-store.js";
import type {
  EffectType,
  ProjectDoc,
  SceneElement,
} from "../../core/schema/project.js";
import { EXPRESSION_PRESETS } from "../../runtime/expression.js";
import { CLIPS, CLIP_ORDER } from "../../presets/clips/index.js";
import {
  addAction,
  addExpressionKey,
  removeAction,
  removeExpressionKey,
  setElementEnter,
  setElementExit,
  setElementZ,
  setTextProps,
  updateAction,
  updateElementTransform,
  updateExpressionKey,
} from "../../core/commands-project.js";

interface Props {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  element: SceneElement | null;
}

const EFFECTS: EffectType[] = ["cut", "fade", "slideL", "slideR", "slideT", "slideB", "pop"];
const EFFECT_LABEL: Record<EffectType, string> = {
  cut: "カット",
  fade: "フェード",
  slideL: "左から",
  slideR: "右から",
  slideT: "上から",
  slideB: "下から",
  pop: "ポップ",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  margin: "3px 0",
  fontSize: "12px",
};
const num: React.CSSProperties = { width: "64px" };
const section: React.CSSProperties = {
  borderTop: "1px solid #eee",
  marginTop: "8px",
  paddingTop: "6px",
};
const head: React.CSSProperties = { fontWeight: 700, fontSize: "12px", marginBottom: "2px" };

export function PropertyPanel({ store, sceneId, element }: Props) {
  if (!element) {
    return (
      <div style={{ padding: "8px", color: "#999", fontSize: "13px" }}>
        要素を選択してください
      </div>
    );
  }
  const id = element.id;
  const tf = element.transform;

  return (
    <div style={{ padding: "8px", overflowY: "auto", fontSize: "12px" }}>
      <div style={head}>
        {element.kind === "character" ? "キャラクター" : "テキスト"}
      </div>

      {/* transform */}
      <div style={row}>
        <span>X</span>
        <input
          type="number"
          style={num}
          value={Math.round(tf.x)}
          onChange={(e) => updateElementTransform(store, sceneId, id, { x: Number(e.target.value) })}
        />
        <span>Y</span>
        <input
          type="number"
          style={num}
          value={Math.round(tf.y)}
          onChange={(e) => updateElementTransform(store, sceneId, id, { y: Number(e.target.value) })}
        />
      </div>
      <div style={row}>
        <span>拡大</span>
        <input
          type="range"
          min="0.1"
          max="3"
          step="0.05"
          value={tf.scale}
          onChange={(e) => updateElementTransform(store, sceneId, id, { scale: Number(e.target.value) })}
        />
        <span>{tf.scale.toFixed(2)}</span>
      </div>
      <div style={row}>
        {element.kind === "character" && (
          <label style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <input
              type="checkbox"
              checked={tf.flipX}
              onChange={(e) => updateElementTransform(store, sceneId, id, { flipX: e.target.checked })}
            />
            左右反転
          </label>
        )}
        <span>z</span>
        <input
          type="number"
          style={num}
          value={element.z}
          onChange={(e) => setElementZ(store, sceneId, id, Number(e.target.value))}
        />
      </div>

      {/* enter / exit */}
      <div style={section}>
        <div style={head}>登場 / 退場</div>
        <div style={row}>
          <span>登場</span>
          <select
            value={element.enter.type}
            onChange={(e) => setElementEnter(store, sceneId, id, { type: e.target.value as EffectType })}
          >
            {EFFECTS.map((t) => (
              <option key={t} value={t}>{EFFECT_LABEL[t]}</option>
            ))}
          </select>
          <span>遅延</span>
          <input
            type="number"
            step="0.1"
            min="0"
            style={{ width: "48px" }}
            value={element.enter.delay}
            onChange={(e) => setElementEnter(store, sceneId, id, { delay: Number(e.target.value) })}
          />
          <span>長</span>
          <input
            type="number"
            step="0.1"
            min="0"
            style={{ width: "48px" }}
            value={element.enter.dur}
            onChange={(e) => setElementEnter(store, sceneId, id, { dur: Number(e.target.value) })}
          />
        </div>
        <div style={row}>
          <span>退場</span>
          <select
            value={element.exit.type}
            onChange={(e) => setElementExit(store, sceneId, id, { type: e.target.value as EffectType })}
          >
            {EFFECTS.map((t) => (
              <option key={t} value={t}>{EFFECT_LABEL[t]}</option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <input
              type="checkbox"
              checked={element.exit.at !== null}
              onChange={(e) =>
                setElementExit(store, sceneId, id, { at: e.target.checked ? 3 : null })
              }
            />
            時刻
          </label>
          {element.exit.at !== null && (
            <input
              type="number"
              step="0.1"
              min="0"
              style={{ width: "48px" }}
              value={element.exit.at}
              onChange={(e) => setElementExit(store, sceneId, id, { at: Number(e.target.value) })}
            />
          )}
          <span>長</span>
          <input
            type="number"
            step="0.1"
            min="0"
            style={{ width: "48px" }}
            value={element.exit.dur}
            onChange={(e) => setElementExit(store, sceneId, id, { dur: Number(e.target.value) })}
          />
        </div>
      </div>

      {element.kind === "character" ? (
        <>
          {/* actions */}
          <div style={section}>
            <div style={head}>アクション</div>
            {element.actions.map((a, i) => (
              <div style={row} key={i}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  style={{ width: "48px" }}
                  value={a.t}
                  onChange={(e) => updateAction(store, sceneId, id, i, { t: Number(e.target.value) })}
                />
                <select
                  value={a.clip}
                  onChange={(e) => updateAction(store, sceneId, id, i, { clip: e.target.value })}
                >
                  {CLIP_ORDER.map((cid) => (
                    <option key={cid} value={cid}>{CLIPS[cid]?.label ?? cid}</option>
                  ))}
                </select>
                <button onClick={() => removeAction(store, sceneId, id, i)}>×</button>
              </div>
            ))}
            <button
              style={{ fontSize: "12px", marginTop: "2px" }}
              onClick={() => addAction(store, sceneId, id, { t: 0, clip: "wave", speed: 1 })}
            >
              + アクション
            </button>
          </div>

          {/* expressions */}
          <div style={section}>
            <div style={head}>表情</div>
            {element.expressions.map((ex, i) => (
              <div style={row} key={i}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  style={{ width: "48px" }}
                  value={ex.t}
                  onChange={(e) => updateExpressionKey(store, sceneId, id, i, { t: Number(e.target.value) })}
                />
                <select
                  value={ex.preset}
                  onChange={(e) => updateExpressionKey(store, sceneId, id, i, { preset: e.target.value })}
                >
                  {Object.entries(EXPRESSION_PRESETS).map(([key, def]) => (
                    <option key={key} value={key}>{def.label}</option>
                  ))}
                </select>
                <button onClick={() => removeExpressionKey(store, sceneId, id, i)}>×</button>
              </div>
            ))}
            <button
              style={{ fontSize: "12px", marginTop: "2px" }}
              onClick={() => addExpressionKey(store, sceneId, id, { t: 0, preset: "smile" })}
            >
              + 表情
            </button>
          </div>
        </>
      ) : (
        <div style={section}>
          <div style={head}>テキスト内容</div>
          <textarea
            style={{ width: "100%", fontSize: "12px", resize: "vertical" }}
            rows={2}
            value={element.text}
            onChange={(e) => setTextProps(store, sceneId, id, { text: e.target.value })}
          />
          <div style={row}>
            <span>サイズ</span>
            <input
              type="number"
              style={num}
              value={element.size}
              onChange={(e) => setTextProps(store, sceneId, id, { size: Number(e.target.value) })}
            />
            <span>色</span>
            <input
              type="color"
              value={element.color}
              onChange={(e) => setTextProps(store, sceneId, id, { color: e.target.value }, `el:${id}:color`)}
            />
          </div>
          <div style={row}>
            <label style={{ display: "flex", alignItems: "center", gap: "3px" }}>
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
                  style={{ width: "48px" }}
                  value={element.strokeWidth}
                  onChange={(e) => setTextProps(store, sceneId, id, { strokeWidth: Number(e.target.value) })}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
