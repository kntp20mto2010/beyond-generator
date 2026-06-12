import { describe, expect, it } from "vitest";
import type { Action } from "../../core/schema/project.js";
import { actionBlocks, clampTime, snapCandidates, snapTime } from "./time-snap.js";

describe("snapTime: 候補への吸着", () => {
  it("閾値内の最近傍候補へ吸着する", () => {
    // pxPerSec=100, threshold=6px → 0.06s 以内なら吸着
    const t = snapTime(1.23, [1.2, 2.0], 100, 6);
    expect(t).toBeCloseTo(1.2, 6); // 距離0.03 < 0.06
  });

  it("複数候補があれば最も近い方を選ぶ", () => {
    // 1.18 は 1.2(距離0.02)と 1.15(距離0.03)→ 1.2
    const t = snapTime(1.18, [1.15, 1.2], 100, 6);
    expect(t).toBeCloseTo(1.2, 6);
  });

  it("閾値外なら0.05s刻みへ丸める", () => {
    // 1.23 から最寄り候補 1.0 は距離0.23 ≫ 0.06 → グリッド丸め
    const t = snapTime(1.23, [1.0], 100, 6);
    expect(t).toBeCloseTo(1.25, 6); // round(1.23/0.05)*0.05 = 1.25
  });

  it("px換算: pxPerSecが小さいと閾値秒が広がる", () => {
    // pxPerSec=20, threshold=6px → 0.3s 以内で吸着。0.23 < 0.3 なので吸着する
    const t = snapTime(1.23, [1.0], 20, 6);
    expect(t).toBeCloseTo(1.0, 6);
  });

  it("候補が空ならグリッド丸めのみ", () => {
    expect(snapTime(0.717, [], 100)).toBeCloseTo(0.7, 6);
  });
});

describe("snapCandidates: 整数秒+他キー", () => {
  it("0..durationの整数秒と他キーを含む", () => {
    const c = snapCandidates([1.2, 3.5], 4);
    expect(c).toEqual(expect.arrayContaining([0, 1, 2, 3, 4, 1.2, 3.5]));
  });
});

describe("clampTime", () => {
  it("0未満は0、duration超はduration", () => {
    expect(clampTime(-1, 4)).toBe(0);
    expect(clampTime(5, 4)).toBe(4);
    expect(clampTime(2.3, 4)).toBe(2.3);
  });
});

describe("actionBlocks: 区間計算", () => {
  it("各ブロックは次アクション開始まで、最後はシーン末まで", () => {
    const actions: Action[] = [
      { t: 0, clip: "idle", speed: 1 },
      { t: 1.5, clip: "wave", speed: 1 },
      { t: 3, clip: "talkA", speed: 1 },
    ];
    const b = actionBlocks([960, 700], actions, 4);
    expect(b).toHaveLength(3);
    expect(b[0]).toMatchObject({ t: 0, end: 1.5, clip: "idle" });
    expect(b[1]).toMatchObject({ t: 1.5, end: 3, clip: "wave" });
    expect(b[2]).toMatchObject({ t: 3, end: 4, clip: "talkA" });
  });

  it("元配列の順序に関わらず t 昇順で並び、元indexを保持する", () => {
    const actions: Action[] = [
      { t: 3, clip: "talkA", speed: 1 }, // index 0
      { t: 0, clip: "idle", speed: 1 }, // index 1
    ];
    const b = actionBlocks([960, 700], actions, 4);
    expect(b[0]).toMatchObject({ t: 0, index: 1 });
    expect(b[1]).toMatchObject({ t: 3, index: 0 });
  });

  it("空配列なら空", () => {
    expect(actionBlocks([0, 0], [], 4)).toEqual([]);
  });
});

describe("actionBlocks: moveTo 到着時刻", () => {
  it("moveTo付きは到着時刻(travelEnd)を arrival に持つ", () => {
    // walk の virtualVelocity を使い、x=960→1560(距離600)を歩く。
    const actions: Action[] = [{ t: 0, clip: "walk", speed: 1, moveTo: { x: 1560 } }];
    const b = actionBlocks([960, 700], actions, 10);
    expect(b).toHaveLength(1);
    expect(b[0]!.hasMove).toBe(true);
    // 到着は 0 より後・シーン末以内
    expect(b[0]!.arrival).toBeGreaterThan(0);
    expect(b[0]!.arrival).toBeLessThanOrEqual(10);
  });

  it("moveToが無ければ arrival===t・hasMove=false", () => {
    const actions: Action[] = [{ t: 1, clip: "idle", speed: 1 }];
    const b = actionBlocks([960, 700], actions, 4);
    expect(b[0]!.arrival).toBe(1);
    expect(b[0]!.hasMove).toBe(false);
  });

  it("移動距離が0(同座標moveTo)なら hasMove=false", () => {
    const actions: Action[] = [{ t: 0, clip: "walk", speed: 1, moveTo: { x: 960, y: 700 } }];
    const b = actionBlocks([960, 700], actions, 4);
    expect(b[0]!.hasMove).toBe(false);
    expect(b[0]!.arrival).toBe(0);
  });
});
