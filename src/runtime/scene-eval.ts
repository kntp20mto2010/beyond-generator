import type { CharacterDoc } from "../core/schema/character.js";
import type { ClipDoc } from "../core/schema/clip.js";
import type {
  Action,
  CharacterElement,
  Enter,
  Exit,
  ExpressionKey,
  ProjectDoc,
  SceneDoc,
  SceneElement,
  TextElement,
  Transform,
} from "../core/schema/project.js";
import { CLIPS } from "../presets/clips/index.js";
import {
  blendFrames,
  type ClipFrame,
  sampleClip,
  smoothstep,
} from "./clip-player.js";
import { quadOut, backOut } from "./easing.js";
import { blinkAt, resolveFace } from "./expression.js";
import type { Mat2D } from "./mat2d.js";
import { computeBoneWorld } from "./pose.js";
import { buildRenderList, type RenderItem } from "./pose.js";
import { mulberry32 } from "./rand.js";

const CROSSFADE = 0.22;
const STAGE_W = 1920;
const STAGE_H = 1080;
// 画面外オフセット(stage幅高にマージンを加味)
const SLIDE_X = 1260;
const SLIDE_Y = 840;

// ---------------------------------------------------------------------------
// アクション列の純関数評価
// ---------------------------------------------------------------------------

function lookupClip(id: string): ClipDoc {
  return CLIPS[id] ?? CLIPS["idle"]!;
}

// 暗黙の先頭アクションを補い、t昇順に整える
function normalizedActions(actions: readonly Action[]): Action[] {
  const sorted = [...actions].sort((a, b) => a.t - b.t);
  const hasZero = sorted.some((a) => a.t === 0);
  if (!hasZero) {
    sorted.unshift({ t: 0, clip: "idle", speed: 1 });
  }
  return sorted;
}

export function evaluateActionTrack(
  actions: readonly Action[],
  t: number,
): ClipFrame {
  const list = normalizedActions(actions);

  // active = a.t <= t を満たす最後のアクション(同時刻は後勝ち)
  let activeIdx = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i]!.t <= t) activeIdx = i;
    else break;
  }
  const active = list[activeIdx]!;
  const activeFrame = sampleClip(lookupClip(active.clip), (t - active.t) * active.speed);

  // クロスフェード: active開始からCROSSFADE未満かつ直前アクションがある
  const since = t - active.t;
  const prev = activeIdx > 0 ? list[activeIdx - 1] : undefined;
  if (prev && since >= 0 && since < CROSSFADE) {
    const prevFrame = sampleClip(lookupClip(prev.clip), (t - prev.t) * prev.speed);
    return blendFrames(prevFrame, activeFrame, smoothstep(since / CROSSFADE));
  }
  return activeFrame;
}

// ---------------------------------------------------------------------------
// enter / exit 効果 → 可視状態
// ---------------------------------------------------------------------------

