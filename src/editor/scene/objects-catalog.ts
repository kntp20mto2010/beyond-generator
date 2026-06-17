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
    nativeW: 960, // ceil(960/300)=4, ceil(630/300)=3 → 4×3セル
    nativeH: 630,
    seat: { dx: 0, dy: -306 },
  },
  {
    id: "school-chair",
    label: "学校椅子",
    src: "assets/objects/school-chair.png",
    // Codex 生成(セル塗り、トリム後 551×857)。cells を 2×3 明示指定で
    // contain → 描画 232×360(高さ箱を満たし幅は微小padding)。
    nativeW: 551,
    nativeH: 857,
    cells: { w: 2, h: 3 },
    // 座面パネル: 画像下端から 441-508 px の帯。中央付近にキャラ腰を置く。
    seat: { dx: 0, dy: -470 },
  },
  {
    id: "school-desk",
    label: "学校机",
    src: "assets/objects/school-desk.png",
    // Codex 生成(セル塗り、トリム後 794×882)。cells {3,3}(=900×900箱)で
    // contain → 描画 約324×360。座らせる対象ではないので seat なし。
    nativeW: 794,
    nativeH: 882,
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
