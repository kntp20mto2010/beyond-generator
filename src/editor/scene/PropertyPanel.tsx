import type { DocStore } from "../../core/doc-store.js";
import type {
  BalloonElement,
  EffectType,
  ProjectDoc,
  SceneDoc,
  SceneElement,
  Transition,
} from "../../core/schema/project.js";
import { EXPRESSION_PRESETS } from "../../runtime/expression.js";
import { evaluateCamera } from "../../runtime/scene-eval.js";
import { EASINGS } from "../../runtime/easing.js";
import { CLIPS, CLIP_ORDER } from "../../presets/clips/index.js";
import {
  addAction,
  addCameraKey,
  addExpressionKey,
  removeAction,
  removeCameraKey,
  removeExpressionKey,
  setBalloonProps,
  setElementEnter,
  setElementExit,
  setElementLocked,
  setElementZ,
  setSceneTransition,
  setTextProps,
  updateAction,
  updateCameraKey,
  updateElementTransform,
  updateExpressionKey,
} from "../../core/commands-project.js";

interface Props {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  scene: SceneDoc;
  element: SceneElement | null;
  t: number; // 再生ヘッド(カメラキー追加に使用)
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

const KIND_LABEL: Record<SceneElement["kind"], string> = {
  character: "キャラクター",
  text: "テキスト",
  balloon: "吹き出し",
};

export function PropertyPanel({ store, sceneId, scene, element, t }: Props) {
  if (!element) {
    return <SceneSettings store={store} sceneId={sceneId} scene={scene} t={t} />;
  }
  const id = element.id;
  const tf = element.transform;

  // ロック中: 解除のみ表示(他の入力は隠す)
  if (element.locked) {
    return (
      <div style={{ padding: "8px", fontSize: "12px" }}>
        <div style={head}>{KIND_LABEL[element.kind]}</div>
        <div style={{ margin: "8px 0", color: "#a06800" }}>🔒 ロック中</div>
        <button onClick={() => setElementLocked(store, sceneId, id, false)}>
          ロック解除
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px", overflowY: "auto", fontSize: "12px" }}>
      <div style={head}>{KIND_LABEL[element.kind]}</div>

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

      <div style={section}>
        <button onClick={() => setElementLocked(store, sceneId, id, true)}>
          🔒 ロック
        </button>
      </div>

      {element.kind === "character" && (
        <CharacterSections store={store} sceneId={sceneId} element={element} />
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
  element: Extract<SceneElement, { kind: "character" }>;
}

function CharacterSections({ store, sceneId, element }: CharacterSectionsProps) {
  const id = element.id;
  return (
    <>
      {/* actions */}
      <div style={section}>
            <div style={head}>アクション</div>
            {element.actions.map((a, i) => (
              <div key={i} style={{ borderBottom: "1px dashed #eee", paddingBottom: "3px" }}>
                <div style={row}>
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
                <div style={row}>
                  <span>移動先</span>
                  <span>X</span>
                  <input
                    type="number"
                    style={{ width: "52px" }}
                    placeholder="—"
                    value={a.moveTo?.x ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        updateAction(store, sceneId, id, i, { moveTo: undefined });
                      } else {
                        updateAction(store, sceneId, id, i, {
                          moveTo: { x: Number(v), ...(a.moveTo?.y !== undefined ? { y: a.moveTo.y } : {}) },
                        });
                      }
                    }}
                  />
                  <span>Y</span>
                  <input
                    type="number"
                    style={{ width: "52px" }}
                    placeholder="維持"
                    disabled={a.moveTo === undefined}
                    value={a.moveTo?.y ?? ""}
                    onChange={(e) => {
                      if (a.moveTo === undefined) return;
                      const v = e.target.value;
                      updateAction(store, sceneId, id, i, {
                        moveTo: v === "" ? { x: a.moveTo.x } : { x: a.moveTo.x, y: Number(v) },
                      });
                    }}
                  />
                </div>
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
    <div style={section}>
      <div style={head}>吹き出し</div>
      <div style={row}>
        <span>形状</span>
        <select
          value={element.shape}
          onChange={(e) =>
            setBalloonProps(store, sceneId, id, {
              shape: e.target.value as BalloonElement["shape"],
            })
          }
        >
          {BALLOON_SHAPES.map(({ shape, label }) => (
            <option key={shape} value={shape}>{label}</option>
          ))}
        </select>
      </div>
      <textarea
        style={{ width: "100%", fontSize: "12px", resize: "vertical" }}
        rows={2}
        value={element.text}
        onChange={(e) => setBalloonProps(store, sceneId, id, { text: e.target.value })}
      />
      <div style={row}>
        <span>幅</span>
        <input
          type="number"
          style={{ width: "52px" }}
          value={Math.round(element.w)}
          onChange={(e) => setBalloonProps(store, sceneId, id, { w: Number(e.target.value) }, `el:${id}:balloon`)}
        />
        <span>高</span>
        <input
          type="number"
          style={{ width: "52px" }}
          value={Math.round(element.h)}
          onChange={(e) => setBalloonProps(store, sceneId, id, { h: Number(e.target.value) }, `el:${id}:balloon`)}
        />
      </div>
      <div style={row}>
        <span>文字</span>
        <input
          type="number"
          style={num}
          value={element.size}
          onChange={(e) => setBalloonProps(store, sceneId, id, { size: Number(e.target.value) }, `el:${id}:balloon`)}
        />
      </div>
      <div style={row}>
        <span>地色</span>
        <input
          type="color"
          value={element.fill}
          onChange={(e) => setBalloonProps(store, sceneId, id, { fill: e.target.value }, `el:${id}:balloon`)}
        />
        <span>文字色</span>
        <input
          type="color"
          value={element.textColor}
          onChange={(e) => setBalloonProps(store, sceneId, id, { textColor: e.target.value }, `el:${id}:balloon`)}
        />
        <span>線色</span>
        <input
          type="color"
          value={element.lineColor}
          onChange={(e) => setBalloonProps(store, sceneId, id, { lineColor: e.target.value }, `el:${id}:balloon`)}
        />
      </div>
      <div style={{ color: "#999", fontSize: "11px", marginTop: "2px" }}>
        しっぽ先端はステージ上の白丸をドラッグ
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 要素未選択時: シーン設定(トランジション + カメラキー)
// ---------------------------------------------------------------------------

interface SceneSettingsProps {
  store: DocStore<ProjectDoc>;
  sceneId: string;
  scene: SceneDoc;
  t: number;
}

function SceneSettings({ store, sceneId, scene, t }: SceneSettingsProps) {
  const trans = scene.transition;
  const cam = scene.camera;

  return (
    <div style={{ padding: "8px", overflowY: "auto", fontSize: "12px" }}>
      <div style={head}>シーン設定</div>

      {/* トランジション(前シーンからの切替) */}
      <div style={section}>
        <div style={head}>トランジション</div>
        <div style={{ color: "#999", fontSize: "11px", marginBottom: "2px" }}>
          前シーンからこのシーンへの切替効果
        </div>
        <div style={row}>
          <span>種類</span>
          <select
            value={trans.type}
            onChange={(e) =>
              setSceneTransition(store, sceneId, { type: e.target.value as Transition["type"] })
            }
          >
            {TRANS_TYPES.map((tp) => (
              <option key={tp} value={tp}>{TRANS_LABEL[tp]}</option>
            ))}
          </select>
          <span>長</span>
          <input
            type="number"
            step="0.1"
            min="0"
            style={{ width: "52px" }}
            value={trans.dur}
            onChange={(e) => setSceneTransition(store, sceneId, { dur: Number(e.target.value) })}
          />
          <span>秒</span>
        </div>
      </div>

      {/* カメラキー */}
      <div style={section}>
        <div style={head}>カメラ</div>
        {cam.length === 0 && (
          <div style={{ color: "#999", fontSize: "11px" }}>キーなし(固定)</div>
        )}
        {cam.map((k, i) => (
          <div key={i} style={{ borderBottom: "1px dashed #eee", paddingBottom: "3px" }}>
            <div style={row}>
              <span>t</span>
              <input
                type="number"
                step="0.1"
                min="0"
                style={{ width: "44px" }}
                value={k.t}
                onChange={(e) => updateCameraKey(store, sceneId, i, { t: Number(e.target.value) })}
              />
              <span>ズーム</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                style={{ width: "44px" }}
                value={k.zoom}
                onChange={(e) => updateCameraKey(store, sceneId, i, { zoom: Number(e.target.value) })}
              />
              <button onClick={() => removeCameraKey(store, sceneId, i)}>×</button>
            </div>
            <div style={row}>
              <span>X</span>
              <input
                type="number"
                style={{ width: "56px" }}
                value={Math.round(k.x)}
                onChange={(e) => updateCameraKey(store, sceneId, i, { x: Number(e.target.value) })}
              />
              <span>Y</span>
              <input
                type="number"
                style={{ width: "56px" }}
                value={Math.round(k.y)}
                onChange={(e) => updateCameraKey(store, sceneId, i, { y: Number(e.target.value) })}
              />
              <select
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
          style={{ fontSize: "12px", marginTop: "2px" }}
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
      </div>
    </div>
  );
}
