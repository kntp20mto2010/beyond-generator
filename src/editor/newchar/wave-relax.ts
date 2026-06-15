import type { ClipDoc } from "../../core/schema/clip.js";

// 「ゆったり手を振る」(どうぶつの森的なスローライフ感)。
// 既存の CLIP_WAVE(0.9s, upperArmL)は左向きキャラだと「後ろ腕を上げる」になり
// 方向が違う(カメラ側=手前=texture-R に上げたい)。さらにテンポも倍以上ゆっくり。
//
// upperArmR を上前方へ +150°(rest=真下から CCW 150°)、頭は +5° で軽く受け側へ。
// forearmR は ±20° を 2 サイクル(2.4s)= ~0.83Hz でゆったり往復(sineInOut)。
export const CLIP_WAVE_RELAX: ClipDoc = {
  formatVersion: 1,
  id: "wave-relax",
  label: "手を振る(ゆったり)",
  duration: 2.4,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      upperArmR: { rot: [[0, 150]] },
      forearmR: {
        rot: [
          [0, -20, "sineInOut"],
          [0.6, 20, "sineInOut"],
          [1.2, -20, "sineInOut"],
          [1.8, 20, "sineInOut"],
          [2.4, -20],
        ],
      },
      head: { rot: [[0, 5]] },
    },
    root: {},
    handShape: [[0, "open"]],
  },
};
