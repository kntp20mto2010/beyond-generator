import type { BoneId } from "../../runtime/skeleton.js";

// キャラクター設定: 1キャラ分のランドマーク/フレーム/閾値を全て保持。
// 切替時はこの dict から該当キャラを取り出して useEffect 内で参照する。

export type Frame = [number, number, number, number];
export interface Layer { jp: string; file: string; frame: Frame }
export interface Piece {
  key: string; file: string; frame: Frame; pivot: [number, number];
  parent: string; bone: BoneId | null; amp?: number;
}

export interface CharConfig {
  dir: string;            // texture asset dir
  label: string;          // 表示名
  // 解剖学アンカー(texture px)
  hip: [number, number];          // 全体の基準(画像→canvas変換アンカー)
  hairPivot: [number, number];    // 後ろ髪のピボット
  hipL: [number, number];
  hipR: [number, number];
  kneeL: [number, number];
  kneeR: [number, number];
  ankleL: [number, number];
  ankleR: [number, number];
  // canvas 配置
  hipCanvas: [number, number];   // 画面上の HIP 描画位置(中央付近)
  bobK: number;                  // clip bob → 画像px の換算(身長比例)
  // IK
  groundY: number;
  step: number;
  lift: number;
  // レイヤー(see-through sprite)
  backLayers: Layer[];
  frontLayers: Layer[];
  arms: Piece[];
  // 剛体カットアウト用の脚 frame
  thighLFrame: Frame;
  shinLFrame: Frame;
  thighRFrame: Frame;
  shinRFrame: Frame;
  // 靴(connected components で抽出した per-shoe PNG)
  footLFile: string; // 通常 "footwear_L.png"
  footRFile: string; // 通常 "footwear_R.png"
  footLFrame: Frame;
  footRFrame: Frame;
  // 脚メッシュ
  meshGx0: number; meshGx1: number;
  meshGy0: number; meshGy1: number;
  midline: number; // body center x(legMixL/Rを分ける境界)
  // 重み smoothstep 閾値(身長や腿長で異なる)
  wPRange: [number, number];   // pelvis を保つ y帯
  kTRange: [number, number];   // 太腿→脛
  sLRange: [number, number];   // 左右脚ブレンドの x帯
  lowerYRange: [number, number]; // mix の上半身/下半身切替 y
  // バルジ
  crotchY: number;
  legCenterLX: number;
  legCenterRX: number;
  // 腕メッシュ(handwear 内)
  armLBbox: [number, number, number, number];
  armRBbox: [number, number, number, number];
  elbowYL: number;
  elbowYR: number;
  // ボーン overlay 用の upper-local 座標
  neckYLocal: number;
  headTopYLocal: number;
  wristLOffset: [number, number]; // forearmL-local
  wristROffset: [number, number]; // forearmR-local
}

// 旧 sakura 値(seethrough-girl から rename)
export const SAKURA_CFG: CharConfig = {
  dir: "/assets/characters/sakura",
  label: "サクラ(女子)",
  hip: [614, 540],
  hairPivot: [641, 175],
  hipL: [594, 595],
  hipR: [640, 595],
  kneeL: [581, 705],
  kneeR: [652, 705],
  ankleL: [575, 885],
  ankleR: [660, 885],
  hipCanvas: [240, 296],
  bobK: 850 / 658,
  groundY: 875, step: 100, lift: 50,
  backLayers: [{ jp: "後ろ髪", file: "back_hair.png", frame: [540, 125, 202, 185] }],
  frontLayers: [
    { jp: "上着", file: "topwear.png", frame: [557, 291, 154, 195] },
    { jp: "首", file: "neck.png", frame: [618, 272, 37, 57] },
    { jp: "頭", file: "head.png", frame: [564, 158, 122, 135] },
    { jp: "耳", file: "ears.png", frame: [657, 237, 30, 37] },
    { jp: "顔", file: "face.png", frame: [564, 135, 111, 157] },
    { jp: "口", file: "mouth.png", frame: [587, 268, 13, 6] },
    { jp: "白目", file: "eyewhite.png", frame: [570, 220, 69, 36] },
    { jp: "瞳", file: "irides.png", frame: [573, 224, 52, 32] },
    { jp: "睫毛", file: "eyelash.png", frame: [567, 215, 75, 32] },
    { jp: "眉", file: "eyebrow.png", frame: [572, 199, 67, 12] },
    { jp: "前髪", file: "front_hair.png", frame: [547, 129, 155, 181] },
  ],
  arms: [
    { key: "upperArmL", file: "handwear.png", frame: [534, 332, 76, 161], pivot: [572, 340], parent: "upper", bone: "upperArmL", amp: 1.0 },
    { key: "forearmL", file: "handwear.png", frame: [517, 493, 77, 162], pivot: [555, 500], parent: "upperArmL", bone: "forearmL", amp: 1.0 },
    { key: "upperArmR", file: "handwear.png", frame: [663, 323, 76, 171], pivot: [701, 332], parent: "upper", bone: "upperArmR", amp: 1.0 },
    { key: "forearmR", file: "handwear.png", frame: [666, 495, 81, 173], pivot: [706, 502], parent: "upperArmR", bone: "forearmR", amp: 1.0 },
  ],
  thighLFrame: [548, 480, 65, 230],
  shinLFrame: [553, 705, 50, 187],
  thighRFrame: [613, 480, 67, 228],
  shinRFrame: [629, 705, 47, 187],
  footLFile: "footwear_L.png", footRFile: "footwear_R.png",
  footLFrame: [523, 875, 83, 105],
  footRFrame: [601, 880, 78, 115],
  meshGx0: 548, meshGx1: 680, meshGy0: 480, meshGy1: 890,
  midline: 614,
  wPRange: [530, 600],
  kTRange: [670, 740],
  sLRange: [584, 644],
  lowerYRange: [640, 720],
  crotchY: 575,
  legCenterLX: 582,
  legCenterRX: 652,
  armLBbox: [534, 332, 610, 655],
  armRBbox: [663, 323, 739, 668],
  elbowYL: 493,
  elbowYR: 495,
  neckYLocal: -268,
  headTopYLocal: -382,
  wristLOffset: [-24, 155],
  wristROffset: [-11, 155],
};

