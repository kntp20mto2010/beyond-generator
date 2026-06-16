import { describe, expect, it } from "vitest";
import { GRID, snapObjectXY } from "./grid.js";
import { OBJECT_CATALOG, objectScale } from "./objects-catalog.js";

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

describe("セル幅からのスケール導出", () => {
  it("objectScale: 幅 = cells.w セル になる", () => {
    for (const def of OBJECT_CATALOG) {
      const scale = objectScale(def);
      const renderedW = scale * def.nativeW;
      expect(renderedW).toBeCloseTo(def.cells.w * GRID, 6);
    }
  });

  it("ソファは 5 セル幅 (scale 0.625)", () => {
    const sofa = OBJECT_CATALOG.find((o) => o.id === "sofa-navy")!;
    expect(objectScale(sofa)).toBeCloseTo(0.625, 6);
  });
});
