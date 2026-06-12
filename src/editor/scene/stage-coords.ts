import { STAGE_H, STAGE_W, type CameraState } from "../../runtime/scene-eval.js";

// ステージ表示は 1920×1080 を 0.5 スケールで 960×540 に収める
export const STAGE_SCALE = 0.5;
export const VIEW_W = STAGE_W * STAGE_SCALE; // 960
export const VIEW_H = STAGE_H * STAGE_SCALE; // 540

const IDENTITY_CAM: CameraState = { x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1 };

// 画面(canvas内ピクセル)座標 → ステージ座標(1920×1080系)。カメラを加味
export function screenToStage(
  px: number,
  py: number,
  cam: CameraState = IDENTITY_CAM,
): [number, number] {
  const s = STAGE_SCALE * cam.zoom;
  return [(px - VIEW_W / 2) / s + cam.x, (py - VIEW_H / 2) / s + cam.y];
}

// ステージ座標 → 画面座標(screenToStage の逆)。4b-2のガイド描画用
export function stageToScreen(
  sx: number,
  sy: number,
  cam: CameraState = IDENTITY_CAM,
): [number, number] {
  const s = STAGE_SCALE * cam.zoom;
  return [(sx - cam.x) * s + VIEW_W / 2, (sy - cam.y) * s + VIEW_H / 2];
}

export { STAGE_W, STAGE_H };
