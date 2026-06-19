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

// 配置 → 許可される region 集合。
// floor は床セル、wall は奥/左/右壁、ground は床(ラグは床敷き)。
export const ALLOWED_REGIONS_BY_PLACEMENT: Record<
  "floor" | "wall" | "ground",
  ReadonlyArray<RegionCode>
> = {
  floor: ["F"],
  wall: ["L", "B", "R"],
  ground: ["F"],
};

// 最も近い「許可された region」のセル中心 (col, row) を Manhattan 距離で探す。
// 見つからなければ undefined。
export function nearestAllowedCell(
  map: RoomRegionMap,
  startCol: number,
  startRow: number,
  allowed: ReadonlyArray<RegionCode>,
): { col: number; row: number } | undefined {
  let best: { col: number; row: number } | undefined;
  let bestDist = Infinity;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const code = map.regions[r]?.[c];
      if (!code || !allowed.includes(code)) continue;
      const d = Math.abs(r - startRow) + Math.abs(c - startCol);
      if (d < bestDist) {
        bestDist = d;
        best = { col: c, row: r };
      }
    }
  }
  return best;
}
