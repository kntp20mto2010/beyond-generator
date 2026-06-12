import { STAGE_H, STAGE_W } from "../../runtime/scene-eval.js";

// ステージ表示は 1920×1080 を 0.5 スケールで 960×540 に収める
export const STAGE_SCALE = 0.5;
export const VIEW_W = STAGE_W * STAGE_SCALE; // 960
export const VIEW_H = STAGE_H * STAGE_SCALE; // 540

// 画面(canvas内ピクセル)座標 → ステージ座標(1920×1080系)
export function screenToStage(px: number, py: number): [number, number] {
  return [px / STAGE_SCALE, py / STAGE_SCALE];
}

export { STAGE_W, STAGE_H };
