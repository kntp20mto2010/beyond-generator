import type { ClipDoc } from "../../core/schema/clip.js";

// 「話す(ゆったり)」。
// 待機(CLIP_IDLE)の控えめな身体ゆらぎをベースに、頭をやや大きめに上下させて
// 「話し相手と呼吸を合わせるうなずき」を演出。口の開閉(リップフラップ)は
// クリップではなく ticker 側で 4Hz で生成する(poseRef==="talk" の間)。
//
// duration 3.6s, ループ。手は idle と同程度のごく小さな前後揺れ。
export const CLIP_TALK_RELAX: ClipDoc = {
  formatVersion: 1,
  id: "talk-relax",
  label: "話す",
  duration: 3.6,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      torso: {
        rot: [
          [0, 0, "sineInOut"],
          [1.8, 1.5, "sineInOut"],
          [3.6, 0],
        ],
      },
      head: {
        // 1 サイクル=3.6s で 2 往復のうなずき。
        rot: [
          [0, 0, "sineInOut"],
          [0.9, -5, "sineInOut"],
          [1.8, 0, "sineInOut"],
          [2.7, -5, "sineInOut"],
          [3.6, 0],
        ],
      },
      upperArmL: {
        rot: [
          [0, 1.0, "sineInOut"],
          [1.8, -1.0, "sineInOut"],
          [3.6, 1.0],
        ],
      },
      upperArmR: {
        rot: [
          [0, -1.0, "sineInOut"],
          [1.8, 1.0, "sineInOut"],
          [3.6, -1.0],
        ],
      },
    },
    root: {
      y: [
        [0, 0, "sineInOut"],
        [1.8, 1.6, "sineInOut"],
        [3.6, 0],
      ],
    },
    handShape: [[0, "relax"]],
  },
};
