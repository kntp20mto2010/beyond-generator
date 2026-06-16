import type { ClipDoc } from "../../core/schema/clip.js";

// 椅子に座るポーズ。ほぼ静止(微かな呼吸のみ)。
// 脚FK(rig側で thigh×0.3 / shin×0.6 に縮小)で十分曲がるよう、クリップ角度は
// 実効角の逆数で補償した大きめの値にしている。
//   太腿: 実効 約 -70° (前方へ) → -70/0.3 ≈ -233
//   脛  : 実効 約 +78° (膝から下ろす) → 78/0.6 ≈ 130
// 値は新キャラタブで見ながら微調整する前提の初期値。
export const CLIP_SIT: ClipDoc = {
  formatVersion: 1,
  id: "sit",
  label: "座る",
  duration: 4,
  loop: true,
  virtualVelocity: 0,
  tracks: {
    bones: {
      // 脚: 太腿を前(=向いている方向=左)へ出し、膝から脛を下ろす(足は床へ)。
      // 素=左向きなので太腿は正回転で前方(左)へ。脛は負で膝を曲げ足を下ろす。
      thighL: { rot: [[0, 270]] },
      thighR: { rot: [[0, 262]] },
      shinL: { rot: [[0, -150]] },
      shinR: { rot: [[0, -146]] },
      ankleL: { rot: [[0, 0]] },
      ankleR: { rot: [[0, 0]] },
      // 上体: 軽く後傾(=向きと逆の右へ寄る)。座って背を預ける自然な姿勢 + 呼吸。
      torso: { rot: [[0, 7, "sineInOut"], [2, 8.4, "sineInOut"], [4, 7]] },
      head: { rot: [[0, -2]] },
    },
    root: {
      // 微かな上下(呼吸)。
      y: [[0, 0, "sineInOut"], [2, 1.4, "sineInOut"], [4, 0]],
    },
    handShape: [[0, "relax"]],
  },
};
