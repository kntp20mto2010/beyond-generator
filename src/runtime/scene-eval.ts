import type { CharacterDoc } from "../core/schema/character.js";
import type { ClipDoc } from "../core/schema/clip.js";
import type {
  Action,
  BalloonElement,
  CameraKey,
  CharacterElement,
  Enter,
  Exit,
  ExpressionKey,
  ProjectDoc,
  SceneDoc,
  SceneElement,
  Talk,
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
import { ease, type EasingName, quadOut, backOut } from "./easing.js";
import { blinkAt, resolveFace } from "./expression.js";
import type { Mat2D } from "./mat2d.js";
import { computeBoneWorld } from "./pose.js";
import { buildRenderList, type RenderItem } from "./pose.js";
import { mulberry32 } from "./rand.js";
import { getObjectDef } from "../editor/scene/objects-catalog.js";

const CROSSFADE = 0.22;
const STAGE_W = 1920;
const STAGE_H = 1080;
// 画面外オフセット(stage幅高にマージンを加味)
const SLIDE_X = 1260;
const SLIDE_Y = 840;
// virtualVelocity=0 のクリップに moveTo が付いた場合の歩行速度フォールバック
const DEFAULT_WALK_V = 240;

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

// 展開済みアクション: 各アクションに開始位置 from・到達点 to・到着時刻を畳み込む
export interface ExpandedAction {
  t: number;
  clip: string;
  speed: number;
  from: [number, number]; // このアクション開始時の位置
  to: [number, number]; // 到達点(moveTo無しなら from と同じ)
  travelEnd: number; // 到着時刻(moveTo無しなら t)
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function lerp2(
  a: [number, number],
  b: [number, number],
  k: number,
): [number, number] {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

// 先頭から位置を畳み込み、到着idleを挿入した展開列を返す
export function expandActions(
  origin: [number, number],
  actions: readonly Action[],
): ExpandedAction[] {
  const list = normalizedActions(actions);
  const out: ExpandedAction[] = [];
  let pos: [number, number] = [origin[0], origin[1]];

  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    const next = list[i + 1];
    const from: [number, number] = [pos[0], pos[1]];

    let to: [number, number] = from;
    let travelEnd = a.t;
    if (a.moveTo) {
      const target: [number, number] = [
        a.moveTo.x,
        a.moveTo.y ?? from[1], // y省略 = 開始時のyを維持
      ];
      const d = dist(from, target);
      if (d > 1e-6) {
        const baseV = lookupClip(a.clip).virtualVelocity || DEFAULT_WALK_V;
        const v = baseV * a.speed;
        const travelDur = d / v;
        const fullEnd = a.t + travelDur;
        // 打ち切り: 次アクションが到着前に始まる → 途中で停止
        if (next && next.t < fullEnd) {
          const k = (next.t - a.t) / travelDur;
          to = lerp2(from, target, k);
          travelEnd = next.t;
        } else {
          to = target;
          travelEnd = fullEnd;
        }
      }
    }

    out.push({ t: a.t, clip: a.clip, speed: a.speed, from, to, travelEnd });
    pos = to;

    // 到着idle: 到着が次アクション開始前(または最後)かつ移動があった場合
    const moved = to[0] !== from[0] || to[1] !== from[1];
    if (moved && (!next || travelEnd < next.t)) {
      out.push({
        t: travelEnd,
        clip: "idle",
        speed: 1,
        from: to,
        to,
        travelEnd,
      });
    }
  }

  return out;
}

// active = a.t <= t を満たす最後の展開アクション(同時刻は後勝ち)
function activeExpandedIdx(list: readonly ExpandedAction[], t: number): number {
  let idx = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i]!.t <= t) idx = i;
    else break;
  }
  return idx;
}

