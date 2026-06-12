import type { ProjectDoc, SceneDoc } from "../../core/schema/project.js";
import { CLIPS } from "../../presets/clips/index.js";
import { EXPRESSION_PRESETS } from "../../runtime/expression.js";

// ---------------------------------------------------------------------------
// ScriptEvent 型
// ---------------------------------------------------------------------------

export type ScriptEvent =
  | { t: number; kind: "enter"; elementId: string; name: string; effect: string }
  | { t: number; kind: "exit"; elementId: string; name: string; effect: string }
  | { t: number; kind: "action"; elementId: string; name: string; clipLabel: string; moveToX?: number }
  | { t: number; kind: "expression"; elementId: string; name: string; presetLabel: string }
  | { t: number; kind: "dialogue"; elementId: string; text: string }
  | { t: number; kind: "camera"; index: number; zoom: number }
  | { t: number; kind: "transition"; type: string; dur: number };

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

// サロゲートペア安全な先頭N文字切り出し
function safeSlice(s: string, n: number): string {
  return [...s].slice(0, n).join("");
}

// 要素の表示名(timeline-lane.tsx の laneName に準拠)
function elementName(el: { kind: string; ref?: string; text?: string }): string {
  if (el.kind === "character" && el.ref) {
    return el.ref
      .replace(/^.*\//, "")
      .replace(/\.byc\.json$/, "")
      .replace("builtin:", "");
  }
  if ((el.kind === "balloon" || el.kind === "text") && el.text) {
    return safeSlice(el.text, 10);
  }
  return "";
}

// 同t内の種別順(enter < dialogue < action < expression < camera)
const KIND_ORDER: Record<ScriptEvent["kind"], number> = {
  enter: 0,
  exit: 0,
  dialogue: 1,
  action: 2,
  expression: 3,
  camera: 4,
  transition: 5,
};

// ---------------------------------------------------------------------------
// 主関数
// ---------------------------------------------------------------------------

export function buildScriptEvents(
  _project: ProjectDoc,
  scene: SceneDoc,
  nextScene: SceneDoc | null,
): ScriptEvent[] {
  const events: ScriptEvent[] = [];

  for (const el of scene.elements) {
    const name = elementName(el);

    // enter 行(delay>0 または type≠cut のときだけ)
    if (el.enter.delay > 0 || el.enter.type !== "cut") {
      events.push({
        t: el.enter.delay,
        kind: "enter",
        elementId: el.id,
        name,
        effect: el.enter.type,
      });
    }

    // exit 行(at が null でないとき)
    if (el.exit.at !== null) {
      events.push({
        t: el.exit.at,
        kind: "exit",
        elementId: el.id,
        name,
        effect: el.exit.type,
      });
    }

    // dialogue 行(balloon / text は必ず出す)
    if (el.kind === "balloon" || el.kind === "text") {
      events.push({
        t: el.enter.delay,
        kind: "dialogue",
        elementId: el.id,
        text: el.text,
      });
    }

    // action 行(キャラのみ)
    if (el.kind === "character") {
      for (const act of el.actions) {
        const clip = CLIPS[act.clip];
        const clipLabel = clip?.label ?? act.clip;
        const ev: ScriptEvent = {
          t: act.t,
          kind: "action",
          elementId: el.id,
          name,
          clipLabel,
        };
        if (act.moveTo !== undefined) {
          (ev as Extract<ScriptEvent, { kind: "action" }>).moveToX = act.moveTo.x;
        }
        events.push(ev);
      }

      // expression 行
      for (const exk of el.expressions) {
        const def = EXPRESSION_PRESETS[exk.preset];
        const presetLabel = def?.label ?? exk.preset;
        events.push({
          t: exk.t,
          kind: "expression",
          elementId: el.id,
          name,
          presetLabel,
        });
      }
    }
  }

  // カメラキー
  scene.camera.forEach((key, index) => {
    events.push({
      t: key.t,
      kind: "camera",
      index,
      zoom: key.zoom,
    });
  });

  // transition 行(nextScene の transition が cut 以外のとき、シーン末尾に追加)
  if (nextScene && nextScene.transition.type !== "cut") {
    events.push({
      t: scene.duration,
      kind: "transition",
      type: nextScene.transition.type,
      dur: nextScene.transition.dur,
    });
  }

  // t昇順 → 同t内は KIND_ORDER 順でソート
  events.sort((a, b) => {
    const dt = a.t - b.t;
    if (dt !== 0) return dt;
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });

  return events;
}
