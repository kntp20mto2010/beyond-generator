// 部屋の grid 領域分類 (床/奥壁/左壁/右壁)。
// 4 色マスクを scripts/build-room-region-map.py でサンプルして生成する。

export type RegionCode = "F" | "B" | "L" | "R";

export const REGION_LABEL: Record<RegionCode, string> = {
  F: "床",
  B: "奥壁",
  L: "左壁",
  R: "右壁",
};

// debug viz / DnD ハイライト用の表示色 (mask の純色を半透明で重ねる)
export const REGION_DEBUG_COLOR: Record<RegionCode, string> = {
  F: "rgba(0, 255, 255, 0.18)",   // cyan
  B: "rgba(255, 0, 255, 0.18)",   // magenta
  L: "rgba(255, 255, 0, 0.18)",   // yellow
  R: "rgba(0, 255, 0, 0.18)",     // lime
};

export interface RoomRegionMap {
  room: string;            // room id (例 "sakura-room")
  grid: number;            // セル size (STAGE px)
  cols: number;            // 列数
  rows: number;            // 行数
  regions: RegionCode[][]; // [row][col] の 2D 配列
}

// STAGE 座標 (x, y) からその座標を含む grid セルの region を引く。
// 範囲外は undefined。
export function regionAtStage(
  map: RoomRegionMap,
  stageX: number,
  stageY: number,
): RegionCode | undefined {
  const col = Math.floor(stageX / map.grid);
  const row = Math.floor(stageY / map.grid);
  if (col < 0 || col >= map.cols) return undefined;
  if (row < 0 || row >= map.rows) return undefined;
  return map.regions[row]?.[col];
}

// cell (col,row) の region。range check 付き。
export function regionAtCell(
  map: RoomRegionMap,
  col: number,
  row: number,
): RegionCode | undefined {
  if (col < 0 || col >= map.cols || row < 0 || row >= map.rows) return undefined;
  return map.regions[row]?.[col];
}

// 床セル (col, row) が壁にどう接しているか分類する。
// 戻り値: "leftBorder"  = 左隣が左壁(L)
//        "rightBorder" = 右隣が右壁(R)
//        "backBorder"  = 上隣が奥壁(B)
//        "interior"    = 壁に接していない or マップ外
// 角(複数該当)の場合は left/right > back の優先順。
export type FloorWallAdjacency = "leftBorder" | "rightBorder" | "backBorder" | "interior";

export function floorWallAdjacency(
  map: RoomRegionMap,
  col: number,
  row: number,
): FloorWallAdjacency {
  const here = map.regions[row]?.[col];
  if (here !== "F") return "interior"; // 床以外はそもそも対象外
  const left = map.regions[row]?.[col - 1];
  const right = map.regions[row]?.[col + 1];
  const top = map.regions[row - 1]?.[col];
  if (left === "L") return "leftBorder";
  if (right === "R") return "rightBorder";
  if (top === "B") return "backBorder";
  return "interior";
}

// 家具の bottom-center X 座標と cells.w から、判定用 anchor 列 (中央 1 or 2 セル) を返す。
export function anchorColsForObject(centerX: number, cellsW: number, grid: number): number[] {
  const centerCol = Math.floor(centerX / grid);
  return cellsW % 2 === 1 ? [centerCol] : [centerCol - 1, centerCol];
}

// 複数 anchor cell の壁隣接を集約判定。
// - leftBorder = leftmost anchor の左隣が L
// - rightBorder = rightmost anchor の右隣が R
// - backBorder = いずれかの anchor の上隣が B
// - 優先順: left > right > back > interior
export function multiAnchorWallAdjacency(
  map: RoomRegionMap,
  anchorCols: number[],
  row: number,
): FloorWallAdjacency {
  if (anchorCols.length === 0) return "interior";
  const leftmost = anchorCols[0]!;
  const rightmost = anchorCols[anchorCols.length - 1]!;
  const left  = map.regions[row]?.[leftmost - 1];
  const right = map.regions[row]?.[rightmost + 1];
  const topAny = anchorCols.some((c) => map.regions[row - 1]?.[c] === "B");
  if (left === "L") return "leftBorder";
  if (right === "R") return "rightBorder";
  if (topAny)       return "backBorder";
  return "interior";
}

