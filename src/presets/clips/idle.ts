import type { ClipDoc } from "../../core/schema/clip.js";

export const CLIP_IDLE: ClipDoc = {
  formatVersion: 1,
  id: "idle",
  label: "待機",
  duration: 3.2,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      torso: { rot: [[0, 0, "sineInOut"], [1.6, 1.8, "sineInOut"], [3.2, 0]] },
      head: { rot: [[0, 0.6, "sineInOut"], [1.9, -0.8, "sineInOut"], [3.2, 0.6]] },
      upperArmL: { rot: [[0, 1.2, "sineInOut"], [1.6, -1.2, "sineInOut"], [3.2, 1.2]] },
      upperArmR: { rot: [[0, -1.2, "sineInOut"], [1.6, 1.2, "sineInOut"], [3.2, -1.2]] },
    },
    root: {
      y: [[0, 0, "sineInOut"], [1.6, 2.2, "sineInOut"], [3.2, 0]],
    },
    handShape: [[0, "relax"]],
  },
};
