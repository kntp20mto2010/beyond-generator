import { GRID } from "./grid.js";
import type { PlacementRule } from "./room-regions/types.js";

// 配置可能オブジェクト(家具/小物)のカタログ。AddPanel のオブジェクト一覧 +
// グリッド footprint + 座面アンカーに使う。src はリポジトリ相対の透過PNGパス。
//
// 各家具は最大 **3 視点(views: front / front-dimetric / side)** を持てる。
//   - front          : 真正面 elevation(orthographic, no perspective, no top visible)
//   - front-dimetric : dimetric 2:1 + sitting eye-level(L1b、AC 風配置)
//   - side           : 壁這う(v10 wall-aligned)。元 PNG の向き(左壁正本 / 右壁正本)は
//                      variant.wallOrigin で宣言し、配置先の壁と異なれば render 時に自動 flipX。
// 配置時の view 選択で見た目を切り替える(どうぶつの森方式)。
//
// サイズはグリッドの n×m セルで定義し(全体の統一感のため)、scale は
// 「幅 = cells.w セル」になるよう nativeW から導出する(objectScale)。
// オブジェクトのサイズ密度: 画像の約 PX_PER_CELL px が 1 グリッドセルに収まるよう
// リサイズする(例 900×1200px → 3×4セル)。footprint セルは native/PX_PER_CELL を
// 繰り上げ(ceil)。端数が出る画像はセルに収まるよう必ず1セル大きい箱にする。
export const PX_PER_CELL = 300;

export function cellsFromNative(nativeW: number, nativeH: number): { w: number; h: number } {
  return {
    w: Math.max(1, Math.ceil(nativeW / PX_PER_CELL)),
    h: Math.max(1, Math.ceil(nativeH / PX_PER_CELL)),
  };
}

// 視点ごとの投影設定(カメラ・軸傾き・projection type)。ObjectPage カードに表示する。
export interface ProjectionInfo {
  type: string;                       // "dimetric 2:1" / "weak high-angle" / "wall-aligned v10" etc.
  eyeLevelCm?: number | "sitting";    // カメラ目線の高さ(cm)、"sitting" = 着席アイレベル
  rotationDeg?: number;               // yaw(横回転)
  cameraTiltDeg?: number;             // pitch(俯仰)、+ = 見下ろし
  lateralAxisTiltDeg?: number;        // dimetric の幅軸 (lateral axis) 傾き
  depthAxisTiltDeg?: number;          // dimetric の奥行軸 (depth axis) 傾き
  ratioWDH?: string;                  // 例 "2:1:vertical" (W:D:H)
}

export const PROJECTION_PRESETS = {
  "weak-high-angle-eye120": {
    type: "weak high-angle",
    eyeLevelCm: 120,
    rotationDeg: 0,
    cameraTiltDeg: 12,
    lateralAxisTiltDeg: 0,
    depthAxisTiltDeg: 0,
    ratioWDH: "front-only (no depth)",
  },
  "dimetric-2to1-sitting": {
    type: "dimetric 2:1",
    eyeLevelCm: "sitting",
    rotationDeg: 0,
    lateralAxisTiltDeg: 12,
    depthAxisTiltDeg: 20,
    ratioWDH: "2:1 (lateral:depth)",
  },
  "wall-aligned-v10": {
    type: "weak perspective (wall-aligned)",
    eyeLevelCm: 160,
    rotationDeg: -65,
    cameraTiltDeg: 30,
    lateralAxisTiltDeg: 10,
    ratioWDH: "—",
  },
} as const satisfies Record<string, ProjectionInfo>;

export type ProjectionPresetKey = keyof typeof PROJECTION_PRESETS;

