import { describe, expect, it } from "vitest";
import { GRID, snapObjectXY } from "./grid.js";
import {
  cellsFromNative,
  objectDefaultCells,
  objectScale,
  objectScaleForCells,
  OBJECT_CATALOG,
  ALLOWED_ANGLES_BY_PLACEMENT,
  type ObjectViewName,
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

describe("カタログ整合性: placement → 許可される角度 (views キー)", () => {
  it("各 def の views キーは ALLOWED_ANGLES_BY_PLACEMENT[placement] の subset", () => {
    for (const def of OBJECT_CATALOG) {
      if (!def.placement) continue; // placement 未指定の def は許容(早期家具)
      const allowed = ALLOWED_ANGLES_BY_PLACEMENT[def.placement];
      const views = Object.keys(def.views) as ObjectViewName[];
      for (const v of views) {
        expect(allowed, `${def.id} (placement=${def.placement}) は ${v} を持てない`).toContain(v);
      }
    }
  });

  it("defaultView も ALLOWED_ANGLES_BY_PLACEMENT[placement] に含まれる", () => {
    for (const def of OBJECT_CATALOG) {
      if (!def.placement) continue;
      const allowed = ALLOWED_ANGLES_BY_PLACEMENT[def.placement];
      expect(allowed, `${def.id} の defaultView=${def.defaultView} が許可リスト外`).toContain(def.defaultView);
    }
  });
});

describe("セルの箱への contain スケール導出", () => {
  it("objectScale: 各 def の全 view が箱に収まり、片方の辺はちょうど整数セル", () => {
    for (const def of OBJECT_CATALOG) {
      for (const view of Object.keys(def.views) as ("front" | "side")[]) {
        const variant = def.views[view]!;
        const cells = objectDefaultCells(def, view);
        const scale = objectScale(def, view);
        const rw = scale * variant.nativeW;
        const rh = scale * variant.nativeH;
        // 箱(cells×GRID)を超えない(contain)
        expect(rw).toBeLessThanOrEqual(cells.w * GRID + 1e-6);
        expect(rh).toBeLessThanOrEqual(cells.h * GRID + 1e-6);
        // どちらかの辺はちょうど cells(満たす側)
        const wFills = Math.abs(rw - cells.w * GRID) < 1e-6;
        const hFills = Math.abs(rh - cells.h * GRID) < 1e-6;
        expect(wFills || hFills).toBe(true);
      }
    }
  });

  it("cellsFromNative: 約300px=1セルを繰り上げ(900×1200→3×4, 960×630→4×3)", () => {
    expect(cellsFromNative(900, 1200)).toEqual({ w: 3, h: 4 }); // 割り切れる
    expect(cellsFromNative(960, 630)).toEqual({ w: 4, h: 3 }); // ceil(3.2)=4, ceil(2.1)=3
    expect(cellsFromNative(301, 100)).toEqual({ w: 2, h: 1 }); // 端数は繰り上げ
    expect(cellsFromNative(100, 100)).toEqual({ w: 1, h: 1 }); // 最小1
  });

  it("ソファ既定 footprint は cells で明示 4×3", () => {
    const sofa = OBJECT_CATALOG.find((o) => o.id === "sofa-navy")!;
    const sofaFront = sofa.views["front-dimetric"]!;
    expect(objectDefaultCells(sofa)).toEqual({ w: 4, h: 3 });
    const scale = objectScale(sofa);
    // 4×3箱に contain: native 1010×789、min(480/1010, 360/789)=min(0.475,0.456)=0.456(高さ拘束)
    expect(scale).toBeCloseTo(360 / 789, 6);
    expect(scale * sofaFront.nativeH).toBeCloseTo(3 * GRID, 6); // 高さ=3セル
    expect(scale * sofaFront.nativeW).toBeLessThanOrEqual(4 * GRID); // 幅≤4セル
  });

  it("objectScaleForCells: セル変更で contain scale が追従", () => {
    const src = "assets/objects/sofa-navy-dimetric.png";
    // native 1010×789。5×3: min(600/1010, 360/789)=min(0.594,0.456)=0.456(高さ拘束)
    expect(objectScaleForCells(src, { w: 5, h: 3 })).toBeCloseTo(360 / 789, 6);
    // 7×3: 幅を広げても高さ拘束のまま
    expect(objectScaleForCells(src, { w: 7, h: 3 })).toBeCloseTo(360 / 789, 6);
    // 7×4: 高さ拘束 480/789 で拡大
    expect(objectScaleForCells(src, { w: 7, h: 4 })).toBeCloseTo(480 / 789, 6);
  });
});
