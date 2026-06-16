import { describe, expect, it } from "vitest";
import { GRID, snapObjectXY } from "./grid.js";
import { OBJECT_CATALOG, objectScale, objectScaleForCells } from "./objects-catalog.js";

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
      const scale = objectScale(def);
      const rw = scale * def.nativeW;
      const rh = scale * def.nativeH;
      // 箱(cells×GRID)を超えない(contain)
      expect(rw).toBeLessThanOrEqual(def.cells.w * GRID + 1e-6);
      expect(rh).toBeLessThanOrEqual(def.cells.h * GRID + 1e-6);
      // どちらかの辺はちょうど cells(満たす側)
      const wFills = Math.abs(rw - def.cells.w * GRID) < 1e-6;
      const hFills = Math.abs(rh - def.cells.h * GRID) < 1e-6;
      expect(wFills || hFills).toBe(true);
    }
  });

  it("ソファ(960×630)を5×3箱に: 高さが3セル(360px)を満たし scale 0.571", () => {
    const sofa = OBJECT_CATALOG.find((o) => o.id === "sofa-navy")!;
    const scale = objectScale(sofa);
    expect(scale).toBeCloseTo(360 / 630, 6); // 高さ contain
    expect(scale * sofa.nativeH).toBeCloseTo(3 * GRID, 6); // 高さ=3セル
    expect(scale * sofa.nativeW).toBeLessThan(5 * GRID); // 幅は5セル未満(左右padding)
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