// 単一視点の画像定義。
export interface ObjectVariant {
  src: string;
  nativeW: number;
  nativeH: number;
  cells?: { w: number; h: number };
  seat?: { dx: number; dy: number };
  shadowSrc?: string;
  projection?: ProjectionPresetKey;   // 投影プリセット参照
  promptFile?: string;                // assets/objects/prompts/<promptFile>.md
  // この variant が抽出された moodboard 画像のパス。def.source の上書き。
  // 同じ家具でも視点ごとに異なる moodboard 画像から取った場合に明示する。
  // 未設定なら def.source にフォールバック。SourcePage のテーブルで「何番目の画像から取ったか」表示に使う。
  source?: string;
  // side / front-dimetric の元 PNG が「どちらの壁ぎわ」を向いて描かれているかを宣言する。
  // 配置先の壁と異なる場合、scene 描画時に自動 flipX。未指定なら "left" 扱い (既存 PNG は
  // 全て leftwall.png ファイル名で左壁正本のため)。"right" を入れると右壁正本扱いになり、
  // 左壁配置時に自動反転する。front / wall 系 view にも将来同じ仕組みを拡張可能。
  wallOrigin?: "left" | "right";
}

export type ObjectViewName = "front" | "front-dimetric" | "side";

export const VIEW_LABEL: Record<ObjectViewName, string> = {
  front: "正面",
  "front-dimetric": "立体",
  side: "壁付",
};

// side variant を配置壁に合わせるための flipX を返す。
// variant.wallOrigin が targetWall と一致しなければ反転。未指定は "left" 既定。
export function resolveSideFlipX(variant: ObjectVariant, targetWall: "left" | "right"): boolean {
  const origin = variant.wallOrigin ?? "left";
  return origin !== targetWall;
}

// 家具のカテゴリ(種類)。AddPanel / ObjectPage のフィルタチップで使う。
export type ObjectKind =
  | "sofa" | "chair" | "desk" | "bed"
  | "storage" | "vanity"
  | "window" | "rug" | "wall-decor";

export const KIND_LABEL: Record<ObjectKind, string> = {
  sofa: "ソファ",
  chair: "椅子",
  desk: "机",
  bed: "ベッド",
  storage: "収納",
  vanity: "ドレッサー",
  window: "窓",
  rug: "ラグ",
  "wall-decor": "壁飾り",
};

// 配置方法。Scene 上の Z 並びやスナップ規則を将来分けるためにも使う。
// - floor     : 床置き家具 (3 視点)
// - back-wall : 奥壁に貼る (額絵・時計・窓 etc、正面のみ)
// - side-wall : 左右壁に貼る (将来用、正面のみ)
// - ceiling   : 天井 = 壁の最上段 row 0 のみ (フェアリーライト・ペナント、正面のみ)
// - ground    : 床に敷く (ラグ、正面のみ)
export type ObjectPlacement = "floor" | "back-wall" | "side-wall" | "ceiling" | "ground";

export const PLACEMENT_LABEL: Record<ObjectPlacement, string> = {
  floor: "床置き",
  "back-wall": "奥壁",
  "side-wall": "左右壁",
  ceiling: "天井",
  ground: "床敷き",
};

// 配置ごとに使う角度 (view) の許可リスト。
// - floor                     : 全 3 角度(AC 風配置で正面/斜め/壁付け全部使う)
// - back-wall/side-wall/ceiling: 正面のみ(壁/天井にぴったり貼る平面画)
// - ground                    : 正面のみ(ラグは正面 or 上面のみ、立体だと模様が歪む)
// テストでカタログ整合性を保証する(grid-object.test.ts)。
export const ALLOWED_ANGLES_BY_PLACEMENT: Record<ObjectPlacement, readonly ObjectViewName[]> = {
  floor: ["front", "front-dimetric", "side"],
  "back-wall": ["front"],
  "side-wall": ["front"],
  ceiling: ["front"],
  ground: ["front"],
};

