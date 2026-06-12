// タイムラインのドラッグ時刻計算。純関数(テスト対象)。
// 座標は「秒」。px換算はスナップ閾値の判定にのみ使う。

import type { Action } from "../../core/schema/project.js";
import { expandActions } from "../../runtime/scene-eval.js";

const GRID = 0.05; // 細刻み(秒)

function roundToGrid(t: number): number {
  return Math.round(t / GRID) * GRID;
}

// 生のドラッグ結果 t を、近傍candidate(threshold内)へ吸着 or 0.05s刻みへ丸める。
// クランプ(0..duration)は呼び出し側の責務。
export function snapTime(
  t: number,
  candidates: readonly number[],
  pxPerSec: number,
  thresholdPx = 6,
): number {
  const thresholdSec = pxPerSec > 0 ? thresholdPx / pxPerSec : 0;
  let best: number | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d <= thresholdSec && d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  if (best !== null) return best;
  return roundToGrid(t);
}

// スナップ候補の生成: 自分以外の全キー時刻 + 0..duration の整数秒。
// 重複は気にしない(snapTimeは最近傍を返すだけ)。
export function snapCandidates(
  others: readonly number[],
  duration: number,
): number[] {
  const out: number[] = [];
  for (let s = 0; s <= Math.floor(duration + 1e-9); s++) out.push(s);
  out.push(...others);
  return out;
}

// アクションブロックの区間。t は開始、end は次アクション開始(最後はシーン末)。
// arrival は moveTo 到着時刻(移動が無ければ t と同じ = ブロックに移動帯を描かない合図として
// arrival===t で判定)。
export interface ActionBlock {
  index: number; // 元 actions 配列でのインデックス
  t: number;
  end: number;
  clip: string;
  arrival: number; // moveTo 到着時刻(無移動なら t)
  hasMove: boolean;
}

// 区間計算 + moveTo 到着時刻。expandActions で位置を畳み込み、各アクションの travelEnd を引く。
// expandActions は暗黙の先頭 idle や到着 idle を挿入するため、元 actions と t で対応付ける。
export function actionBlocks(
  origin: readonly [number, number],
  actions: readonly Action[],
  duration: number,
): ActionBlock[] {
  if (actions.length === 0) return [];

  // 元 actions を t 昇順にし、元 index を保持
  const indexed = actions.map((a, index) => ({ a, index }));
  indexed.sort((x, y) => x.a.t - y.a.t);

  const expanded = expandActions([origin[0], origin[1]], actions);

  const blocks: ActionBlock[] = [];
  for (let i = 0; i < indexed.length; i++) {
    const cur = indexed[i]!;
    const next = indexed[i + 1];
    const end = next ? next.a.t : duration;

    // 同 t・同 clip の展開エントリから travelEnd を拾う(moveTo 到着時刻)
    const hasMove = cur.a.moveTo !== undefined;
    let arrival = cur.a.t;
    if (hasMove) {
      const match = expanded.find(
        (e) => Math.abs(e.t - cur.a.t) < 1e-9 && e.clip === cur.a.clip && (e.to[0] !== e.from[0] || e.to[1] !== e.from[1]),
      );
      if (match) arrival = match.travelEnd;
    }

    blocks.push({
      index: cur.index,
      t: cur.a.t,
      end,
      clip: cur.a.clip,
      arrival,
      hasMove: hasMove && arrival > cur.a.t,
    });
  }
  return blocks;
}

// 0..duration クランプ(ドラッグ確定値)
export function clampTime(t: number, duration: number): number {
  return Math.max(0, Math.min(duration, t));
}
