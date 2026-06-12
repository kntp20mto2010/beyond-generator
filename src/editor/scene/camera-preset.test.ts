import { describe, it, expect } from "vitest";
import { OVERVIEW_CAMERA, focusOnBounds } from "./camera-preset.js";

describe("OVERVIEW_CAMERA", () => {
  it("全景はステージ中央・等倍", () => {
    expect(OVERVIEW_CAMERA).toEqual({ x: 960, y: 540, zoom: 1 });
  });
});

describe("focusOnBounds", () => {
  it("中心は bounds 中心からやや上(高さ×0.15 だけ上)", () => {
    // bounds: x100..500 (cx=300), y200..600 (cy=400, height=400)
    const cam = focusOnBounds({ x: 100, y: 200, width: 400, height: 400 });
    expect(cam.x).toBeCloseTo(300, 5);
    // cy = 400 - 400*0.15 = 340
    expect(cam.y).toBeCloseTo(340, 5);
  });

  it("zoom = clamp(1080 / (高さ×1.6), 1, 2.5)", () => {
    // 高さ300 → 1080/(300*1.6)=1080/480=2.25
    const cam = focusOnBounds({ x: 0, y: 0, width: 200, height: 300 });
    expect(cam.zoom).toBeCloseTo(2.25, 5);
  });

  it("大きい要素は zoom 下限 1 にクランプ", () => {
    // 高さ1080 → 1080/(1080*1.6)=0.625 → clamp下限1
    const cam = focusOnBounds({ x: 0, y: 0, width: 400, height: 1080 });
    expect(cam.zoom).toBe(1);
  });

  it("小さい要素は zoom 上限 2.5 にクランプ", () => {
    // 高さ100 → 1080/(100*1.6)=6.75 → clamp上限2.5
    const cam = focusOnBounds({ x: 0, y: 0, width: 80, height: 100 });
    expect(cam.zoom).toBe(2.5);
  });

  it("高さ0は zoom=1 フォールバック", () => {
    const cam = focusOnBounds({ x: 0, y: 0, width: 0, height: 0 });
    expect(cam.zoom).toBe(1);
  });
});