// 配置種別ごとのデフォルト PlacementRule。
// per-def の placementRule が指定されていれば、そちらを優先する (effectivePlacementRule)。
// - floor     : 床セル F のみ。判定は中央 anchor col (中央 1〜2 cell) の最下行 (centerAnchorBottom)。
//               anchor SOME (片方食い込みOK)・anchor 全てがマップ内まで = 奥/横壁ぎわ + 画面端まで詰められる。
// - back-wall : 奥壁 B のみ。マージン無し (端寄せ可)。窓など中央寄せが必要なものは per-def で追加。
// - side-wall : 左壁 L / 右壁 R のみ。
// - ceiling   : 壁全種 (L/B/R) のうち row 0 のみ = 部屋の最上段。
//               判定は中央 anchor col の **最上行** (centerAnchorTop)。床家具と上下対称。
//               anchor SOME (片方食い込みOK)・anchor 全てマップ内まで = 横は画面端まで寄せられる。
// - ground    : 床セル F のみ (ラグ)。
export const DEFAULT_PLACEMENT_RULES: Record<ObjectPlacement, PlacementRule> = {
  floor: { regions: ["F"], regionsApplyTo: "centerAnchorBottom" },
  "back-wall": { regions: ["B"] },
  "side-wall": { regions: ["L", "R"] },
  ceiling: { regions: ["L", "B", "R"], regionsApplyTo: "centerAnchorTop", rowMin: 0, rowMax: 0 },
  ground: { regions: ["F"] },
};

// def の効力ある PlacementRule。
// 縛りがあるのは「床家具 (floor)」「天井家具 (ceiling)」「per-def placementRule 指定 (= 窓)」だけ。
// 壁デコ・地面など他の placement は自由配置 (DEFAULT は持つが適用しない方針)。
// - 床家具: 中央 anchor の最下行 (centerAnchorBottom) = 床接地行。
// - 天井家具: 中央 anchor の最上行 (centerAnchorTop) = 天井接触行 + rowMin=rowMax=0 で最上段限定。
// - 窓:     per-def の placementRule で 奥壁 B + 上下 1 マス margin。
export function effectivePlacementRule(def: ObjectDef): PlacementRule | undefined {
  if (def.placementRule) return def.placementRule;
  if (def.placement === "floor" || def.placement === "ceiling") {
    return DEFAULT_PLACEMENT_RULES[def.placement];
  }
  return undefined;
}

// 緑マスク pipeline で個別家具を切り出した「抽出元」moodboard (部屋全体絵)。
// この出自を持つ家具は ObjectDef.source に設定する。ObjectPage の「抽出元」フィルタで使う。
export const SAKURA_ROOM_MOODBOARD =
  "assets/generated/sakura-room-ideal-layout-ken-style-r2-20260620.png";
// 同じサクラルームを別レイアウト/別角度で再生成した 2 枚目 (足元 3/4 視点等の角度補強用)。
// 一部の variant (ベッド dimetric, 学習デスク front 等) はこちらから抽出した。
export const SAKURA_ROOM_ALTLAYOUT_R1 =
  "assets/generated/sakura-room-altlayout-r1-20260621.png";
// 3 枚目 (r5): ワードローブ/本棚/学習机を画面から省略し、ベッド・ソファ・デスクチェア・
// ドレッサー+プフ の 4 家具だけを head-on で配置した正面 view 抽出用 moodboard。
// 部屋の枠 = sakura-room-empty.png と pixel 一致、家具デザインと窓+壁飾り = altlayout-r1 から踏襲、天井装飾なし。
// OCCLUDERS: 全 4 家具とも none (ソファ前のコーヒーテーブルは離れているため遮蔽なし)。
export const SAKURA_ROOM_ALTLAYOUT_R3 =
  "assets/generated/sakura-room-altlayout-r3-front-r5-20260622.png";

// 家具カタログのエントリ。少なくとも一つの view を持つ。
export interface ObjectDef {
  id: string;
  label: string;
  defaultView: ObjectViewName;
  views: Partial<Record<ObjectViewName, ObjectVariant>>;
  kind?: ObjectKind;
  placement?: ObjectPlacement;
  placementRule?: PlacementRule;
  // 抽出元 moodboard のパス(リポジトリ相対)。緑マスクで部屋全体絵から切り出した家具に設定。
  // 未設定 = ゼロから(プロンプト)生成。ObjectPage の「抽出元 あり/なし」フィルタで使う。
  source?: string;
  // この家具が想定する人物像のタグ群 (年代・性別・属性など)。
  // 単一所有者ではなく「この家具がフィットしそうな人物属性」を列挙する。
  // - "shared" = moodboard 横断で使える汎用家具 (観葉植物・本・カップ等)
  // - "teen" / "child" / "adult" / "senior" 等 = 年代
  // - "female" / "male" / "neutral" 等 = 性別
  // - "student" / "office" / "kawaii" / "japanese" 等 = 属性・テイスト
  // 例: ピンクのシングルベッド = ["teen", "female", "kawaii"]
  //     観葉植物 (大型) = ["shared"]
  //     学習机 = ["student", "child", "teen"]
  persona?: string[];
}

