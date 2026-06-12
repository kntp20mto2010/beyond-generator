import { describe, it, expect } from "vitest";
import { makeCacheKey, fitInBounds } from "./thumbnail-service.js";

describe("makeCacheKey", () => {
  it("同じ引数なら同じキー", () => {
    const k1 = makeCacheKey("builtin:template-a", { expression: "smile", clip: "walk", phase: 0.4, face: false });
    const k2 = makeCacheKey("builtin:template-a", { expression: "smile", clip: "walk", phase: 0.4, face: false });
    expect(k1).toBe(k2);
  });

  it("異なる expression なら異なるキー", () => {
    const k1 = makeCacheKey("ref", { expression: "smile" });
    const k2 = makeCacheKey("ref", { expression: "angry" });
    expect(k1).not.toBe(k2);
  });

  it("face=true と face=false で異なるキー", () => {
    const k1 = makeCacheKey("ref", { face: true });
    const k2 = makeCacheKey("ref", { face: false });
    expect(k1).not.toBe(k2);
  });

  it("clip と phase が異なれば異なるキー", () => {
    const k1 = makeCacheKey("ref", { clip: "walk", phase: 0 });
    const k2 = makeCacheKey("ref", { clip: "walk", phase: 0.5 });
    expect(k1).not.toBe(k2);
  });
});

describe("fitInBounds", () => {
  it("余白8%を考慮したスケールと中央揃えを返す", () => {
    const result = fitInBounds({ x: 0, y: 0, width: 100, height: 100 }, 200, 200);
    // available = 1 - 0.08*2 = 0.84。scale = (200*0.84)/100 = 1.68
    expect(result.scale).toBeCloseTo(1.68, 5);
    // tx = 100 - 50*1.68 = 100 - 84 = 16
    expect(result.tx).toBeCloseTo(16, 5);
    expect(result.ty).toBeCloseTo(16, 5);
  });

  it("縦長のboundsは高さ方向がボトルネック", () => {
    const result = fitInBounds({ x: 0, y: 0, width: 50, height: 200 }, 100, 100);
    // scale: min(100*0.84/50=1.68, 100*0.84/200=0.42) → 0.42
    expect(result.scale).toBeCloseTo(0.42, 5);
  });

  it("bounds幅・高さがゼロの場合はフォールバック", () => {
    const result = fitInBounds({ x: 0, y: 0, width: 0, height: 0 }, 100, 100);
    expect(result.scale).toBe(1);
    expect(result.tx).toBe(50);
    expect(result.ty).toBe(50);
  });

  it("boundsにオフセットがあっても中央に配置", () => {
    // bounds の中心が (50, 50) の場合
    const result = fitInBounds({ x: 0, y: 0, width: 100, height: 100 }, 100, 100, 0);
    // scale = min(100/100, 100/100) = 1
    expect(result.scale).toBeCloseTo(1, 5);
    expect(result.tx).toBeCloseTo(0, 5);
    expect(result.ty).toBeCloseTo(0, 5);
  });
});
