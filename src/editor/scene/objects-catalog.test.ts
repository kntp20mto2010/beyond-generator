import { describe, expect, it } from "vitest";
import { OBJECT_CATALOG, resolveSideFlipX, type ObjectVariant } from "./objects-catalog.js";

const variant = (wallOrigin?: "left" | "right"): ObjectVariant => ({
  src: "x.png",
  nativeW: 100,
  nativeH: 100,
  ...(wallOrigin ? { wallOrigin } : {}),
});

describe("resolveSideFlipX", () => {
  it("left-origin & left-wall → no flip", () => {
    expect(resolveSideFlipX(variant("left"), "left")).toBe(false);
  });
  it("left-origin & right-wall → flip", () => {
    expect(resolveSideFlipX(variant("left"), "right")).toBe(true);
  });
  it("right-origin & left-wall → flip", () => {
    expect(resolveSideFlipX(variant("right"), "left")).toBe(true);
  });
  it("right-origin & right-wall → no flip", () => {
    expect(resolveSideFlipX(variant("right"), "right")).toBe(false);
  });
  it("wallOrigin 未指定は left 既定 (左壁→no flip / 右壁→flip)", () => {
    expect(resolveSideFlipX(variant(), "left")).toBe(false);
    expect(resolveSideFlipX(variant(), "right")).toBe(true);
  });
});

describe("OBJECT_CATALOG side variants", () => {
  it("既存全 side variant は wallOrigin を宣言している (暗黙の left 前提を排除)", () => {
    const missing: string[] = [];
    for (const def of OBJECT_CATALOG) {
      const s = def.views.side;
      if (s && s.wallOrigin === undefined) missing.push(def.id);
    }
    expect(missing).toEqual([]);
  });
});
