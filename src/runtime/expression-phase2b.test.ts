import { describe, it, expect } from "vitest";
import { referencedShapeNames } from "./expression.js";

describe("referencedShapeNames", () => {
  it("browL は angryIn を含む", () => {
    const names = referencedShapeNames("browL");
    expect(names).toContain("angryIn");
  });

  it("browL は up / sadOut / worried を含む", () => {
    const names = referencedShapeNames("browL");
    expect(names).toContain("up");
    expect(names).toContain("sadOut");
    expect(names).toContain("worried");
  });

  it("mouth は smile / frown を含む", () => {
    const names = referencedShapeNames("mouth");
    expect(names).toContain("smile");
    expect(names).toContain("frown");
  });

  it("torso (faceスロットでない) は空", () => {
    const names = referencedShapeNames("torso");
    expect(names).toHaveLength(0);
  });

  it("重複なし", () => {
    const names = referencedShapeNames("browL");
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });
});