// 配置ルール (per-def 細かい制約)。placement-based デフォルトを上書きする。
//
// margin* は footprint の外側にも rule.regions のセルが必要な行数/列数。
// 例: 窓 = { regions: ["B"], marginTop: 1, marginBottom: 1 }
//   → 窓の上下にも 1 行ぶん B (奥壁) が必要 = 壁の最上/最下端には貼れない。
//   = 「窓は奥壁の中央寄りにしか置けない」という制約になる。
//
// rowMin/rowMax は footprint 上端 row (rowTop) の許可範囲 (inclusive)。
// 例: ceiling = { regions: ["L","B","R"], rowMin: 0, rowMax: 0 }
//   → footprint 上端が必ず row 0 = 「天井=最上段のみ」の制約。
export interface PlacementRule {
  // 必要なすべてのセル (footprint + 周囲マージン) で許可される region コード集合
  regions: ReadonlyArray<RegionCode>;
  // セル単位のマージン (この cell 数だけ周囲に rule.regions のセルが必要)
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  // footprint 上端 row (rowTop) の許可範囲 (inclusive)。範囲外なら invalid。
  rowMin?: number;
  rowMax?: number;
}

// 配置位置 (snap 済 bottom-center) + cells から、footprint と margin が全て
// rule.regions に含まれるかを検証する。
export function isFootprintValid(
  map: RoomRegionMap,
  snx: number,
  sny: number,
  cellsW: number,
  cellsH: number,
  rule: PlacementRule,
): boolean {
  const grid = map.grid;
  // bottom-center → 左上 cell
  const colLeft = Math.round((snx - (cellsW * grid) / 2) / grid);
  const rowTop = Math.round(sny / grid) - cellsH;
  // rowTop が rowMin/rowMax 範囲外なら invalid
  if (rule.rowMin !== undefined && rowTop < rule.rowMin) return false;
  if (rule.rowMax !== undefined && rowTop > rule.rowMax) return false;
  const mT = rule.marginTop ?? 0;
  const mB = rule.marginBottom ?? 0;
  const mL = rule.marginLeft ?? 0;
  const mR = rule.marginRight ?? 0;
  for (let r = rowTop - mT; r < rowTop + cellsH + mB; r++) {
    for (let c = colLeft - mL; c < colLeft + cellsW + mR; c++) {
      const code = map.regions[r]?.[c];
      if (!code || !rule.regions.includes(code)) return false;
    }
  }
  return true;
}

// rule を満たす最近傍の snap 位置 (snx, sny) を探す。
// 候補は cells.w の偶奇に応じた snap 位相のみ。Manhattan 距離で最近を返す。
// 見つからなければ undefined。
// rule.rowMin/rowMax 指定時は rowTop が範囲内になる sny のみ走査して高速化する。
export function nearestValidSnap(
  map: RoomRegionMap,
  startSnx: number,
  startSny: number,
  cellsW: number,
  cellsH: number,
  rule: PlacementRule,
): { snx: number; sny: number } | undefined {
  const grid = map.grid;
  const offX = cellsW % 2 === 1 ? grid / 2 : 0;
  // sny = (rowTop + cellsH) * grid。rowMin/rowMax を bottom row へ変換。
  // r (bottom row) = rowTop + cellsH なので、許可範囲は [rowMin+cellsH, rowMax+cellsH]。
  const rLo = Math.max(1, (rule.rowMin ?? -Infinity) + cellsH);
  const rHi = Math.min(map.rows, (rule.rowMax ?? Infinity) + cellsH);
  let best: { snx: number; sny: number } | undefined;
  let bestDist = Infinity;
  for (let r = rLo; r <= rHi; r++) {
    const sny = r * grid;
    for (let c = 0; c <= map.cols; c++) {
      const snx = c * grid + offX;
      if (!isFootprintValid(map, snx, sny, cellsW, cellsH, rule)) continue;
      const d = Math.abs(snx - startSnx) + Math.abs(sny - startSny);
      if (d < bestDist) {
        bestDist = d;
        best = { snx, sny };
      }
    }
  }
  return best;
}
