import { GRID } from "./grid.js";
import type { PlacementRule } from "./room-regions/types.js";

// 配置可能オブジェクト(家具/小物)のカタログ。AddPanel のオブジェクト一覧 +
// グリッド footprint + 座面アンカーに使う。src はリポジトリ相対の透過PNGパス。
//
// 各家具は最大 **3 視点(views: front / front-dimetric / side)** を持てる。
//   - front          : 真正面 elevation(orthographic, no perspective, no top visible)
//   - front-dimetric : dimetric 2:1 + sitting eye-level(L1b、AC 風配置)
//   - side           : 左壁這う(v10 wall-aligned)。右壁は side + flipX
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
}

export type ObjectViewName = "front" | "front-dimetric" | "side";

export const VIEW_LABEL: Record<ObjectViewName, string> = {
  front: "正面",
  "front-dimetric": "立体",
  side: "壁付",
};

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

// 家具カタログのエントリ。少なくとも一つの view を持つ。
export interface ObjectDef {
  id: string;
  label: string;
  defaultView: ObjectViewName;
  views: Partial<Record<ObjectViewName, ObjectVariant>>;
  kind?: ObjectKind;
  placement?: ObjectPlacement;
  placementRule?: PlacementRule;
}

export const OBJECT_CATALOG: ObjectDef[] = [
  // === 既存の汎用家具(side 未生成) ===
  {
    id: "sofa-navy",
    label: "ソファ",
    defaultView: "front-dimetric",
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
      },
    },
  },
  {
    id: "school-chair",
    label: "学校椅子",
    defaultView: "front-dimetric",
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
      },
    },
  },
  {
    id: "school-desk-front",
    label: "学校机(対面)",
    defaultView: "front-dimetric",
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
      },
    },
  },

  // === サクラ部屋家具(front + side) ===
  {
    id: "sakura-bed-pink-single",
    label: "ベッド(ピンク シングル)",
    defaultView: "front-dimetric",
    kind: "bed",
    placement: "floor",
    views: {
      // front-dimetric: dimetric 2:1 + sitting eye-level + L1b 無アウトライン
      "front-dimetric": {
        src: "assets/objects/sakura-bed-pink-single-dimetric.png",
        nativeW: 1253,
        nativeH: 644,
        cells: { w: 5, h: 3 },
        seat: { dx: 0, dy: -432 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-bed-pink-single-sitting-2to1-l1b-v1-20260619",
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
      },
    },
  },
  {
    id: "sakura-window-curtain",
    label: "窓+カーテン",
    defaultView: "front",
    kind: "window",
    placement: "back-wall",
    // 窓は端寄せ厳禁(壁の天井/床境界に貼らないため上下 1 cell マージン)。
    // 額絵などは default rule (margin 無し) に従って端寄せ自由。
    placementRule: { regions: ["B"], marginTop: 1, marginBottom: 1 },
    views: {
      front: {
        src: "assets/objects/sakura-window-curtain.png",
        nativeW: 1040,
        nativeH: 823,
        cells: { w: 4, h: 3 },
      },
    },
  },
  {
    id: "sakura-study-desk",
    label: "学習デスク",
    defaultView: "front-dimetric",
    kind: "desk",
    placement: "floor",
    views: {
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
      },
    },
  },
  {
    id: "sakura-desk-chair-pink",
    label: "デスクチェア(ピンク)",
    defaultView: "front-dimetric",
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
      },
    },
  },
  {
    id: "sakura-wardrobe",
    label: "ワードローブ",
    defaultView: "front-dimetric",
    kind: "storage",
    placement: "floor",
    views: {
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
      },
    },
  },
  {
    id: "sakura-bookshelf",
    label: "本棚",
    defaultView: "front-dimetric",
    kind: "storage",
    placement: "floor",
    views: {
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
      },
    },
  },
  {
    id: "sakura-vanity-dresser-with-pouf",
    label: "ドレッサー+鏡+プフ",
    defaultView: "front-dimetric",
    kind: "vanity",
    placement: "floor",
    views: {
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
      },
    },
  },
  {
    id: "sakura-rug-floral",
    label: "ラグ(花柄)",
    defaultView: "front",
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

  // === 壁デコ(wall-mounted、視点は1つのみ) ===
  {
    id: "sakura-wall-frame-floral",
    label: "額絵(花柄)",
    defaultView: "front",
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
