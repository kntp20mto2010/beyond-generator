import type { ClipDoc } from "../../core/schema/clip.js";

// 着座アニメ: 待機(脚まっすぐ)から腰を下ろして座り姿勢へ。loop=false の一回再生。
// - 脚FK(rig側で thigh×0.3 / shin×0.6 に縮小)で十分曲がるよう、終端角度は実効角の
//   逆数で補償した大きめの値。素=左向きなので太腿は正回転で前方(左)へ、脛は負で膝を曲げる。
//   太腿: 実効 約 +81° → 270 / 脛: 実効 約 -90° → -150
// - root.y で腰を沈める(脚を曲げると足が上がる分を相殺し、腰だけ下がって見える)。
// - 0〜0.7s で着座、その後はごく僅かな呼吸。loop=false なので末尾(座り)で保持される。
export const CLIP_SIT: ClipDoc = {
  formatVersion: 1,
  id: "sit",
  label: "座る",
  duration: 4,
  loop: false,
  virtualVelocity: 0,
  tracks: {
    bones: {
      // 脚: 待機(0)→前へ出して膝を曲げる(座り)。
      thighL: { rot: [[0, 0, "quadOut"], [0.7, 270]] },
      thighR: { rot: [[0, 0, "quadOut"], [0.7, 262]] },
      shinL: { rot: [[0, 0, "quadOut"], [0.7, -150]] },
      shinR: { rot: [[0, 0, "quadOut"], [0.7, -146]] },
      ankleL: { rot: [[0, 0]] },
      ankleR: { rot: [[0, 0]] },
      // 上体: 着座で軽く後傾 + 以後ゆるい呼吸。
      torso: { rot: [[0, 0, "quadOut"], [0.7, 7, "sineInOut"], [2.3, 8.4, "sineInOut"], [4, 7]] },
      head: { rot: [[0, 0, "quadOut"], [0.7, -2]] },
    },
    root: {
      // 腰を沈める(着座)。以後は呼吸でわずかに上下。
      y: [[0, 0, "quadOut"], [0.7, 40, "sineInOut"], [2.3, 42, "sineInOut"], [4, 40]],
    },
    handShape: [[0, "relax"]],
  },
};
