// ドラッグ中の吸着(スナップ)。純関数。座標はステージ(1920×1080)系。

export interface Edges {
  l: number;
  cx: number;
  r: number;
  t: number;
  cy: number;
  b: number;
}

export interface SnapGuide {
  axis: "v" | "h"; // v=縦線(x固定), h=横線(y固定)
  pos: number; // ステージ座標の線
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

const SNAP_X_LINES = [0, 640, 960, 1280, 1920]; // 中央・3分割・端
const SNAP_Y_LINES = [0, 360, 540, 720, 1080];
const SAFE_X = [96, 1824];
const SAFE_Y = [54, 1026];

interface Candidate {
  pos: number; // 候補線(ステージ座標)
  stage: boolean; // ステージ線/セーフエリア(優先) か他要素エッジ か
}

// 1軸のスナップを解く。movingの3エッジ × 候補 で最小距離ペアを取る
function solveAxis(
  movingEdges: readonly number[],
  candidates: readonly Candidate[],
  threshold: number,
): { delta: number; line: number } | null {
  let best: { delta: number; line: number; dist: number; stage: boolean } | null = null;
  for (const edge of movingEdges) {
    for (const c of candidates) {
      const dist = Math.abs(c.pos - edge);
      if (dist > threshold) continue;
      if (
        best === null ||
        dist < best.dist ||
        // 同距離はステージ線優先
        (dist === best.dist && c.stage && !best.stage)
      ) {
        best = { delta: c.pos - edge, line: c.pos, dist, stage: c.stage };
      }
    }
  }
  return best ? { delta: best.delta, line: best.line } : null;
}

export function computeSnap(
  moving: Edges,
  others: readonly Edges[],
  threshold: number,
): SnapResult {
  const xCands: Candidate[] = [
    ...SNAP_X_LINES.map((pos) => ({ pos, stage: true })),
    ...SAFE_X.map((pos) => ({ pos, stage: true })),
  ];
  const yCands: Candidate[] = [
    ...SNAP_Y_LINES.map((pos) => ({ pos, stage: true })),
    ...SAFE_Y.map((pos) => ({ pos, stage: true })),
  ];
  for (const o of others) {
    xCands.push({ pos: o.l, stage: false }, { pos: o.cx, stage: false }, { pos: o.r, stage: false });
    yCands.push({ pos: o.t, stage: false }, { pos: o.cy, stage: false }, { pos: o.b, stage: false });
  }

  const guides: SnapGuide[] = [];
  let dx = 0;
  let dy = 0;

  const xs = solveAxis([moving.l, moving.cx, moving.r], xCands, threshold);
  if (xs) {
    dx = xs.delta;
    guides.push({ axis: "v", pos: xs.line });
  }
  const ys = solveAxis([moving.t, moving.cy, moving.b], yCands, threshold);
  if (ys) {
    dy = ys.delta;
    guides.push({ axis: "h", pos: ys.line });
  }

  return { dx, dy, guides };
}
