import type { ClipDoc } from "../../core/schema/clip.js";

// うなずき2回。0.9s 単発
export const CLIP_NOD: ClipDoc = {
  formatVersion: 1,
  id: "nod",
  label: "うなずき",
  duration: 0.9,
  loop: false,
  virtualVelocity: 0,
  tracks: {
    bones: {
      head: {
        rot: [
          [0, 0, "sineInOut"],
          [0.2, 14, "sineInOut"],
          [0.35, 2, "sineInOut"],
          [0.55, 12, "sineInOut"],
          [0.9, 0],
        ],
      },
      torso: { rot: [[0, 0, "sineInOut"], [0.2, 2, "sineInOut"], [0.9, 0]] },
    },
    root: {},
    handShape: [],
  },
};
