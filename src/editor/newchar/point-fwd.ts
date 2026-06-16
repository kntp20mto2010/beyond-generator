import type { ClipDoc } from "../../core/schema/clip.js";

// 「指差し(前向き)」。
// 既存 CLIP_POINT は upperArmL=-95° で画像右(=左向きキャラの背中側)を指してしまう。
// 新キャラ(サクラ/リョウタ:画像左向き)では前=画像左 を指したいので符号を反転。
// 0.5s の単発、最終姿勢で保持。
export const CLIP_POINT_FWD: ClipDoc = {
  formatVersion: 1,
  id: "point-fwd",
  label: "指差し",
  duration: 0.5,
  loop: false,
  virtualVelocity: 0,
  tracks: {
    bones: {
      upperArmL: { rot: [[0, 0, "backOut"], [0.5, 95]] },
      forearmL: { rot: [[0, 0, "sineInOut"], [0.5, 8]] },
    },
    root: {},
    handShape: [[0, "open"], [0.2, "point"]],
  },
};
