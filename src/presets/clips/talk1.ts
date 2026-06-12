import type { ClipDoc } from "../../core/schema/clip.js";

// 片手説明トーク。1.6s ループ
export const CLIP_TALK1: ClipDoc = {
  formatVersion: 1,
  id: "talk1",
  label: "会話A",
  duration: 1.6,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      upperArmL: { rot: [[0, -60, "sineInOut"], [0.4, -40, "sineInOut"], [0.8, -60, "sineInOut"], [1.2, -40, "sineInOut"], [1.6, -60]] },
      forearmL: { rot: [[0, -42, "sineInOut"], [0.4, -18, "sineInOut"], [0.8, -42, "sineInOut"], [1.2, -18, "sineInOut"], [1.6, -42]] },
      head: { rot: [[0, 0, "sineInOut"], [0.4, 3, "sineInOut"], [0.8, 0, "sineInOut"], [1.2, 3, "sineInOut"], [1.6, 0]] },
      torso: { rot: [[0, 3]] },
    },
    root: {},
    handShape: [[0, "open"]],
  },
};