// 新キャラ ryouta(男子)。result(7) のlandmarks実測値ベース。
export const RYOUTA_CFG: CharConfig = {
  dir: "/assets/characters/ryouta",
  label: "リョウタ(男子)",
  // 脚の付け根/膝/踵の座標は legwear.png/footwear_*.png の実画素計測値:
  //   真の股下(両脚が分かれる y)= 639, 左脚 centroid x=567, 右脚 centroid x=656
  //   左靴/右靴の頂点 y = 1085 / 1097 → ankle y。
  // hip(合流点)は新 hipL/hipR の中点 x=611.5 ≒ 612 に置き、joint線(y=629)から
  // 約54px 上の y=575 とする(サクラ比とほぼ同じ寄せ方)。
  // hipCanvas は `position = frame - HIP` を S=0.40 倍した分だけ逆補正。
  hip: [612, 575],
  hairPivot: [628, 70],
  hipL: [567, 629],
  hipR: [656, 629],
  kneeL: [572, 857],
  kneeR: [672, 863],
  ankleL: [569, 1085],
  ankleR: [679, 1097],
  hipCanvas: [228, 291],
  bobK: 1.4,
  groundY: 1097, step: 140, lift: 70,
  backLayers: [{ jp: "後ろ髪", file: "back_hair.png", frame: [520, 22, 216, 212] }],
  frontLayers: [
    { jp: "上着", file: "topwear.png", frame: [519, 244, 232, 358] },
    { jp: "首", file: "neck.png", frame: [607, 189, 64, 73] },
    { jp: "頭", file: "head.png", frame: [554, 72, 146, 164] },
    { jp: "耳", file: "ears.png", frame: [562, 154, 139, 44] },
    { jp: "顔", file: "face.png", frame: [553, 81, 128, 154] },
    { jp: "口", file: "mouth.png", frame: [587, 203, 27, 7] },
    { jp: "白目", file: "eyewhite.png", frame: [563, 149, 81, 30] },
    { jp: "瞳", file: "irides.png", frame: [569, 152, 63, 26] },
    { jp: "睫毛", file: "eyelash.png", frame: [562, 142, 86, 26] },
    { jp: "眉", file: "eyebrow.png", frame: [552, 129, 99, 11] },
    { jp: "前髪", file: "front_hair.png", frame: [536, 43, 177, 136] },
  ],
  // 腕は handwear 内の bbox を半分にして上腕/前腕に分割
  arms: [
    { key: "upperArmL", file: "handwear.png", frame: [487, 284, 116, 205], pivot: [545, 292], parent: "upper", bone: "upperArmL", amp: 1.0 },
    { key: "forearmL", file: "handwear.png", frame: [487, 489, 116, 205], pivot: [527, 495], parent: "upperArmL", bone: "forearmL", amp: 1.0 },
    { key: "upperArmR", file: "handwear.png", frame: [691, 285, 94, 209], pivot: [738, 292], parent: "upper", bone: "upperArmR", amp: 1.0 },
    { key: "forearmR", file: "handwear.png", frame: [691, 494, 94, 209], pivot: [738, 500], parent: "upperArmR", bone: "forearmR", amp: 1.0 },
  ],
  thighLFrame: [531, 551, 104, 299],
  shinLFrame: [548, 850, 70, 271],
  thighRFrame: [635, 551, 70, 299],
  shinRFrame: [635, 850, 70, 271],
  footLFile: "footwear_L.png", footRFile: "footwear_R.png",
  footLFrame: [478, 1085, 128, 97],
  footRFrame: [606, 1097, 107, 112],
  // メッシュは waistband 上端 551 から ankle 下端 1122 まで。両脚 mesh は legBack に
  // 置く運用なので、上着の下端より上の領域は jacket に隠されて見えない。ズボン上部の
  // 続きが上着の裏で常に保たれるので、上下身が分離して見えない。
  meshGx0: 531, meshGx1: 704, meshGy0: 551, meshGy1: 1122,
  midline: 612,
  wPRange: [620, 680],
  kTRange: [820, 880],
  sLRange: [582, 642],
  lowerYRange: [800, 870],
  crotchY: 639,
  legCenterLX: 567,
  legCenterRX: 656,
  armLBbox: [487, 284, 602, 691],
  armRBbox: [691, 285, 784, 703],
  elbowYL: 487,
  elbowYR: 494,
  neckYLocal: -391,
  headTopYLocal: -508,
  wristLOffset: [-30, 200],
  wristROffset: [-10, 205],
};

export const CHARS = { sakura: SAKURA_CFG, ryouta: RYOUTA_CFG } as const;
export type CharKey = keyof typeof CHARS;
