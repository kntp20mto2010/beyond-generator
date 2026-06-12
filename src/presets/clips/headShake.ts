import type { ClipDoc } from "../../core/schema/clip.js";

// 首振り(イヤイヤ)。0.8s 単発
export const CLIP_HEAD_SHAKE: ClipDoc = {
  formatVersion: 1,
  id: "headShake",
  label: "首振り",
  duration: 0.8,
  loop: false,
  virtualVelocity: 0,
  tracks: {
    bones: {
      head: {
        rot: [
          [0, 0, "sineInOut"],
          [0.2, -9, "sineInOut"],
          [0.4, 8, "sineInOut"],
          [0.6, -6, "sineInOut"],
          [0.8, 0],
        ],
      },
    },
    root: {},
    handShape: [],
  },
};
