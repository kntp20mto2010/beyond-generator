import { GRID } from "./grid.js";

// 配置可能オブジェクト(家具/小物)のカタログ。AddPanel のオブジェクト一覧 +
// グリッド footprint + 座面アンカーに使う。src はリポジトリ相対の透過PNGパス。
//
// サイズはグリッドの n×m セルで定義し(全体の統一感のため)、scale は
// 「幅 = cells.w セル」になるよう nativeW から導出する(objectScale)。
export interface ObjectDef {
  id: string;
  label: string;
  src: string;
  cells: { w: number; h: number }; // グリッド footprint(セル数)。この箱に画像を収める
  nativeW: number; // 画像コンテンツ幅(px)
  nativeH: number; // 画像コンテンツ高(px)
  // 座れる家具は座面アンカーを持つ。下端中央アンカーからの画像空間オフセット
  // (キャラの腰=transform.y を置く点)。dy は上が負。
  seat?: { dx: number; dy: number };
}

export const OBJECT_CATALOG: ObjectDef[] = [
  {
    id: "sofa-navy",
    label: "ソファ",
    src: "assets/objects/sofa-navy-2seat.png",
    cells: { w: 5, h: 3 }, // 5×3セル(600×360)の箱に収める。実寸960×630
    nativeW: 960,
    nativeH: 630,
    seat: { dx: 0, dy: -306 },
  },
];

// cells の箱に「アスペクト比保持で contain」する transform.scale。
// 短径(より厳しい方)を満たし、長径側は箱内に padding(中央寄せ)。歪み無し。
export function objectScale(def: ObjectDef): number {
  const sx = (def.cells.w * GRID) / def.nativeW;
  const sy = (def.cells.h * GRID) / def.nativeH;
  return Math.min(sx, sy);
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
