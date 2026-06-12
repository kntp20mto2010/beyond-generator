import type { CameraState } from "../../runtime/scene-eval.js";
import { STAGE_H, STAGE_W } from "../../runtime/scene-eval.js";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 「全景」プリセット: ステージ中央・等倍
export const OVERVIEW_CAMERA: CameraState = { x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1 };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// 「選択要素に寄る」: bounds中心をやや上寄りに置き、高さからzoomを決める(純関数)
export function focusOnBounds(b: Bounds): CameraState {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2 - b.height * 0.15;
  const zoom = b.height > 0 ? clamp(STAGE_H / (b.height * 1.6), 1, 2.5) : 1;
  return { x: cx, y: cy, zoom };
}
