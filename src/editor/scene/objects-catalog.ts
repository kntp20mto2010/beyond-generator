import { GRID } from "./grid.js";

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

// 単一視点の画像定義。
export interface ObjectVariant {
  src: string;
  nativeW: number;
  nativeH: number;
  cells?: { w: number; h: number };
  seat?: { dx: number; dy: number };
  shadowSrc?: string;
}

export type ObjectViewName = "front" | "front-dimetric" | "side";

export const VIEW_LABEL: Record<ObjectViewName, string> = {
  front: "正面",
  "front-dimetric": "立体",
  side: "壁付",
};

// 家具カタログのエントリ。少なくとも一つの view を持つ。
export interface ObjectDef {
  id: string;
  label: string;
  defaultView: ObjectViewName;
  views: Partial<Record<ObjectViewName, ObjectVariant>>;
}

export const OBJECT_CATALOG: ObjectDef[] = [
  // === 既存の汎用家具(side 未生成) ===
  {
    id: "sofa-navy",
    label: "ソファ",
    defaultView: "front-dimetric",
    views: {
      front: {
        src: "assets/objects/sofa-navy-front.png",
        nativeW: 828,
        nativeH: 508,
        cells: { w: 4, h: 3 },
        seat: { dx: 0, dy: -289 },
      },
      "front-dimetric": {
        src: "assets/objects/sofa-navy-dimetric.png",
        nativeW: 1010,
        nativeH: 789,
        cells: { w: 4, h: 3 },
        seat: { dx: 0, dy: -506 },
      },
      side: {
        src: "assets/objects/sofa-navy-leftwall.png",
        nativeW: 672,
        nativeH: 762,
        cells: { w: 4, h: 3 },
      },
    },
  },
  {
    id: "school-chair",
    label: "学校椅子",
    defaultView: "front-dimetric",
    views: {
      "front-dimetric": {
        src: "assets/objects/school-chair-front-dimetric.png",
        nativeW: 548,
        nativeH: 865,
        cells: { w: 2, h: 3 },
        seat: { dx: 0, dy: -525 },
      },
      side: {
        src: "assets/objects/school-chair-leftwall.png",
        nativeW: 550,
        nativeH: 862,
        cells: { w: 2, h: 3 },
      },
    },
  },
  {
    id: "school-desk-front",
    label: "学校机(対面)",
    defaultView: "front-dimetric",
    views: {
      "front-dimetric": {
        src: "assets/objects/school-desk-front-dimetric.png",
        nativeW: 889,
        nativeH: 772,
        cells: { w: 3, h: 3 },
      },
      side: {
        src: "assets/objects/school-desk-front-leftwall.png",
        nativeW: 895,
        nativeH: 752,
        cells: { w: 3, h: 3 },
      },
    },
  },

  // === サクラ部屋家具(front + side) ===
  {
    id: "sakura-bed-pink-single",
    label: "ベッド(ピンク シングル)",
    defaultView: "front-dimetric",
    views: {
      // front-dimetric: dimetric 2:1 + sitting eye-level + L1b 無アウトライン
      "front-dimetric": {
        src: "assets/objects/sakura-bed-pink-single-dimetric.png",
        nativeW: 1253,
        nativeH: 644,
        cells: { w: 5, h: 3 },
        seat: { dx: 0, dy: -432 },
      },
      // side: 左壁這う(2D 回転 hack で生成、Codex は対角 orientation 未対応)
      side: {
        src: "assets/objects/sakura-bed-pink-single-leftwall.png",
        shadowSrc: "assets/objects/sakura-bed-pink-single-leftwall.shadow.png",
        nativeW: 1362,
        nativeH: 710,
        cells: { w: 5, h: 3 },
        seat: { dx: 0, dy: -460 },
      },
    },
  },
  {
    id: "sakura-window-curtain",
    label: "窓+カーテン",
    defaultView: "front",
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
    views: {
      "front-dimetric": {
        src: "assets/objects/sakura-study-desk-dimetric.png",
        nativeW: 1041,
        nativeH: 836,
        cells: { w: 4, h: 3 },
      },
      side: {
        src: "assets/objects/sakura-study-desk-leftwall.png",
        nativeW: 570,
        nativeH: 842,
        cells: { w: 4, h: 3 },
      },
    },
  },
  {
    id: "sakura-desk-chair-pink",
    label: "デスクチェア(ピンク)",
    defaultView: "front-dimetric",
    views: {
      "front-dimetric": {
        src: "assets/objects/sakura-desk-chair-pink-dimetric.png",
        nativeW: 550,
        nativeH: 907,
        cells: { w: 2, h: 3 },
        seat: { dx: 0, dy: -539 },
      },
      side: {
        src: "assets/objects/sakura-desk-chair-pink-leftwall.png",
        nativeW: 973,
        nativeH: 815,
        cells: { w: 2, h: 3 },
      },
    },
  },
  {
    id: "sakura-wardrobe",
    label: "ワードローブ",
    defaultView: "front-dimetric",
    views: {
      "front-dimetric": {
        src: "assets/objects/sakura-wardrobe-dimetric.png",
        nativeW: 553,
        nativeH: 835,
        cells: { w: 3, h: 5 },
      },
      // side: v10 (Eye 160 / Rotation -65° / Lateral 10° / Depth 30°)
      side: {
        src: "assets/objects/sakura-wardrobe-leftwall.png",
        shadowSrc: "assets/objects/sakura-wardrobe-leftwall.shadow.png",
        nativeW: 665,
        nativeH: 1380,
        cells: { w: 3, h: 5 },
      },
    },
  },
  {
    id: "sakura-bookshelf",
    label: "本棚",
    defaultView: "front-dimetric",
    views: {
      "front-dimetric": {
        src: "assets/objects/sakura-bookshelf-dimetric.png",
        nativeW: 424,
        nativeH: 872,
        cells: { w: 2, h: 4 },
      },
      side: {
        src: "assets/objects/sakura-bookshelf-leftwall.png",
        nativeW: 425,
        nativeH: 906,
        cells: { w: 2, h: 4 },
      },
    },
  },
  {
    id: "sakura-vanity-dresser-with-pouf",
    label: "ドレッサー+鏡+プフ",
    defaultView: "front-dimetric",
    views: {
      "front-dimetric": {
        src: "assets/objects/sakura-vanity-dresser-with-pouf-dimetric.png",
        nativeW: 1092,
        nativeH: 901,
        cells: { w: 4, h: 4 },
        seat: { dx: 354, dy: -339 },
      },
      side: {
        src: "assets/objects/sakura-vanity-dresser-with-pouf-leftwall.png",
        nativeW: 652,
        nativeH: 907,
        cells: { w: 4, h: 4 },
      },
    },
  },
  {
    id: "sakura-rug-floral",
    label: "ラグ(花柄)",
    defaultView: "front",
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
