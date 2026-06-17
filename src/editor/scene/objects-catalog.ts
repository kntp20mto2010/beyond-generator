import { GRID } from "./grid.js";

// 配置可能オブジェクト(家具/小物)のカタログ。AddPanel のオブジェクト一覧 +
// グリッド footprint + 座面アンカーに使う。src はリポジトリ相対の透過PNGパス。
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

export interface ObjectDef {
  id: string;
  label: string;
  src: string;
  nativeW: number; // 画像コンテンツ幅(px)
  nativeH: number; // 画像コンテンツ高(px)
  cells?: { w: number; h: number }; // 既定 footprint の上書き(未指定=native/PX_PER_CELL)
  // 座れる家具は座面アンカーを持つ。下端中央アンカーからの画像空間オフセット
  // (キャラの腰=transform.y を置く点)。dy は上が負。
  seat?: { dx: number; dy: number };
}

export const OBJECT_CATALOG: ObjectDef[] = [
  {
    id: "sofa-navy",
    label: "ソファ",
    src: "assets/objects/sofa-navy-2seat.png",
    // Weak perspective(low eye-level + 8-12° down + front-left 3/4 + 0-2°
    // lateral + 15-25° depth)で再生成(トリム後 1163×790)。柔らか家具カタログ風。
    nativeW: 1163,
    nativeH: 790,
    cells: { w: 4, h: 3 },
    seat: { dx: 0, dy: -499 },
  },
  {
    id: "school-chair",
    label: "学校椅子",
    src: "assets/objects/school-chair.png",
    // Weak perspective 再生成(トリム後 645×908)。
    nativeW: 645,
    nativeH: 908,
    cells: { w: 2, h: 3 },
    seat: { dx: 0, dy: -498 },
  },
  {
    id: "school-desk",
    label: "学校机(横並び)",
    src: "assets/objects/school-desk.png",
    // ※ weak perspective 版未対応(High-angle axonometric のまま、必要時に再生成)。
    nativeW: 647,
    nativeH: 745,
    cells: { w: 3, h: 3 },
  },
  {
    id: "school-desk-front",
    label: "学校机(対面)",
    src: "assets/objects/school-desk-front.png",
    // Weak perspective 再生成(トリム後 771×751)。
    // non-user side(モデスティパネル+前縁)が手前=黒板側から見た構図。
    nativeW: 771,
    nativeH: 751,
    cells: { w: 3, h: 3 },
  },
];

// オブジェクト既定の footprint セル(上書きが無ければ native/PX_PER_CELL)。
export function objectDefaultCells(def: ObjectDef): { w: number; h: number } {
  return def.cells ?? cellsFromNative(def.nativeW, def.nativeH);
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

// カタログ既定セルでの contain scale。
export function objectScale(def: ObjectDef): number {
  return containScale(def.nativeW, def.nativeH, objectDefaultCells(def));
}

// src + 任意セルでの contain scale(セルを変えてリサイズする際に使う)。
export function objectScaleForCells(
  src: string,
  cells: { w: number; h: number },
): number {
  const def = getObjectDef(src);
  if (!def) return 1;
  return containScale(def.nativeW, def.nativeH, cells);
}

export function getObjectDef(src: string): ObjectDef | undefined {
  return OBJECT_CATALOG.find((o) => o.src === src);
}

// src からグリッド footprint を引く(カタログ外は undefined)。
export function getObjectCells(src: string): { w: number; h: number } | undefined {
  return getObjectDef(src)?.cells;
}

// src から座面アンカーを引く(座れない家具は undefined)。
export function getObjectSeat(src: string): { dx: number; dy: number } | undefined {
  return getObjectDef(src)?.seat;
}

// src から表示名を引く(カタログ外はファイル名にフォールバック)。
export function objectLabel(src: string): string {
  return getObjectDef(src)?.label ?? src.replace(/^.*\//, "");
}