export interface ElementVisual {
  visible: boolean;
  alpha: number; // 0..1
  offset: [number, number]; // ステージ座標の加算オフセット
  scaleMul: number; // transform.scale に乗算
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// enter効果(p: 0→1 で完全表示へ)を視覚状態に適用
function applyEnter(type: Enter["type"], p: number, out: ElementVisual): void {
  switch (type) {
    case "cut":
      break;
    case "fade":
      out.alpha = p;
      break;
    case "slideL":
      out.offset[0] = -SLIDE_X * (1 - quadOut(p));
      break;
    case "slideR":
      out.offset[0] = SLIDE_X * (1 - quadOut(p));
      break;
    case "slideT":
      out.offset[1] = -SLIDE_Y * (1 - quadOut(p));
      break;
    case "slideB":
      out.offset[1] = SLIDE_Y * (1 - quadOut(p));
      break;
    case "pop":
      out.scaleMul = backOut(p);
      out.alpha = Math.min(1, p * 3);
      break;
  }
}

// exit効果(q: 0→1 で消失へ)を視覚状態に適用
function applyExit(type: Exit["type"], q: number, out: ElementVisual): void {
  switch (type) {
    case "cut":
      break;
    case "fade":
      out.alpha = 1 - q;
      break;
    case "slideL":
      out.offset[0] = -SLIDE_X * quadOut(q);
      break;
    case "slideR":
      out.offset[0] = SLIDE_X * quadOut(q);
      break;
    case "slideT":
      out.offset[1] = -SLIDE_Y * quadOut(q);
      break;
    case "slideB":
      out.offset[1] = SLIDE_Y * quadOut(q);
      break;
    case "pop":
      out.scaleMul = backOut(1 - q);
      out.alpha = Math.min(1, (1 - q) * 3);
      break;
  }
}

export function evaluateEffect(
  enter: Enter,
  exit: Exit,
  _sceneDuration: number,
  t: number,
): ElementVisual {
  const exitAt = exit.at;
  // 可視窓: enter.delay <= t < (exit.at ?? Infinity) + exit.dur
  // cut exit は exit.at ちょうどで消える(durを足さない)
  const hardEnd =
    exitAt === null
      ? Infinity
      : exit.type === "cut"
        ? exitAt
        : exitAt + exit.dur;

  if (t < enter.delay || t >= hardEnd) {
    return { visible: false, alpha: 0, offset: [0, 0], scaleMul: 1 };
  }

  const out: ElementVisual = { visible: true, alpha: 1, offset: [0, 0], scaleMul: 1 };

  // enter進行
  const pRaw = enter.dur > 0 ? (t - enter.delay) / enter.dur : 1;
  const p = enter.type === "cut" ? 1 : clamp01(pRaw);
  if (p < 1) applyEnter(enter.type, p, out);

  // exit進行(exit.atが設定されており、かつ非cut)
  if (exitAt !== null && exit.type !== "cut" && t >= exitAt) {
    const qRaw = exit.dur > 0 ? (t - exitAt) / exit.dur : 1;
    const q = clamp01(qRaw);
    applyExit(exit.type, q, out);
  }

  return out;
}

// ---------------------------------------------------------------------------
// シーン評価
// ---------------------------------------------------------------------------

export interface CharResolver {
  getCharacter(ref: string): CharacterDoc | undefined;
}

export type SceneFramePayload =
  | {
      kind: "character";
      char: CharacterDoc;
      items: RenderItem[];
      flipX: boolean;
      transform: Transform;
    }
  | { kind: "text"; el: TextElement; transform: Transform }
  | { kind: "placeholder"; ref: string; transform: Transform };

export interface SceneFrameItem {
  elementId: string;
  z: number;
  visual: ElementVisual;
  payload: SceneFramePayload;
}

export interface EvaluateSceneOptions {
  hairDeforms?: Map<string, Map<string, Mat2D>>; // elementId → (strandKey → Mat2D)
}

// 表情キー: t <= t の最後(default neutral)
function activeExpression(keys: readonly ExpressionKey[], t: number): string {
  let preset = "neutral";
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  for (const k of sorted) {
    if (k.t <= t) preset = k.preset;
    else break;
  }
  return preset;
}

function evaluateCharacter(
  el: CharacterElement,
  char: CharacterDoc,
  t: number,
  seed: number,
  hairDeform: Map<string, Mat2D> | undefined,
): SceneFramePayload {
  const frame = evaluateActionTrack(el.actions, t);
  const bones = computeBoneWorld(char, frame.pose);

  const preset = activeExpression(el.expressions, t);
  // まばたき: 要素ごとに使い捨ての rng / schedule を都度生成(決定論)
  const rng = mulberry32(seed);
  const schedule: number[] = [];
  const blink = char.blink.enabled ? blinkAt(t, rng, schedule) : 0;
  const face = resolveFace(char, { preset, blink });

  const items = buildRenderList(char, bones, {
    face,
    handShape: frame.handShape,
    hairDeform,
  });

  return {
    kind: "character",
    char,
    items,
    flipX: el.transform.flipX,
    transform: el.transform,
  };
}

function evaluateElement(
  el: SceneElement,
  index: number,
  scene: SceneDoc,
  t: number,
  resolver: CharResolver,
  opts: EvaluateSceneOptions | undefined,
): SceneFrameItem | null {
  const visual = evaluateEffect(el.enter, el.exit, scene.duration, t);
  if (!visual.visible) return null;

  let payload: SceneFramePayload;
  if (el.kind === "character") {
    const char = resolver.getCharacter(el.ref);
    if (!char) {
      payload = { kind: "placeholder", ref: el.ref, transform: el.transform };
    } else {
      const seed = scene.seed * 31 + index;
      payload = evaluateCharacter(el, char, t, seed, opts?.hairDeforms?.get(el.id));
    }
  } else {
    payload = { kind: "text", el, transform: el.transform };
  }

  return { elementId: el.id, z: el.z, visual, payload };
}

export function evaluateScene(
  _project: ProjectDoc,
  scene: SceneDoc,
  t: number,
  resolver: CharResolver,
  opts?: EvaluateSceneOptions,
): SceneFrameItem[] {
  const out: SceneFrameItem[] = [];
  scene.elements.forEach((el, index) => {
    const item = evaluateElement(el, index, scene, t, resolver, opts);
    if (item) out.push(item);
  });
  out.sort((a, b) => a.z - b.z);
  return out;
}

export { STAGE_W, STAGE_H };
