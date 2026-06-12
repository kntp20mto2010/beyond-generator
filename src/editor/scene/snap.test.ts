import { describe, expect, it } from "vitest";
import { computeSnap, type Edges } from "./snap.js";

// 中心(cx,cy)・幅高からEdgesを作る補助
function edges(cx: number, cy: number, w: number, h: number): Edges {
  return {
    l: cx - w / 2,
    r: cx + w / 2,
    cx,
    t: cy - h / 2,
    b: cy + h / 2,
    cy,
  };
}

const THRESHOLD = 12;

describe("computeSnap: ステージ中央線への吸着", () => {
  it("cx が 960 付近なら中央へ吸着し v ガイドが出る", () => {
    const moving = edges(955, 540, 100, 80); // cx=955 → 960 へ +5
    const res = computeSnap(moving, [], THRESHOLD);
    expect(res.dx).toBe(5);
    expect(res.dy).toBe(0); // cy=540 はちょうど中央 → dy=0
    expect(res.guides).toContainEqual({ axis: "v", pos: 960 });
    expect(res.guides).toContainEqual({ axis: "h", pos: 540 });
  });

  it("どのエッジも閾値外なら吸着しない", () => {
    const moving = edges(900, 480, 40, 40); // 近い線まで距離が閾値超
    const res = computeSnap(moving, [], THRESHOLD);
    expect(res.dx).toBe(0);
    expect(res.dy).toBe(0);
    expect(res.guides).toHaveLength(0);
  });
});

describe("computeSnap: 他要素エッジへの吸着", () => {
  it("移動要素の左端が他要素の左端に揃う", () => {
    // other: cx=300, w=100 → l=250
    const other = edges(300, 700, 100, 100);
    // moving: l = 250+8 = 258 になる cx を選ぶ。w=100 → cx = 258+50 = 308
    const moving = edges(308, 700, 100, 100); // l=258 → 250 へ -8
    const res = computeSnap(moving, [other], THRESHOLD);
    expect(res.dx).toBe(-8);
    expect(res.guides).toContainEqual({ axis: "v", pos: 250 });
  });
});

describe("computeSnap: 複数候補の最近傍", () => {
  it("最も近い候補線を選ぶ", () => {
    // moving.cx=650: ステージ線640(距離10)と他要素エッジ655(距離5)→ 655 を選ぶ
    const other = edges(655, 540, 0, 0); // l=cx=r=655
    const moving = edges(650, 540, 0, 0);
    const res = computeSnap(moving, [other], THRESHOLD);
    expect(res.dx).toBe(5); // 650 → 655
    expect(res.guides).toContainEqual({ axis: "v", pos: 655 });
  });

  it("同距離ならステージ線を優先", () => {
    // moving.cx=635: ステージ線640(距離5)と他要素エッジ630(距離5)→ ステージ640優先
    const other = edges(630, 540, 0, 0);
    const moving = edges(635, 540, 0, 0);
    const res = computeSnap(moving, [other], THRESHOLD);
    expect(res.dx).toBe(5); // 635 → 640
    expect(res.guides).toContainEqual({ axis: "v", pos: 640 });
  });
});

describe("computeSnap: X/Y 独立", () => {
  it("X だけ吸着して Y は据え置き", () => {
    const moving = edges(958, 333, 0, 0); // cx=958→960(+2), cy=333 は線から離れる
    const res = computeSnap(moving, [], THRESHOLD);
    expect(res.dx).toBe(2);
    expect(res.dy).toBe(0);
    expect(res.guides).toContainEqual({ axis: "v", pos: 960 });
    expect(res.guides.some((g) => g.axis === "h")).toBe(false);
  });

  it("Y だけ吸着(セーフエリア上端 54)", () => {
    const moving = edges(333, 60, 0, 0); // cy=60 → 54(-6)、cx=333 は離れる
    const res = computeSnap(moving, [], THRESHOLD);
    expect(res.dy).toBe(-6);
    expect(res.dx).toBe(0);
    expect(res.guides).toContainEqual({ axis: "h", pos: 54 });
  });
});
