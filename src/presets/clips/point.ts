import type { ClipDoc } from "../../core/schema/clip.js";

// 指差し。0.5s 単発。最終姿勢で保持
export const CLIP_POINT: ClipDoc = {
  formatVersion: 1,
  id: "point",
  label: "指差し",
  duration: 0.5,
  loop: false,
  virtualVelocity: 0,
  tracks: {
    bones: {
      upperArmL: { rot: [[0, 0, "backOut"], [0.5, -95]] },
      forearmL: { rot: [[0, 0, "sineInOut"], [0.5, -8]] },
    },
    root: {},
    handShape: [[0, "open"], [0.2, "point"]],
  },
};