export function evaluateActionTrack(
  origin: [number, number],
  actions: readonly Action[],
  t: number,
): ClipFrame {
  const list = expandActions(origin, actions);

  const activeIdx = activeExpandedIdx(list, t);
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
// キャラの位置・向き・速度(moveTo駆動)
// ---------------------------------------------------------------------------

export interface CharMotion {
  pos: [number, number];
  facing: 1 | -1; // 1=右向き(素), -1=反転
  vel: [number, number]; // px/s。移動中のみ非ゼロ(ワールド座標)
}

export function evaluateCharMotion(el: CharacterElement, t: number): CharMotion {
  const origin: [number, number] = [el.transform.x, el.transform.y];
  const list = expandActions(origin, el.actions);
  const activeIdx = activeExpandedIdx(list, t);
  const active = list[activeIdx]!;

  const travelDur = active.travelEnd - active.t;
  const moving = travelDur > 1e-6 && t < active.travelEnd;

  let pos: [number, number];
  let vel: [number, number] = [0, 0];
  if (moving) {
    const k = (t - active.t) / travelDur;
    pos = lerp2(active.from, active.to, k);
    vel = [
      (active.to[0] - active.from[0]) / travelDur,
      (active.to[1] - active.from[1]) / travelDur,
    ];
  } else {
    pos = active.to;
  }

  // facing: tまでに発生した最後の水平移動の方向。無ければ transform.flipX 準拠
  let facing: 1 | -1 = el.transform.flipX ? -1 : 1;
  for (let i = 0; i <= activeIdx; i++) {
    const a = list[i]!;
    const dx = a.to[0] - a.from[0];
    if (dx !== 0) facing = dx < 0 ? -1 : 1;
  }

  return { pos, facing, vel };
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
  // 新キャラ(スプライト合成系)。CharConfig 型は実装側でしか持っていないので
  // unknown で受け、利用側(scene-render-stack)で型を絞る。
  getSpriteCharacter?(ref: string): unknown | undefined;
}

export type SceneFramePayload =
  | {
      kind: "character";
      char: CharacterDoc;
      items: RenderItem[];
      flipX: boolean;
      transform: Transform;
    }
  | {
      kind: "sprite-character";
      // CharConfig。scene-eval は内容に触らず render 層へ渡すだけ。
      spriteCfg: unknown;
      flipX: boolean;
      transform: Transform;
      // 動的リグ駆動用ドライバ。クリップ名のみ解決し、実サンプリングは render 層が行う
      // (新キャラクリップは CLIPS 未登録のため scene-eval ではサンプルしない)。
      drivers: {
        clip: string;
        localTime: number;
        prevClip: string | null;
        prevLocalTime: number;
        blend: number;
        expr: string;
        talk: boolean;
        clock: number;
      };
    }
  | { kind: "text"; el: TextElement; transform: Transform }
  | { kind: "balloon"; el: BalloonElement; transform: Transform }
  | { kind: "object"; src: string; transform: Transform }
  | { kind: "placeholder"; ref: string; transform: Transform };

export interface SceneFrameItem {
  elementId: string;
  z: number;
  visual: ElementVisual;
  payload: SceneFramePayload;
}

// 音声エンベロープ参照(プレビュー/書き出し共通。データを渡せば口パクが決まる)
export interface AudioEnvelopeLookup {
  lookup(path: string): { envelope: Uint8Array; duration: number } | undefined;
}

export interface EvaluateSceneOptions {
  hairDeforms?: Map<string, Map<string, Mat2D>>; // elementId → (strandKey → Mat2D)
  audio?: AudioEnvelopeLookup;
}

const ENVELOPE_FPS = 30;

// アクティブtalk(talk.t <= t < talk.t + duration の最後)のエンベロープから口の開閉を導く。
// open区間で "open"、それ以外は undefined(表情の口を使う)。
function mouthOverrideAt(
  talks: readonly Talk[],
  t: number,
  audio: AudioEnvelopeLookup | undefined,
): string | undefined {
  if (!audio || talks.length === 0) return undefined;
  let active: { talk: Talk; envelope: Uint8Array } | undefined;
  for (const talk of talks) {
    const a = audio.lookup(talk.audio);
    if (!a) continue;
    if (talk.t <= t && t < talk.t + a.duration) {
      active = { talk, envelope: a.envelope }; // t昇順前提で最後が勝つ
    }
  }
  if (!active) return undefined;
  const frame = Math.floor((t - active.talk.t) * ENVELOPE_FPS);
  return active.envelope[frame] === 1 ? "open" : undefined;
}

// アクティブな talk 音声があるか(talk.t <= t < talk.t + duration)。
// スプライトの口パクを「body clip に依らず発話中だけ」動かすトリガに使う。
// これにより座ったまま(clip="sit"/"sit-talk")でも音声に合わせて口が動く。
function isTalkingAt(
  talks: readonly Talk[],
  t: number,
  audio: AudioEnvelopeLookup | undefined,
): boolean {
  if (!audio || talks.length === 0) return false;
  for (const talk of talks) {
    const a = audio.lookup(talk.audio);
    if (a && talk.t <= t && t < talk.t + a.duration) return true;
  }
  return false;
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
  audio: AudioEnvelopeLookup | undefined,
): SceneFramePayload {
  const origin: [number, number] = [el.transform.x, el.transform.y];
  const frame = evaluateActionTrack(origin, el.actions, t);
  const bones = computeBoneWorld(char, frame.pose);

  const preset = activeExpression(el.expressions, t);
  // まばたき: 要素ごとに使い捨ての rng / schedule を都度生成(決定論)
  const rng = mulberry32(seed);
  const schedule: number[] = [];
  const blink = char.blink.enabled ? blinkAt(t, rng, schedule) : 0;
  // 音声リップフラップ: アクティブtalkのエンベロープで口を上書き(無音区間は表情の口)
  const mouthOverride = mouthOverrideAt(el.talks, t, audio);
  const face = resolveFace(char, { preset, blink, mouthOverride });

  const items = buildRenderList(char, bones, {
    face,
    handShape: frame.handShape,
    hairDeform,
  });

  // 位置・向きを実効値へ(StageCanvasは無変更で動く)
  const motion = evaluateCharMotion(el, t);
  const flipX = motion.facing === -1;
  const transform: Transform = {
    ...el.transform,
    x: motion.pos[0],
    y: motion.pos[1],
    flipX,
  };

  return {
    kind: "character",
    char,
    items,
    flipX,
    transform,
  };
}

// 新キャラ(スプライト)の動的ドライバを評価。ボーン変換は render 層(SpriteRig)が
// 行うため、ここではアクティブ clip 名・ローカル時刻・クロスフェード・表情・talk・位置/向き
// だけを払い出す。新キャラクリップは CLIPS 未登録なので clip の sampleClip はしない
// (moveTo の歩行速度は idle フォールバック→DEFAULT_WALK_V=240 で walk-girl と一致)。
function evaluateSpriteCharacter(
  el: CharacterElement,
  spriteCfg: unknown,
  t: number,
  audio: AudioEnvelopeLookup | undefined,
): SceneFramePayload {
  const origin: [number, number] = [el.transform.x, el.transform.y];
  const list = expandActions(origin, el.actions);
  const activeIdx = activeExpandedIdx(list, t);
  const active = list[activeIdx]!;
  const localTime = (t - active.t) * active.speed;

  // クロスフェード: active 開始から CROSSFADE 未満かつ直前アクションがある
  const since = t - active.t;
  const prev = activeIdx > 0 ? list[activeIdx - 1] : undefined;
  let prevClip: string | null = null;
  let prevLocalTime = 0;
  let blend = 1;
  if (prev && since >= 0 && since < CROSSFADE) {
    prevClip = prev.clip;
    prevLocalTime = (t - prev.t) * prev.speed;
    blend = smoothstep(since / CROSSFADE);
  }

  const motion = evaluateCharMotion(el, t);
  // 向き: 新キャラのテクスチャは「素=左向き」(リグの facing 既定=left)。
  // 一方 motion.facing は旧ベクター基準で 1=右/-1=左。素が左なので、右を向くとき
  // (facing===1)に鏡映する。ベクターキャラ(素=右)とは反転になる。
  // これで「右へ歩く→右を向く」「向き合う2人」が台本どおりに描画される。
  const flipX = motion.facing === 1;
  const transform: Transform = { ...el.transform, x: motion.pos[0], y: motion.pos[1], flipX };

  return {
    kind: "sprite-character",
    spriteCfg,
    flipX,
    transform,
    drivers: {
      clip: active.clip,
      localTime,
      prevClip,
      prevLocalTime,
      blend,
      expr: activeExpression(el.expressions, t),
      // 口パク発火条件:
      //  1) 発話の所作クリップ(talk / sit-talk)がアクティブ — 音声に依らず口を動かす(従来踏襲)
      //  2) talk音声がアクティブ — body clip に依らず発話中だけ口を動かす(音声同期)
      // これで「座ったまま喋る」が成立し、音声があれば発話区間に同期して口が止まる。
      talk:
        active.clip === "talk" ||
        active.clip === "sit-talk" ||
        isTalkingAt(el.talks, t, audio),
      clock: t,
    },
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
  switch (el.kind) {
    case "character": {
      // 先にスプライト系を確認(新キャラ)。あれば static sprite として返す。
      const spriteCfg = resolver.getSpriteCharacter?.(el.ref);
      if (spriteCfg) {
        payload = evaluateSpriteCharacter(el, spriteCfg, t, opts?.audio);
        break;
      }
      const char = resolver.getCharacter(el.ref);
      if (!char) {
        payload = { kind: "placeholder", ref: el.ref, transform: el.transform };
      } else {
        const seed = scene.seed * 31 + index;
        payload = evaluateCharacter(el, char, t, seed, opts?.hairDeforms?.get(el.id), opts?.audio);
      }
      break;
    }
    case "text":
      payload = { kind: "text", el, transform: el.transform };
      break;
    case "balloon":
      payload = { kind: "balloon", el, transform: el.transform };
      break;
    case "object":
      payload = { kind: "object", src: el.src, transform: el.transform };
      break;
  }

  return { elementId: el.id, z: effectiveZ(el), visual, payload };
}

// 描画 z を「配置種別 + Y 位置」で計算する。
//
// レイヤ構造(上に来るほど手前):
//   壁/天井 : -10000 + el.z (常に最背面、back-wall/side-wall/ceiling = 壁デコ・窓カーテン・ライト等)
//   床敷き  :  -5000 + el.z (ラグ等)
//   床置き  :  el.y  + el.z (家具・キャラ。Y が大きいほど手前)
//   その他  :  el.z         (text / balloon は UI overlay として従来通り)
//
// el.z は手動オフセット (同じ Y 内のタイブレーク、例外配置用)。
function effectiveZ(el: SceneElement): number {
  if (el.kind === "object") {
    const def = getObjectDef(el.src);
    const p = def?.placement;
    if (p === "back-wall" || p === "side-wall" || p === "ceiling") return -10000 + el.z;
    if (p === "ground") return -5000 + el.z;
    if (p === "floor")  return el.transform.y + el.z;
    return el.z;
  }
  if (el.kind === "character") {
    return el.transform.y + el.z; // キャラも床上扱い
  }
  return el.z; // text / balloon
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

// ---------------------------------------------------------------------------
// カメラ評価(evaluateScene には混ぜない。呼び出し側が別途呼ぶ)
// ---------------------------------------------------------------------------

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

const CAMERA_DEFAULT: CameraState = { x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1 };

export function evaluateCamera(keys: readonly CameraKey[], t: number): CameraState {
  if (keys.length === 0) return { ...CAMERA_DEFAULT };
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const first = sorted[0]!;
  if (t <= first.t) return { x: first.x, y: first.y, zoom: first.zoom };
  const last = sorted[sorted.length - 1]!;
  if (t >= last.t) return { x: last.x, y: last.y, zoom: last.zoom };

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const raw = span <= 0 ? 1 : (t - a.t) / span;
      const k = ease((a.ease as EasingName | undefined) ?? "quadInOut", raw);
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        zoom: a.zoom + (b.zoom - a.zoom) * k,
      };
    }
  }
  return { x: last.x, y: last.y, zoom: last.zoom };
}

export { STAGE_W, STAGE_H };
