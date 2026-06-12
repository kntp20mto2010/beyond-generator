import { describe, it, expect } from "vitest";
import { TEMPLATE_A } from "../../presets/characters/template-a.js";
import { getShapes, refKey } from "./slot-ref.js";
import type { SlotRef } from "./slot-ref.js";

describe("slot-ref: face variant", () => {
  it("variant未指定はneutralを返す", () => {
    const ref: SlotRef = { kind: "face", slot: "browL" };
    const shapes = getShapes(TEMPLATE_A, ref);
    expect(shapes).toBeDefined();
    expect(shapes).toEqual(TEMPLATE_A.face["browL"]!.shapes["neutral"]);
  });

  it("variant指定でそのバリアントを返す", () => {
    const ref: SlotRef = { kind: "face", slot: "browL", variant: "up" };
    const shapes = getShapes(TEMPLATE_A, ref);
    expect(shapes).toEqual(TEMPLATE_A.face["browL"]!.shapes["up"]);
  });

  it("存在しないvariantはneutralへフォールバック", () => {
    const ref: SlotRef = { kind: "face", slot: "browL", variant: "nonexistent" };
    const shapes = getShapes(TEMPLATE_A, ref);
    expect(shapes).toEqual(TEMPLATE_A.face["browL"]!.shapes["neutral"]);
  });

  it("refKey: variant未指定はneutralキー", () => {
    const ref: SlotRef = { kind: "face", slot: "browL" };
    expect(refKey(ref)).toBe("face:browL:neutral");
  });

  it("refKey: variant指定でそのキー", () => {
    const ref: SlotRef = { kind: "face", slot: "browL", variant: "angryIn" };
    expect(refKey(ref)).toBe("face:browL:angryIn");
  });

  it("refKeyはslot+variantの組み合わせで一意", () => {
    const keys = new Set([
      refKey({ kind: "face", slot: "browL" }),
      refKey({ kind: "face", slot: "browL", variant: "neutral" }),
      refKey({ kind: "face", slot: "browL", variant: "up" }),
      refKey({ kind: "face", slot: "browR" }),
    ]);
    // browL:neutralとbrowL:undefined(=neutral)は同じキー → Set size = 3
    expect(keys.size).toBe(3);
  });
});
