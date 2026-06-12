import { describe, it, expect } from "vitest";
import { layoutContactSheet } from "./ContactSheetPage.js";

describe("layoutContactSheet", () => {
  it("4×6グリッドで24要素を返す", () => {
    const layout = layoutContactSheet(4, 6);
    expect(layout.length).toBe(24);
  });

  it("row/col が正しく割り当てられる", () => {
    const layout = layoutContactSheet(2, 3);
    expect(layout[0]).toMatchObject({ row: 0, col: 0 });
    expect(layout[1]).toMatchObject({ row: 0, col: 1 });
    expect(layout[2]).toMatchObject({ row: 0, col: 2 });
    expect(layout[3]).toMatchObject({ row: 1, col: 0 });
  });

  it("x は列番号に比例して増加する", () => {
    const layout = layoutContactSheet(1, 3);
    expect(layout[1]!.x).toBeGreaterThan(layout[0]!.x);
    expect(layout[2]!.x).toBeGreaterThan(layout[1]!.x);
  });

  it("y は行番号に比例して増加する", () => {
    const layout = layoutContactSheet(3, 1);
    expect(layout[1]!.y).toBeGreaterThan(layout[0]!.y);
    expect(layout[2]!.y).toBeGreaterThan(layout[1]!.y);
  });

  it("0×0は空配列", () => {
    expect(layoutContactSheet(0, 0)).toEqual([]);
  });
});
