import type { ClipDoc } from "../../core/schema/clip.js";

// 「ゆったり手を振る」(どうぶつの森的なスローライフ感)。
// 既存 CLIP_WAVE は upperArmL を上げて 0.9s で速すぎる。リョウタ/サクラは左向きなので
// カメラ側=texture-R の upperArmR を 2.4s 周期で上前方へ。
//
// 肩キャップの「付け根浮遊」問題は腕メッシュ側で構造解決済み(rest/upperArm/forearm
// の 3 ボーン skinning で上端を身体に貼り付け、その下から回転に渡す)。
// なのでクリップ側は素直に upperArm を +150° で上げて OK。
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
