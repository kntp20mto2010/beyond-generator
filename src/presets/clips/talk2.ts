import type { ClipDoc } from "../../core/schema/clip.js";

// 両手交互トーク。2.0s ループ
export const CLIP_TALK2: ClipDoc = {
  formatVersion: 1,
  id: "talk2",
  label: "会話B",
  duration: 2.0,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      upperArmL: { rot: [[0, -45, "sineInOut"], [0.5, -25, "sineInOut"], [1.0, -45, "sineInOut"], [1.5, -25, "sineInOut"], [2.0, -45]] },
      upperArmR: { rot: [[0, 25, "sineInOut"], [0.5, 45, "sineInOut"], [1.0, 25, "sineInOut"], [1.5, 45, "sineInOut"], [2.0, 25]] },
      forearmL: { rot: [[0, -15, "sineInOut"], [0.5, 15, "sineInOut"], [1.0, -15, "sineInOut"], [1.5, 15, "sineInOut"], [2.0, -15]] },
      forearmR: { rot: [[0, 15, "sineInOut"], [0.5, -15, "sineInOut"], [1.0, 15, "sineInOut"], [1.5, -15, "sineInOut"], [2.0, 15]] },
      head: { rot: [[0, 0, "sineInOut"], [0.5, 3, "sineInOut"], [1.0, 0, "sineInOut"], [1.5, 3, "sineInOut"], [2.0, 0]] },
    },
    root: {},
    handShape: [[0, "open"]],
  },
};
