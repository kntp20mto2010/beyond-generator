import { CLIPS } from "../presets/clips/index.js";
import type { Place, PlaceName } from "./schema.js";

// ---------------------------------------------------------------------------
// 採時定数(spec/12 §2)。CLIP_DUR/VEL は実プリセットから導出(近似ハードコードしない)
// ---------------------------------------------------------------------------

const CLIP_NAMES = [
  "idle",
  "walk",
  "run",
  "talk1",
  "talk2",
  "point",
  "wave",
  "nod",
  "headShake",
  "jump",
] as const;

type ClipKey = (typeof CLIP_NAMES)[number];

// 実 duration を CLIPS から読む(idle:3.2, walk:0.8 ... のハードコードを避ける)
export const CLIP_DUR: Record<ClipKey, number> = (() => {
  const out = {} as Record<ClipKey, number>;
  for (const k of CLIP_NAMES) {
    const clip = CLIPS[k];
    if (!clip) throw new Error(`clip preset 不在: ${k}`);
    out[k] = clip.duration;
  }
  return out;
})();

// 実 virtualVelocity を CLIPS から読む。0 のものは既定歩行速度 240 を採用
const DEFAULT_VEL = 240;
export const VEL: Record<ClipKey, number> = (() => {
  const out = {} as Record<ClipKey, number>;
  for (const k of CLIP_NAMES) {
    const clip = CLIPS[k];
    if (!clip) throw new Error(`clip preset 不在: ${k}`);
    const vv = clip.virtualVelocity ?? 0;
    out[k] = vv > 0 ? vv : DEFAULT_VEL;
  }
  return out;
})();

// 離散プレース → x 座標(1920幅, spec/12 §1)
export const PLACE_TABLE: Record<PlaceName, number> = {
  farLeft: 200,
  left: 320,
  centerLeft: 680,
  center: 960,
  centerRight: 1240,
  right: 1600,
  farRight: 1780,
};

export const FPS = 30;

// ---------------------------------------------------------------------------
// プレース解決
// ---------------------------------------------------------------------------

export interface ResolvedPlace {
  x: number;
  y?: number;
}

export function resolvePlace(place: Place, groundY: number): { x: number; y: number } {
  if (typeof place === "string") {
    return { x: PLACE_TABLE[place], y: groundY };
  }
  return { x: place.x, y: place.y ?? groundY };
}

// ---------------------------------------------------------------------------
// 採時の素関数
// ---------------------------------------------------------------------------

// estTalk(line) = ceil((len/charPerSec)*10)/10 + 0.2*count(、) + 0.2(spec/12 §2, 実測7サンプルで較正)
export function estTalk(line: string, charPerSec: number): number {
  const len = [...line].length;
  let commas = 0;
  for (const ch of line) if (ch === "、") commas++;
  return Math.ceil((len / charPerSec) * 10) / 10 + 0.2 * commas + 0.2;
}

// voiceLen: 実長優先。未掲載は est、line も無ければ 3.0
export function voiceLen(
  voice: string | undefined,
  line: string | undefined,
  charPerSec: number,
  audioDurations: Record<string, number>,
): number {
  if (voice !== undefined) {
    const real = audioDurations[voice];
    if (real !== undefined) return real;
  }
  if (line !== undefined) return estTalk(line, charPerSec);
  return 3.0;
}

// estMove(from,to,clip) = |to.x-from.x| / (VEL[clip]*speed)
export function estMove(
  fromX: number,
  toX: number,
  clip: ClipKey,
  speed: number,
): number {
  const v = VEL[clip] * speed;
  return Math.abs(toX - fromX) / v;
}

// 1/30s(1フレーム)グリッドへ量子化(累積誤差と非決定を排除)
export function quantize(t: number): number {
  return Math.round(t * FPS) / FPS;
}
