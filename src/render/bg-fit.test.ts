import { describe, it, expect } from "vitest";
import { computeBgFit } from "./bg-fit.js";

const SW = 1920;
const SH = 1080;

describe("computeBgFit", () => {
  it("ちょうど 16:9 (1920x1080) は cover-fit・ワールド=ステージ幅", () => {
    const f = computeBgFit(1920, 1080, SW, SH);
    expect(f).toEqual({ scale: 1, x: 0, y: 0, worldWidth: 1920 });
  });

  it("同アスペクトの高解像 (3840x2160) も cover-fit・ワールド=ステージ幅", () => {
    const f = computeBgFit(3840, 2160, SW, SH);
    expect(f.scale).toBeCloseTo(0.5, 6);
    expect(f.x).toBeCloseTo(0, 6);
    expect(f.y).toBeCloseTo(0, 6);
    expect(f.worldWidth).toBe(1920);
  });

  it("16:9 より横長 (3840x1080) はパノラマ: 高さフィット・左端基準・ワールド=背景幅", () => {
    const f = computeBgFit(3840, 1080, SW, SH);
    expect(f).toEqual({ scale: 1, x: 0, y: 0, worldWidth: 3840 });
  });

  it("3 画面ぶん (5760x1080) もパノラマ・ワールド=5760", () => {
    const f = computeBgFit(5760, 1080, SW, SH);
    expect(f.scale).toBe(1);
    expect(f.x).toBe(0);
    expect(f.worldWidth).toBe(5760);
  });

  it("わずかに 16:9 より横長 (2000x1080) もパノラマ判定", () => {
    const f = computeBgFit(2000, 1080, SW, SH);
    expect(f.x).toBe(0);
    expect(f.worldWidth).toBe(2000);
  });

  it("縦長 (1080x1920) は cover-fit で幅を満たし中央クロップ・ワールド=ステージ幅", () => {
    const f = computeBgFit(1080, 1920, SW, SH);
    // 幅基準: scale = 1920/1080 ≈ 1.7778、縦にはみ出して中央クロップ (y<0)
    expect(f.scale).toBeCloseTo(1920 / 1080, 6);
    expect(f.x).toBeCloseTo(0, 6);
    expect(f.y).toBeLessThan(0);
    expect(f.worldWidth).toBe(1920);
  });

  it("不正寸法 (0) はステージ幅にフォールバック", () => {
    expect(computeBgFit(0, 0, SW, SH)).toEqual({ scale: 1, x: 0, y: 0, worldWidth: 1920 });
  });
});