export const OBJECT_CATALOG: ObjectDef[] = [
  // === 既存の汎用家具(side 未生成) ===
  {
    id: "sofa-navy",
    label: "ソファ",
    defaultView: "front-dimetric",
    persona: ["shared", "adult"],
    kind: "sofa",
    placement: "floor",
    views: {
      front: {
        src: "assets/objects/sofa-navy-front.png",
        nativeW: 828,
        nativeH: 508,
        cells: { w: 4, h: 3 },
        seat: { dx: 0, dy: -289 },
        projection: "weak-high-angle-eye120",
        promptFile: "sofa-navy-front-eye120-v2-rattan-20260619",
      },
      "front-dimetric": {
        src: "assets/objects/sofa-navy-dimetric.png",
        nativeW: 1010,
        nativeH: 789,
        cells: { w: 4, h: 3 },
        seat: { dx: 0, dy: -506 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sofa-navy-sitting-2to1-l1b-v1-20260619",
      },
      side: {
        src: "assets/objects/sofa-navy-leftwall.png",
        nativeW: 672,
        nativeH: 762,
        cells: { w: 4, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "sofa-navy-leftwall-v10-l1b-20260619",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "school-chair",
    label: "学校椅子",
    defaultView: "front-dimetric",
    persona: ["school", "student"],
    kind: "chair",
    placement: "floor",
    views: {
      "front-dimetric": {
        src: "assets/objects/school-chair-front-dimetric.png",
        nativeW: 548,
        nativeH: 865,
        cells: { w: 2, h: 3 },
        seat: { dx: 0, dy: -525 },
        projection: "dimetric-2to1-sitting",
        promptFile: "school-chair-sitting-2to1-l1b-v2-20260619",
      },
      side: {
        src: "assets/objects/school-chair-leftwall.png",
        nativeW: 550,
        nativeH: 862,
        cells: { w: 2, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "school-chair-leftwall-v10-l1b-20260619",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "school-desk-front",
    label: "学校机(対面)",
    defaultView: "front-dimetric",
    persona: ["school", "student"],
    kind: "desk",
    placement: "floor",
    views: {
      "front-dimetric": {
        src: "assets/objects/school-desk-front-dimetric.png",
        nativeW: 889,
        nativeH: 772,
        cells: { w: 3, h: 3 },
        projection: "dimetric-2to1-sitting",
        promptFile: "school-desk-front-sitting-2to1-l1b-v1-20260619",
      },
      side: {
        src: "assets/objects/school-desk-front-leftwall.png",
        nativeW: 895,
        nativeH: 752,
        cells: { w: 3, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "school-desk-front-leftwall-v10-l1b-20260619",
        wallOrigin: "left",
      },
    },
  },

  // === サクラ部屋家具(front + side) ===
  {
    id: "sakura-bed-pink-single",
    label: "ベッド(ピンク シングル)",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "bed",
    placement: "floor",
    views: {
      // front: altlayout-r5 head-on 部屋 (4 家具集中版) から緑マスク pipeline で抽出 (長辺 head-on)。
      //   OCCLUDERS: none だが Codex edgepolish はベッドの stock-photo prior が強すぎて 2 連続で
      //   別物を生成 (青ブランケット / グレー布張り) したため、決定論フォールバック
      //   scripts/smooth-silhouette-edges.py --mode shape (blur+threshold で輪郭だけ smooth、
      //   内部 RGB 100% 保持) を採用。apply → shape-smooth → strip-fake-transparency。
      front: {
        src: "assets/objects/sakura-bed-pink-single-front.png",
        nativeW: 586,
        nativeH: 454,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_ALTLAYOUT_R3,
      },
      // front-dimetric: altlayout-r1 部屋から緑マスク → apply-green-mask → prep-fillin-canvas →
      //   crop-mask-with-roomctx + Codex cleanup (2 参照, OCCLUDERS: none) → strip-fake-transparency。
      //   旧版 (moodboard r2 dimetric 1253x644 側面 3/4 view) を foot-forward 3/4 view で置き換え。
      "front-dimetric": {
        src: "assets/objects/sakura-bed-pink-single-dimetric.png",
        nativeW: 546,
        nativeH: 564,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_ALTLAYOUT_R1,
      },
      // side: moodboard r2 部屋全体保持 → ベッド以外透明化 → crop-alpha-bbox.py で grayscale chromakey + bbox crop
      side: {
        src: "assets/objects/sakura-bed-pink-single-leftwall.png",
        shadowSrc: "assets/objects/sakura-bed-pink-single-leftwall.shadow.png",
        nativeW: 765,
        nativeH: 604,
        cells: { w: 3, h: 3 },
        seat: { dx: 0, dy: -391 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-bed-pink-single-room-anchored-r7-20260620",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-sofa-green-floor",
    label: "ソファ(緑フロア)",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "sofa",
    placement: "floor",
    views: {
      // front: altlayout-r5 head-on 部屋 (4 家具集中版) から緑マスク pipeline で抽出。
      //   緑マスク → apply-green-mask (padding 0.1) → prep-fillin (margin 0.08) →
      //   crop-mask-with-roomctx (margin 0.30) → Codex cleanup-minimal (OCCLUDERS: none)
      //   → strip-fake-transparency (tight-crop, pad 12)。
      //   silhouette が完全に見えていたため補完不要、ほぼ input pixel そのまま出た。
      front: {
        src: "assets/objects/sakura-sofa-green-floor-front.png",
        nativeW: 594,
        nativeH: 303,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_ALTLAYOUT_R3,
      },
      // front-dimetric: moodboard r2 中央 sage green クラウドソファ
      // pipeline: 緑マスク r1 → apply-green-mask (padding 0.1) →
      //   Codex cleanup (虫食い補完 prompt 厳格版 r5b)
      "front-dimetric": {
        src: "assets/objects/sakura-sofa-green-floor-dimetric.png",
        shadowSrc: "assets/objects/sakura-sofa-green-floor-dimetric.shadow.png",
        nativeW: 508,
        nativeH: 393,
        cells: { w: 2, h: 2 },
        seat: { dx: 0, dy: -260 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-sofa-fillin-bugbites-r5b-20260621",
      },
    },
  },
  {
    id: "sakura-window-curtain",
    label: "窓+カーテン",
    defaultView: "front",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["shared"],
    kind: "window",
    placement: "back-wall",
    // 窓は端寄せ厳禁(壁の天井/床境界に貼らないため上下 1 cell マージン)。
    // 額絵などは default rule (margin 無し) に従って端寄せ自由。
    placementRule: { regions: ["B"], marginTop: 1, marginBottom: 1 },
    views: {
      // front: moodboard r2 奥壁中央の窓+カーテン → 緑マスク r1c → apply-green-mask
      //   (padding 0.1) → 補完 cleanup r2 (下端の植物/ランプ/机断片を除去)
      front: {
        src: "assets/objects/sakura-window-curtain.png",
        nativeW: 540,
        nativeH: 419,
        cells: { w: 2, h: 2 },
        promptFile: "sakura-window-curtain-complete-r2-20260621",
      },
    },
  },
  {
    id: "sakura-study-desk",
    label: "学習デスク",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["student", "child", "teen"],
    kind: "desk",
    placement: "floor",
    views: {
      // front: altlayout-r1 部屋から緑マスク → apply-green-mask → prep-fillin-canvas →
      //   Codex cleanup r2-ctx (緑マスクを 2nd 参照に追加した最初の成功版、aspect 1.009 vs input 1.019) →
      //   strip-fake-transparency。
      front: {
        src: "assets/objects/sakura-study-desk-front.png",
        nativeW: 454,
        nativeH: 450,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_ALTLAYOUT_R1,
      },
      "front-dimetric": {
        src: "assets/objects/sakura-study-desk-dimetric.png",
        nativeW: 1041,
        nativeH: 836,
        cells: { w: 4, h: 3 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-study-desk-sitting-2to1-l1b-v1-20260619",
      },
      side: {
        src: "assets/objects/sakura-study-desk-leftwall.png",
        nativeW: 570,
        nativeH: 842,
        cells: { w: 4, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-study-desk-leftwall-v10-l1b-20260619",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-desk-chair-pink",
    label: "デスクチェア(ピンク)",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "chair",
    placement: "floor",
    views: {
      "front-dimetric": {
        src: "assets/objects/sakura-desk-chair-pink-dimetric.png",
        nativeW: 550,
        nativeH: 907,
        cells: { w: 2, h: 3 },
        seat: { dx: 0, dy: -539 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-desk-chair-pink-sitting-2to1-l1b-v1-20260619",
      },
      side: {
        src: "assets/objects/sakura-desk-chair-pink-leftwall.png",
        nativeW: 973,
        nativeH: 815,
        cells: { w: 2, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-desk-chair-pink-leftwall-v10-l1b-20260619",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-wardrobe",
    label: "ワードローブ",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "storage",
    placement: "floor",
    views: {
      // front: altlayout-r1 部屋から緑マスク → apply-green-mask → step4 r5b 厳格版補完 → strip
      front: {
        src: "assets/objects/sakura-wardrobe-front.png",
        nativeW: 281,
        nativeH: 479,
        cells: { w: 1, h: 2 },
        source: SAKURA_ROOM_ALTLAYOUT_R1,
      },
      "front-dimetric": {
        src: "assets/objects/sakura-wardrobe-dimetric.png",
        nativeW: 553,
        nativeH: 835,
        cells: { w: 3, h: 5 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-wardrobe-sitting-2to1-l1b-v1-20260619",
      },
      // side: moodboard r2 部屋全体保持 → ワードローブ位置 緑マスク (r8, 緑のみ tight) →
      //   PIL apply-green-mask.py で moodboard 原画から切り抜き → 「補完」表現で
      //   Codex cleanup (complete r9) で隣の本棚断片除去
      side: {
        src: "assets/objects/sakura-wardrobe-leftwall.png",
        shadowSrc: "assets/objects/sakura-wardrobe-leftwall.shadow.png",
        nativeW: 410,
        nativeH: 732,
        cells: { w: 2, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-wardrobe-complete-r9-20260621",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-bookshelf",
    label: "本棚",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "storage",
    placement: "floor",
    views: {
      // front: altlayout-r1 部屋から緑マスク → apply-green-mask → step4 r7 (単独依頼で
      //   パース維持指示あり, KEN 肯定評価) → strip-fake-transparency。フロー2 (KEN 評価済み版を凍結) 採用。
      front: {
        src: "assets/objects/sakura-bookshelf-front.png",
        nativeW: 233,
        nativeH: 395,
        cells: { w: 1, h: 2 },
        source: SAKURA_ROOM_ALTLAYOUT_R1,
      },
      "front-dimetric": {
        src: "assets/objects/sakura-bookshelf-dimetric.png",
        nativeW: 424,
        nativeH: 872,
        cells: { w: 2, h: 4 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-bookshelf-sitting-2to1-l1b-v1-20260619",
      },
      // side: moodboard r2 部屋全体保持 → 本棚位置を緑マスクで Codex 依頼 (r7) →
      //   PIL (apply-green-mask.py) で moodboard 原画から緑領域を切り抜き (from-mask r7) →
      //   蔦・周辺装飾の余計 pixel を Codex cleanup 依頼 (cleanup r8) で除去
      side: {
        src: "assets/objects/sakura-bookshelf-leftwall.png",
        shadowSrc: "assets/objects/sakura-bookshelf-leftwall.shadow.png",
        nativeW: 256,
        nativeH: 520,
        cells: { w: 1, h: 2 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-bookshelf-cleanup-r8-20260621",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-vanity-dresser-with-pouf",
    label: "ドレッサー+鏡+プフ",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "vanity",
    placement: "floor",
    views: {
      // front: altlayout-r5 head-on 部屋 (4 家具集中版) から緑マスク pipeline で抽出。
      //   OCCLUDERS: none のため cleanup ではなく edgepolish フロー (Codex template framing +
      //   5 step + diff metric で輪郭外周のみ anti-alias、内部 RGB は bit-perfect 保持) を採用。
      //   天板の鉢植えは Codex が「本体ではない」と判断して落とし、ドレッサー本体のみのクリーン版。
      front: {
        src: "assets/objects/sakura-vanity-dresser-with-pouf-front.png",
        nativeW: 283,
        nativeH: 321,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_ALTLAYOUT_R3,
      },
      "front-dimetric": {
        src: "assets/objects/sakura-vanity-dresser-with-pouf-dimetric.png",
        nativeW: 1092,
        nativeH: 901,
        cells: { w: 4, h: 4 },
        seat: { dx: 354, dy: -339 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-vanity-dresser-with-pouf-sitting-2to1-l1b-v1-20260619",
      },
      side: {
        src: "assets/objects/sakura-vanity-dresser-with-pouf-leftwall.png",
        nativeW: 652,
        nativeH: 907,
        cells: { w: 4, h: 4 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-vanity-dresser-with-pouf-leftwall-v10-l1b-20260619",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-rug-floral",
    label: "ラグ(花柄)",
    defaultView: "front",
    persona: ["teen", "female", "kawaii"],
    kind: "rug",
    placement: "ground",
    views: {
      front: {
        src: "assets/objects/sakura-rug-floral.png",
        nativeW: 1401,
        nativeH: 545,
        cells: { w: 5, h: 3 },
      },
    },
  },
  {
    id: "sakura-rug-cloud",
    label: "ラグ(雲)",
    defaultView: "front",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "rug",
    placement: "ground",
    views: {
      front: {
        src: "assets/objects/sakura-rug-cloud.png",
        nativeW: 1360,
        nativeH: 347,
        cells: { w: 5, h: 2 },
      },
    },
  },

  // === 壁デコ(wall-mounted、視点は1つのみ) ===
  {
    id: "sakura-wall-frame-floral",
    label: "額絵(花柄)",
    defaultView: "front",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "wall-decor",
    placement: "back-wall",
    views: {
      front: {
        src: "assets/objects/sakura-wall-frame-floral.png",
        nativeW: 441,
        nativeH: 566,
        cells: { w: 2, h: 2 },
      },
    },
  },
  {
    id: "sakura-wall-clock",
    label: "壁掛け時計",
    defaultView: "front",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["shared"],
    kind: "wall-decor",
    placement: "back-wall",
    views: {
      front: {
        src: "assets/objects/sakura-wall-clock.png",
        nativeW: 465,
        nativeH: 477,
        cells: { w: 2, h: 2 },
      },
    },
  },
  {
    id: "sakura-wall-dried-bouquet",
    label: "ドライフラワー束",
    defaultView: "front",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "wall-decor",
    placement: "back-wall",
    views: {
      front: {
        src: "assets/objects/sakura-wall-dried-bouquet.png",
        nativeW: 342,
        nativeH: 598,
        cells: { w: 2, h: 2 },
      },
    },
  },
  {
    id: "sakura-wall-pennant",
    label: "ペナント(5旗)",
    defaultView: "front",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "wall-decor",
    placement: "ceiling",
    views: {
      front: {
        src: "assets/objects/sakura-wall-pennant.png",
        nativeW: 841,
        nativeH: 293,
        cells: { w: 3, h: 1 },
      },
    },
  },
  {
    id: "sakura-wall-fairy-lights",
    label: "フェアリーライト",
    defaultView: "front",
    source: SAKURA_ROOM_MOODBOARD,
    persona: ["teen", "female", "kawaii"],
    kind: "wall-decor",
    placement: "ceiling",
    views: {
      front: {
        src: "assets/objects/sakura-wall-fairy-lights.png",
        nativeW: 851,
        nativeH: 242,
        cells: { w: 3, h: 1 },
      },
    },
  },
];

// ─── ヘルパ ──────────────────────────────────────────────

// src で variant 単位の lookup。同じ src は1つの variant にしか属さない前提。
export function lookupVariantBySrc(
  src: string,
): { def: ObjectDef; variant: ObjectVariant; view: ObjectViewName } | undefined {
  for (const def of OBJECT_CATALOG) {
    for (const view of Object.keys(def.views) as ObjectViewName[]) {
      const variant = def.views[view];
      if (variant && variant.src === src) return { def, variant, view };
    }
  }
  return undefined;
}

// オブジェクト既定の footprint セル(variant 未指定なら native/PX_PER_CELL)。
export function variantCells(variant: ObjectVariant): { w: number; h: number } {
  return variant.cells ?? cellsFromNative(variant.nativeW, variant.nativeH);
}

export function objectDefaultCells(def: ObjectDef, view?: ObjectViewName): { w: number; h: number } {
  const v = (view && def.views[view]) ?? def.views[def.defaultView];
  if (!v) throw new Error(`objectDefaultCells: no variant on ${def.id}`);
  return variantCells(v);
}

// 画像(nativeW×nativeH)を cells の箱へ「アスペクト保持で contain」する scale。
// 短径(より厳しい方)を満たし、長径側は箱内に padding(中央寄せ)。歪み無し。
export function containScale(
  nativeW: number,
  nativeH: number,
  cells: { w: number; h: number },
): number {
  return Math.min((cells.w * GRID) / nativeW, (cells.h * GRID) / nativeH);
}

export function objectScale(def: ObjectDef, view?: ObjectViewName): number {
  const v = (view && def.views[view]) ?? def.views[def.defaultView];
  if (!v) throw new Error(`objectScale: no variant on ${def.id}`);
  return containScale(v.nativeW, v.nativeH, variantCells(v));
}

// src + 任意セルでの contain scale(セルを変えてリサイズする際に使う)。
export function objectScaleForCells(
  src: string,
  cells: { w: number; h: number },
): number {
  const hit = lookupVariantBySrc(src);
  if (!hit) return 1;
  return containScale(hit.variant.nativeW, hit.variant.nativeH, cells);
}

export function getObjectDef(src: string): ObjectDef | undefined {
  return lookupVariantBySrc(src)?.def;
}

// src から variant の cells を引く(未指定 cells は native から導出)。
export function getObjectCells(src: string): { w: number; h: number } | undefined {
  const hit = lookupVariantBySrc(src);
  return hit ? variantCells(hit.variant) : undefined;
}

// src から座面アンカーを引く(座れない variant は undefined)。
export function getObjectSeat(src: string): { dx: number; dy: number } | undefined {
  return lookupVariantBySrc(src)?.variant.seat;
}

// src から表示名を引く(カタログ外はファイル名にフォールバック)。
export function objectLabel(src: string): string {
  return lookupVariantBySrc(src)?.def.label ?? src.replace(/^.*\//, "");
}

// src から影 PNG パスを引く(未指定なら undefined)。
export function getObjectShadowSrc(src: string): string | undefined {
  return lookupVariantBySrc(src)?.variant.shadowSrc;
}

// 既定 view の src を返す(AddPanel の初期サムネ用)。
export function getDefaultVariantSrc(def: ObjectDef): string {
  const v = def.views[def.defaultView];
  if (!v) {
    // defaultView の variant が無ければ存在する方の view を返す
    for (const view of Object.keys(def.views) as ObjectViewName[]) {
      if (def.views[view]) return def.views[view]!.src;
    }
    throw new Error(`getDefaultVariantSrc: no views on ${def.id}`);
  }
  return v.src;
}
