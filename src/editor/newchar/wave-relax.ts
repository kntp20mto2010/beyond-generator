import type { ClipDoc } from "../../core/schema/clip.js";

// 「ゆったり手を振る」(どうぶつの森的なスローライフ感)。
// 設計メモ:
//  ・upperArm pivot を armpit に下げて回転中心は実関節。
//  ・side-view chibi で「前方に振る」と顔と被る → 腕を真上に上げる方向にする。
//    upperArmR=+170°(ほぼ垂直、5° だけ前傾)。
//  ・forearmR=±20° 振り(基準 0)で手首を左右にスイング。肘は伸ばし気味。
//    周期は 2 サイクル/2.4s ≒ 0.83Hz、sineInOut でゆったり。
export const CLIP_WAVE_RELAX: ClipDoc = {
  formatVersion: 1,
  id: "wave-relax",
  label: "手を振る(ゆったり)",
  duration: 2.4,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      upperArmR: { rot: [[0, 150]] },
      forearmR: {
        rot: [
          [0, -15, "sineInOut"],
          [0.6, 15, "sineInOut"],
          [1.2, -15, "sineInOut"],
          [1.8, 15, "sineInOut"],
          [2.4, -15],
        ],
      },
      head: { rot: [[0, 5]] },
    },
    root: {},
    handShape: [[0, "open"]],
  },
};
