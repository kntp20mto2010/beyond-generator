import { describe, it, expect } from "vitest";
import { layoutClipSheet } from "./ClipSheetPage.js";

describe("layoutClipSheet", () => {
  it("10×4グリッドで40要素を返す", () => {
    const layout = layoutClipSheet(10, 4);
    expect(layout.length).toBe(40);
  });

  it("row/col が正しく割り当てられる", () => {
    const layout = layoutClipSheet(2, 3);
    expect(layout[0]).toMatchObject({ row: 0, col: 0 });
    expect(layout[1]).toMatchObject({ row: 0, col: 1 });
    expect(layout[2]).toMatchObject({ row: 0, col: 2 });
    expect(layout[3]).toMatchObject({ row: 1, col: 0 });
  });

  it("x は列番号に比例して増加する", () => {
    const layout = layoutClipSheet(1, 4);
    expect(layout[1]!.x).toBeGreaterThan(layout[0]!.x);
    expect(layout[2]!.x).toBeGreaterThan(layout[1]!.x);
    expect(layout[3]!.x).toBeGreaterThan(layout[2]!.x);
  });

  it("y は行番号に比例して増加する", () => {
    const layout = layoutClipSheet(3, 1);
    expect(layout[1]!.y).toBeGreaterThan(layout[0]!.y);
    expect(layout[2]!.y).toBeGreaterThan(layout[1]!.y);
  });

  it("0×0は空配列", () => {
    expect(layoutClipSheet(0, 0)).toEqual([]);
  });
});
