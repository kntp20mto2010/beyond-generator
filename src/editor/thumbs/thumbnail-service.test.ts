import { describe, it, expect } from "vitest";
import { makeCacheKey, fitInBounds, coverFit, stageThumbScale } from "./thumbnail-service.js";

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

describe("stageThumbScale", () => {
  it("128×72サムネは 1920×1080 を 1/15 に縮める", () => {
    // 128/1920 = 0.0666..., 72/1080 = 0.0666... 一致
    expect(stageThumbScale(128, 72)).toBeCloseTo(128 / 1920, 6);
    expect(stageThumbScale(128, 72)).toBeCloseTo(72 / 1080, 6);
  });

  it("アスペクト不一致では小さい方を採用", () => {
    // 幅200/1920=0.104, 高さ72/1080=0.066 → 高さ方向
    expect(stageThumbScale(200, 72)).toBeCloseTo(72 / 1080, 6);
  });
});

describe("coverFit", () => {
  it("同アスペクトはぴったり収まる", () => {
    const r = coverFit(1920, 1080, 128, 72);
    expect(r.dx).toBeCloseTo(0, 5);
    expect(r.dy).toBeCloseTo(0, 5);
    expect(r.dw).toBeCloseTo(128, 5);
    expect(r.dh).toBeCloseTo(72, 5);
  });

  it("横長画像は左右がはみ出し中央クロップ(dx<0)", () => {
    // 200×100 を 128×72 へ: s=max(128/200=0.64, 72/100=0.72)=0.72
    // dw=200*0.72=144, dh=100*0.72=72, dx=(128-144)/2=-8, dy=0
    const r = coverFit(200, 100, 128, 72);
    expect(r.dw).toBeCloseTo(144, 5);
    expect(r.dh).toBeCloseTo(72, 5);
    expect(r.dx).toBeCloseTo(-8, 5);
    expect(r.dy).toBeCloseTo(0, 5);
  });

  it("縦長画像は上下がはみ出し中央クロップ(dy<0)", () => {
    // 100×200 を 128×72 へ: s=max(128/100=1.28, 72/200=0.36)=1.28
    // dw=128, dh=200*1.28=256, dy=(72-256)/2=-92
    const r = coverFit(100, 200, 128, 72);
    expect(r.dw).toBeCloseTo(128, 5);
    expect(r.dh).toBeCloseTo(256, 5);
    expect(r.dx).toBeCloseTo(0, 5);
    expect(r.dy).toBeCloseTo(-92, 5);
  });

  it("不正サイズ(0)はキャンバス全面フォールバック", () => {
    const r = coverFit(0, 0, 128, 72);
    expect(r).toEqual({ dx: 0, dy: 0, dw: 128, dh: 72 });
  });
});
