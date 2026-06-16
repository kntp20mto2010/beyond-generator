// オブジェクト配置用グリッド(Sims/Terraria 風のタイル整列)。
// STAGE 座標(1920×1080)上の正方セル。家具はセルに吸着して整列する。
export const GRID = 120; // セルサイズ(STAGE px)。1920/120=16列, 1080/120=9行。

export function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

// オブジェクトの基準点(下端中央)をグリッドへ吸着。
export function snapObjectXY(x: number, y: number): [number, number] {
  return [snapToGrid(x), snapToGrid(y)];
}
