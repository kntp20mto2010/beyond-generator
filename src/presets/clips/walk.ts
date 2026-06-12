import type { ClipDoc } from "../../core/schema/clip.js";

// 1サイクル=左右1歩ずつ(0.8s)。接地が t=0/0.4、通過が t=0.2/0.6
export const CLIP_WALK: ClipDoc = {
  formatVersion: 1,
  id: "walk",
  label: "歩き",
  duration: 0.8,
  loop: true,
  virtualVelocity: 240,
  tracks: {
    bones: {
      thighL: { rot: [[0, 25, "sineInOut"], [0.4, -25, "sineInOut"], [0.8, 25]] },
      thighR: { rot: [[0, -25, "sineInOut"], [0.4, 25, "sineInOut"], [0.8, -25]] },
      shinL: {
        rot: [[0, 6, "sineInOut"], [0.2, 2, "sineInOut"], [0.4, 10, "sineInOut"], [0.6, 44, "sineInOut"], [0.8, 6]],
      },
      shinR: {
        rot: [[0, 10, "sineInOut"], [0.2, 44, "sineInOut"], [0.4, 6, "sineInOut"], [0.6, 2, "sineInOut"], [0.8, 10]],
      },
      upperArmL: { rot: [[0, -18, "sineInOut"], [0.4, 18, "sineInOut"], [0.8, -18]] },
      upperArmR: { rot: [[0, 18, "sineInOut"], [0.4, -18, "sineInOut"], [0.8, 18]] },
      forearmL: { rot: [[0, 9]] },
      forearmR: { rot: [[0, 9]] },
      torso: { rot: [[0, 4]] },
      head: {
        rot: [[0, -1.5, "sineInOut"], [0.2, -2.5, "sineInOut"], [0.4, -1.5, "sineInOut"], [0.6, -2.5, "sineInOut"], [0.8, -1.5]],
      },
    },
    root: {
      // 接地で低く(y=0)、通過で高く(y=-5)
      y: [[0, 0, "sineInOut"], [0.2, -5, "sineInOut"], [0.4, 0, "sineInOut"], [0.6, -5, "sineInOut"], [0.8, 0]],
    },
    handShape: [[0, "relax"]],
  },
};
