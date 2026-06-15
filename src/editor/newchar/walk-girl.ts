import type { ClipDoc, ClipKey } from "../../core/schema/clip.js";

// See-through 少女スプライト専用の歩行クリップ。
// Rusty Animator の "4 KEY POSES"/フルサイクル(frame1-25)を、このスプライトの
// リグ規約に合わせて作り起こしたもの:
//   ・thigh: +度 = 前(キャラは左向きなので画像左へ踏み出す)
//   ・shin : −度 = 膝が解剖学的に曲がる(下腿が後方へ→踵が尻へ上がる)
//   ・upperArm: +度 = 前、−度 = 後ろ(脚と逆位相=対立の振り)
//   ・ankle: +度 = 爪先上げ(踵接地)、−度 = 爪先下げ(爪先離れ)
//   ・torso: 負 = 前傾(上体を画像左へ)
//   ・root.y: 沈みで最低(0)、蹴り上げで最高(負に大)
// 左脚を t=0 で前(接地)に置き、右脚は半周(0.5)オフセット。
//
// 【滑らかさ】各キーで ease-in/out すると毎キーで速度が 0 になり「カクつく/止まる」。
// Spine のベジェ曲線のように速度をキーで止めないため、粗い制御点を周期的
// Catmull-Rom(有限差分接線の Hermite)で密サンプリングし、linear 補間の密キーへ
// 焼き込む → 速度連続でヌルッと回る。

type CP = [number, number]; // [位相 0..1, 値]

// 周期的 Catmull-Rom(非等間隔OK)で制御点を密サンプル。返り値は [t, v] 密キー(linear)。
function smoothLoop(cps: CP[], samples = 48): ClipKey[] {
  const n = cps.length;
  const ph = cps.map((c) => c[0]);
  const va = cps.map((c) => c[1]);
  // 周期境界をまたぐ有限差分接線 m_i = (v[i+1]-v[i-1]) / (p[i+1]-p[i-1])
  const m: number[] = [];
  for (let i = 0; i < n; i++) {
    const pPrev = i === 0 ? ph[n - 1]! - 1 : ph[i - 1]!;
    const pNext = i === n - 1 ? ph[0]! + 1 : ph[i + 1]!;
    m.push((va[(i + 1) % n]! - va[(i - 1 + n) % n]!) / (pNext - pPrev));
  }
  const out: ClipKey[] = [];
  for (let k = 0; k < samples; k++) {
    const t = k / samples; // 0..<1(ph[0]===0 前提)
    let i = 0;
    for (let j = 0; j < n; j++) if (ph[j]! <= t) i = j;
    const i0 = i, i1 = (i + 1) % n;
    const p0 = ph[i0]!;
    const p1 = i1 === 0 ? 1 : ph[i1]!; // ループ区間は 1.0 で閉じる
    const h = p1 - p0;
    const s = h > 0 ? (t - p0) / h : 0;
    // Hermite(接線は値/位相単位なので区間長 h を掛ける)
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const v = h00 * va[i0]! + h10 * h * m[i0]! + h01 * va[i1]! + h11 * h * m[i1]!;
    out.push([Math.round(t * 1e4) / 1e4, Math.round(v * 1e3) / 1e3]);
  }
  out.push([1, va[0]!]); // ループ閉じ(先頭値)
  return out;
}

// 半周オフセット(右脚=左脚の +0.5)
function offsetHalf(cps: CP[]): CP[] {
  return cps
    .map(([p, v]) => [(p + 0.5) % 1, v] as CP)
    .sort((a, b) => a[0] - b[0]);
}

// --- 左脚(t=0 で前接地)の制御点 ---
// 値は臨床歩行解析 + 古典2Dアニメ(Williams/Blair等)を統合した運動学スペック準拠。
// thigh は左右非対称(支持期はゆっくり後方へ伸展、遊脚期に素早く前へ振り出す)。
// 膝(=shin 負)の最大屈曲は遊脚初期(62.5%)で −62°、通過(75%)では既に開き始める。
const THIGH_L: CP[] = [
  [0, 25],     // 接地: 踵接地・前へ最大近く
  [0.125, 16], // 沈み(loading)
  [0.25, 4],   // 通過(midstance, ほぼ垂直)
  [0.375, -10], // 蹴り上げ(heel-off)
  [0.5, -12],  // 爪先離れ(最後方)
  [0.625, -2], // 遊脚初期(膝を畳んで持ち上げ)
  [0.75, 15],  // 遊脚中期(体の下を通過し前へ)
  [0.875, 27], // 遊脚後期(前へ最大リーチ)
];
const SHIN_L: CP[] = [
  [0, -5],      // 接地: ほぼ伸び(踵接地, 残5°)
  [0.125, -20], // 沈み: 受けの屈曲(loading bump)
  [0.25, -8],   // 通過(支持脚): ほぼ伸び
  [0.375, -6],  // 蹴り上げ(支持脚): 伸び切り近く
  [0.5, -38],   // 爪先離れ: 膝を畳み始める
  [0.625, -62], // 遊脚初期: 最大屈曲(踵が尻へ・足を上げてクリア)
  [0.75, -42],  // 遊脚中期: 開き始め
  [0.875, -14], // 遊脚後期: 前へ伸ばす
];
const ANKLE_L: CP[] = [
  [0, 0],       // 接地: 踵接地(ニュートラル)
  [0.125, -5],  // 沈み: 踵ロッカーで僅かに底屈
  [0.25, 6],    // 通過: 足首ロッカーで背屈
  [0.375, 10],  // 蹴り上げ: 最大背屈(踵離れ)
  [0.5, -16],   // 爪先離れ: 一気に底屈(爪先で蹴る)
  [0.625, -6],  // 遊脚: 戻し
  [0.75, -1],   // 遊脚中期: ほぼニュートラル
  [0.875, 0],   // 遊脚後期: 踵から入る準備
];
const ARM_L: CP[] = [[0, -18], [0.25, 0], [0.5, 18], [0.75, 0]]; // 脚と逆位相(腕は現状維持)
const TORSO: CP[] = [
  [0, -7], [0.125, -9], [0.25, -7], [0.375, -5], [0.5, -7], [0.625, -9], [0.75, -7], [0.875, -5],
];
const ROOT_Y: CP[] = [
  [0, -4], [0.125, 0], [0.25, -6], [0.375, -9], [0.5, -4], [0.625, 0], [0.75, -6], [0.875, -9],
];

export const CLIP_WALK_GIRL: ClipDoc = {
  formatVersion: 1,
  id: "walk-girl",
  label: "歩き(少女スプライト)",
  duration: 1.0,
  loop: true,
  virtualVelocity: 240,
  tracks: {
    bones: {
      thighL: { rot: smoothLoop(THIGH_L) },
      shinL: { rot: smoothLoop(SHIN_L) },
      thighR: { rot: smoothLoop(offsetHalf(THIGH_L)) },
      shinR: { rot: smoothLoop(offsetHalf(SHIN_L)) },
      upperArmL: { rot: smoothLoop(ARM_L) },
      upperArmR: { rot: smoothLoop(offsetHalf(ARM_L)) },
      forearmL: { rot: [[0, 12]] }, // 肘の軽い曲げ(一定)
      forearmR: { rot: [[0, 12]] },
      ankleL: { rot: smoothLoop(ANKLE_L) },
      ankleR: { rot: smoothLoop(offsetHalf(ANKLE_L)) },
      torso: { rot: smoothLoop(TORSO) },
    },
    root: { y: smoothLoop(ROOT_Y) },
    handShape: [[0, "relax"]],
  },
};
