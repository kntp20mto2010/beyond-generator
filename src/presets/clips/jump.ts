import type { ClipDoc } from "../../core/schema/clip.js";

// ジャンプ。1.0s 単発
export const CLIP_JUMP: ClipDoc = {
  formatVersion: 1,
  id: "jump",
  label: "ジャンプ",
  duration: 1.0,
  loop: false,
  virtualVelocity: 0,
  tracks: {
    bones: {
      torso: {
        rot: [
          [0, 0, "sineInOut"],
          [0.25, 8, "sineInOut"],
          [0.55, 0, "sineInOut"],
          [0.8, 6, "sineInOut"],
          [1.0, 0],
        ],
      },
      thighL: {
        rot: [
          [0, 0, "sineInOut"],
          [0.25, 20, "sineInOut"],
          [0.55, -15, "sineInOut"],
          [0.8, 20, "sineInOut"],
          [1.0, 0],
        ],
      },
      thighR: {
        rot: [
          [0, 0, "sineInOut"],
          [0.25, -20, "sineInOut"],
          [0.55, 15, "sineInOut"],
          [0.8, -20, "sineInOut"],
          [1.0, 0],
        ],
      },
      shinL: {
        rot: [
          [0, 0, "sineInOut"],
          [0.25, 30, "sineInOut"],
          [0.55, 5, "sineInOut"],
          [0.8, 30, "sineInOut"],
          [1.0, 0],
        ],
      },
      shinR: {
        rot: [
          [0, 0, "sineInOut"],
          [0.25, 30, "sineInOut"],
          [0.55, 5, "sineInOut"],
          [0.8, 30, "sineInOut"],
          [1.0, 0],
        ],
      },
      upperArmL: {
        rot: [
          [0, 0, "sineInOut"],
          [0.25, -20, "quadOut"],
          [0.55, -140, "sineInOut"],
          [0.8, -20, "quadIn"],
          [1.0, 0],
        ],
      },
      upperArmR: {
        rot: [
          [0, 0, "sineInOut"],
          [0.25, 20, "quadOut"],
          [0.55, 140, "sineInOut"],
          [0.8, 20, "quadIn"],
          [1.0, 0],
        ],
      },
    },
    root: {
      y: [
        [0, 0, "sineInOut"],
        [0.25, 12, "quadOut"],
        [0.55, -75, "quadIn"],
        [0.8, 0],
        [1.0, 0],
      ],
    },
    handShape: [[0, "open"]],
  },
};
