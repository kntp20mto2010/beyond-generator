// カメラ x をワールド境界内に収める (パノラマ横スクロールでビューポートが
// ワールド外の余白へ出ないようにする)。
//
// zoom を考慮した可視幅の半分を halfView とし、cam.x を [halfView, worldWidth-halfView]
// にクランプする。ワールドが可視幅より狭ければ中央に固定。
export function clampCameraX(
  x: number,
  zoom: number,
  worldWidth: number,
  stageW: number,
): number {
  const halfView = stageW / (2 * Math.max(zoom, 1e-6));
  if (worldWidth <= halfView * 2) return worldWidth / 2;
  return Math.min(Math.max(x, halfView), worldWidth - halfView);
}
