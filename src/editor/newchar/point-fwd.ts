import type { ClipDoc } from "../../core/schema/clip.js";

// 「指差し(前向き・ゆったり)」。
// 一連の流れ: 腕を上げて指差し → 一拍保持 → 腕を下ろす。
//
// 3.6s ループ。位相は 0-33%=上げる / 33-66%=指差し保持 / 66-100%=下ろす。
// すべて sineInOut で繋いで動物の森的なスローライフ感。
// 既存 CLIP_POINT は upperArmL=-95° で画像右(=左向きキャラの背中側)を指す
// ので、新キャラの facing(画像左)と合わない。本クリップは +95° で前方向。
export const CLIP_POINT_FWD: ClipDoc = {
  formatVersion: 1,
  id: "point-fwd",
  label: "指差し",
  duration: 3.6,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      upperArmL: {
        rot: [
          [0, 0, "sineInOut"],
          [1.2, 95, "sineInOut"],
          [2.4, 95, "sineInOut"],
          [3.6, 0],
        ],
      },
      forearmL: {
        rot: [
          [0, 0, "sineInOut"],
          [1.2, 8, "sineInOut"],
          [2.4, 8, "sineInOut"],
          [3.6, 0],
        ],
      },
    },
    root: {},
    handShape: [[0, "open"], [0.6, "point"], [2.4, "point"], [3.0, "open"]],
  },
};
