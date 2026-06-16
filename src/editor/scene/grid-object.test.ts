import { describe, expect, it } from "vitest";
import { GRID, snapObjectXY } from "./grid.js";
import {
  cellsFromNative,
  objectDefaultCells,
  objectScale,
  objectScaleForCells,
  OBJECT_CATALOG,
} from "./objects-catalog.js";

// オブジェクトのグリッド吸着(偶奇位相)とセル幅スケール導出。
describe("オブジェクトのグリッド吸着", () => {
  it("偶数幅: 中心はグリッド線、左右端もグリッド線に乗る", () => {
    const cellsW = 4;
    const [sx] = snapObjectXY(1000, 960, cellsW);
    expect(sx % GRID).toBe(0); // 中心=グリッド線
    const half = (cellsW * GRID) / 2;
    expect((sx - half) % GRID).toBe(0); // 左端
    expect((sx + half) % GRID).toBe(0); // 右端
  });

  it("奇数幅: 中心は半セル、左右端がグリッド線に乗る", () => {
    const cellsW = 5;
    const [sx] = snapObjectXY(1150, 960, cellsW);
    expect(((sx % GRID) + GRID) % GRID).toBe(GRID / 2); // 中心=半セル(60)
    const half = (cellsW * GRID) / 2; // 2.5セル=300
    expect((((sx - half) % GRID) + GRID) % GRID).toBe(0); // 左端=グリッド線
    expect((((sx + half) % GRID) + GRID) % GRID).toBe(0); // 右端=グリッド線
  });

  it("Yは床=グリッド線へ吸着", () => {
    const [, sy] = snapObjectXY(1000, 890, 5);
    expect(sy % GRID).toBe(0);
    expect(sy).toBe(840); // 890 は 840(7行目の線)が最寄り
  });

  it("既定(cellsW省略)は偶数扱い=中心グリッド線(後方互換)", () => {
    const [sx, sy] = snapObjectXY(1010, 950);
    expect(sx % GRID).toBe(0);
    expect(sy % GRID).toBe(0);
  });
});

describe("セルの箱への contain スケール導出", () => {
  it("objectScale: アスペクト保持で箱に収まり、片方の辺はちょうど整数セル", () => {
    for (const def of OBJECT_CATALOG) {
      const cells = objectDefaultCells(def);
      const scale = objectScale(def);
      const rw = scale * def.nativeW;
      const rh = scale * def.nativeH;
      // 箱(cells×GRID)を超えない(contain)
      expect(rw).toBeLessThanOrEqual(cells.w * GRID + 1e-6);
      expect(rh).toBeLessThanOrEqual(cells.h * GRID + 1e-6);
      // どちらかの辺はちょうど cells(満たす側)
      const wFills = Math.abs(rw - cells.w * GRID) < 1e-6;
      const hFills = Math.abs(rh - cells.h * GRID) < 1e-6;
      expect(wFills || hFills).toBe(true);
    }
  });

  it("cellsFromNative: 約300px=1セルを繰り上げ(900×1200→3×4, 960×630→4×3)", () => {
    expect(cellsFromNative(900, 1200)).toEqual({ w: 3, h: 4 }); // 割り切れる
    expect(cellsFromNative(960, 630)).toEqual({ w: 4, h: 3 }); // ceil(3.2)=4, ceil(2.1)=3
    expect(cellsFromNative(301, 100)).toEqual({ w: 2, h: 1 }); // 端数は繰り上げ
    expect(cellsFromNative(100, 100)).toEqual({ w: 1, h: 1 }); // 最小1
  });

  it("ソファ既定 footprint は ceil(native/300) = 4×3セル", () => {
    const sofa = OBJECT_CATALOG.find((o) => o.id === "sofa-navy")!;
    expect(objectDefaultCells(sofa)).toEqual({ w: 4, h: 3 });
    const scale = objectScale(sofa);
    // 4×3箱に contain: min(4*120/960, 3*120/630)=min(0.5,0.571)=0.5(幅拘束)
    expect(scale).toBeCloseTo(0.5, 6);
    expect(scale * sofa.nativeW).toBeCloseTo(4 * GRID, 6); // 幅=4セル
    expect(scale * sofa.nativeH).toBeLessThanOrEqual(3 * GRID); // 高さ≤3セル
  });

  it("objectScaleForCells: セル変更で contain scale が追従", () => {
    const src = "assets/objects/sofa-navy-2seat.png";
    // 5×3: 高さ拘束 → 360/630
    expect(objectScaleForCells(src, { w: 5, h: 3 })).toBeCloseTo(360 / 630, 6);
    // 7×3: 幅を広げても高さ拘束のまま(箱が広がり padding 増)
    expect(objectScaleForCells(src, { w: 7, h: 3 })).toBeCloseTo(360 / 630, 6);
    // 7×4: 高さ拘束 480/630 で拡大
    expect(objectScaleForCells(src, { w: 7, h: 4 })).toBeCloseTo(480 / 630, 6);
  });
});
