import type { ClipDoc } from "../../core/schema/clip.js";

// 1サイクル0.52s。前傾+大きな腕振り+飛翔期2回のバウンス
export const CLIP_RUN: ClipDoc = {
  formatVersion: 1,
  id: "run",
  label: "走り",
  duration: 0.52,
  loop: true,
  virtualVelocity: 580,
  tracks: {
    bones: {
      thighL: { rot: [[0, 48, "sineInOut"], [0.26, -44, "sineInOut"], [0.52, 48]] },
      thighR: { rot: [[0, -44, "sineInOut"], [0.26, 48, "sineInOut"], [0.52, -44]] },
      shinL: {
        rot: [[0, 16, "sineInOut"], [0.13, 34, "sineInOut"], [0.26, 74, "sineInOut"], [0.39, 30, "sineInOut"], [0.52, 16]],
      },
      shinR: {
        rot: [[0, 74, "sineInOut"], [0.13, 30, "sineInOut"], [0.26, 16, "sineInOut"], [0.39, 34, "sineInOut"], [0.52, 74]],
      },
      upperArmL: { rot: [[0, -36, "sineInOut"], [0.26, 34, "sineInOut"], [0.52, -36]] },
      upperArmR: { rot: [[0, 34, "sineInOut"], [0.26, -36, "sineInOut"], [0.52, 34]] },
      forearmL: { rot: [[0, 42]] },
      forearmR: { rot: [[0, 42]] },
      torso: { rot: [[0, 13]] },
      head: {
        rot: [[0, -4, "sineInOut"], [0.13, -6, "sineInOut"], [0.26, -4, "sineInOut"], [0.39, -6, "sineInOut"], [0.52, -4]],
      },
    },
    root: {
      y: [[0, -2, "quadOut"], [0.13, -14, "quadIn"], [0.26, -2, "quadOut"], [0.39, -14, "quadIn"], [0.52, -2]],
    },
    handShape: [[0, "fist"]],
  },
};
