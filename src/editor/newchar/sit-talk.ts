import type { ClipDoc } from "../../core/schema/clip.js";

// 着座したまま話す。CLIP_SIT の「座り終端」姿勢(脚・腰の沈み)を定数で保持しつつ、
// 上半身に CLIP_TALK_RELAX 相当の控えめな揺れ + うなずきを重ねる。口の開閉(リップ
// フラップ)はクリップではなく ticker 側で 4Hz で生成する(talk 判定が真の間)。
//
// - 脚(thigh/shin/ankle)と root.y は CLIP_SIT の t≥0.7 終端値をそのまま定数保持。
//   これにより sit → sit-talk のクロスフェードで脚が一切動かず、上半身だけ話し始める。
//   脚FK は rig 側で thigh×0.3 / shin×0.6 に縮小されるため、CLIP_SIT と同じ生値を使う。
// - torso/head/root.y は「座りの基準値 + talk の揺れ」。基準: torso=7, head=-2, root.y=40。
// - duration 3.6s, ループ。
export const CLIP_SIT_TALK: ClipDoc = {
  formatVersion: 1,
  id: "sit-talk",
  label: "座って話す",
  duration: 3.6,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      // --- 脚・足首: 座り終端を定数保持(CLIP_SIT と同値) ---
      thighL: { rot: [[0, 270]] },
      thighR: { rot: [[0, 262]] },
      shinL: { rot: [[0, -150]] },
      shinR: { rot: [[0, -146]] },
      ankleL: { rot: [[0, 0]] },
      ankleR: { rot: [[0, 0]] },
      // --- 上体: 座りの後傾(7) を基準に、talk のゆるい揺れを重ねる ---
      torso: {
        rot: [
          [0, 7, "sineInOut"],
          [1.8, 8.5, "sineInOut"],
          [3.6, 7],
        ],
      },
      head: {
        // 座りの基準 -2 を中心に、3.6s で 2 往復のうなずき(-5 を加算 → -7)。
        rot: [
          [0, -2, "sineInOut"],
          [0.9, -7, "sineInOut"],
          [1.8, -2, "sineInOut"],
          [2.7, -7, "sineInOut"],
          [3.6, -2],
        ],
      },
      // 腕は idle 同等のごく小さな前後揺れ。
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
      // 座りの沈み込み(40) を基準に、呼吸でわずかに上下。
      y: [
        [0, 40, "sineInOut"],
        [1.8, 41.6, "sineInOut"],
        [3.6, 40],
      ],
    },
    handShape: [[0, "relax"]],
  },
};
