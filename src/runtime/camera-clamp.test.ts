import { describe, it, expect } from "vitest";
import { clampCameraX } from "./camera-clamp.js";

const SW = 1920;

describe("clampCameraX", () => {
  it("パノラマ (world 3840, zoom 1): 左端は 960、右端は 2880 にクランプ", () => {
    expect(clampCameraX(0, 1, 3840, SW)).toBe(960); // 左へ振り切り → 左端
    expect(clampCameraX(9999, 1, 3840, SW)).toBe(2880); // 右へ振り切り → 右端
    expect(clampCameraX(1500, 1, 3840, SW)).toBe(1500); // 範囲内はそのまま
  });

  it("通常 (world=ステージ幅 1920, zoom 1): 常に中央 960 (パンできない)", () => {
    expect(clampCameraX(0, 1, 1920, SW)).toBe(960);
    expect(clampCameraX(1800, 1, 1920, SW)).toBe(960);
  });

  it("ズームイン (zoom 2) で可視幅が半分 → world 1920 でもパン可能", () => {
    // halfView = 1920/(2*2) = 480 → 範囲 [480, 1440]
    expect(clampCameraX(0, 2, 1920, SW)).toBe(480);
    expect(clampCameraX(9999, 2, 1920, SW)).toBe(1440);
    expect(clampCameraX(960, 2, 1920, SW)).toBe(960);
  });

  it("ワールドが可視幅より狭ければ中央に固定", () => {
    // zoom 0.5 → halfView = 1920、world 1920 < 3840 → 中央 960
    expect(clampCameraX(0, 0.5, 1920, SW)).toBe(960);
  });

  it("3 画面パノラマ (world 5760, zoom 1): 右端は 4800", () => {
    expect(clampCameraX(99999, 1, 5760, SW)).toBe(4800);
    expect(clampCameraX(-5, 1, 5760, SW)).toBe(960);
  });
});
