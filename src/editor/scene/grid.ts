// オブジェクト配置用グリッド(Sims/Terraria 風のタイル整列)。
// STAGE 座標(1920×1080)上の正方セル。家具はセルに吸着して整列する。
export const GRID = 120; // セルサイズ(STAGE px)。1920/120=16列, 1080/120=9行。

export function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

// オブジェクトの基準点(下端中央)をグリッドへ吸着。
// 幅 cellsW の偶奇で中心の吸着位相を変え、左右端がグリッド線に乗るようにする
// (偶数幅→中心はグリッド線、奇数幅→中心はセル中央=半セルずらし)。Yは床=グリッド線。
export function snapObjectXY(x: number, y: number, cellsW = 2): [number, number] {
  const offX = cellsW % 2 === 1 ? GRID / 2 : 0;
  const sx = Math.round((x - offX) / GRID) * GRID + offX;
  return [sx, snapToGrid(y)];
}
