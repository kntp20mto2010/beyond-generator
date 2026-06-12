import type { ClipDoc } from "../../core/schema/clip.js";

// 手を振る。0.9s ループ
export const CLIP_WAVE: ClipDoc = {
  formatVersion: 1,
  id: "wave",
  label: "手を振る",
  duration: 0.9,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      upperArmL: { rot: [[0, -150]] },
      forearmL: {
        rot: [
          [0, -30, "sineInOut"],
          [0.225, 20, "sineInOut"],
          [0.45, -30, "sineInOut"],
          [0.675, 20, "sineInOut"],
          [0.9, -30],
        ],
      },
      head: { rot: [[0, 4]] },
    },
    root: {},
    handShape: [[0, "open"]],
  },
};
