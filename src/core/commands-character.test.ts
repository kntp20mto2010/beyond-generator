import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { DocStore } from "./doc-store.js";
import {
  addShape,
  removeShape,
  updateShape,
  movePin,
  mirrorLR,
} from "./commands-character.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import type { CharacterDoc } from "./schema/character.js";
import type { SlotRef } from "../editor/character/slot-ref.js";

function makeStore(): DocStore<CharacterDoc> {
  return new DocStore<CharacterDoc>(structuredClone(TEMPLATE_A));
}

describe("commands-character: addShape / removeShape", () => {
  it("addShape で shapes が増える", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "part", slot: "torso" };
    const before = store.doc.parts.find((p) => p.slot === "torso")!.shapes.length;
    addShape(store, ref, { kind: "ellipse", cx: 0, cy: 0, rx: 10, ry: 10, fill: "@skin" });
    expect(store.doc.parts.find((p) => p.slot === "torso")!.shapes.length).toBe(before + 1);
  });

  it("removeShape で shapes が減り、undoで戻る", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "part", slot: "torso" };
    const before = store.doc.parts.find((p) => p.slot === "torso")!.shapes.length;
    removeShape(store, ref, 0);
    expect(store.doc.parts.find((p) => p.slot === "torso")!.shapes.length).toBe(before - 1);
    store.undo();
    expect(store.doc.parts.find((p) => p.slot === "torso")!.shapes.length).toBe(before);
  });

  it("hand の addShape", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "hand", name: "open" };
    const before = store.doc.hands["open"]!.shapes.length;
    addShape(store, ref, { kind: "ellipse", cx: 0, cy: 0, rx: 5, ry: 5, fill: "@skin" });
    expect(store.doc.hands["open"]!.shapes.length).toBe(before + 1);
  });

  it("face の addShape (neutral)", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "face", slot: "mouth" };
    const before = store.doc.face["mouth"]!.shapes["neutral"]!.length;
    addShape(store, ref, { kind: "ellipse", cx: 0, cy: -250, rx: 5, ry: 3, fill: "@skin" });
    expect(store.doc.face["mouth"]!.shapes["neutral"]!.length).toBe(before + 1);
  });
});

describe("commands-character: updateShape mergeKey統合", () => {
  it("同じmergeKeyで1000ms以内なら1undo操作", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "part", slot: "torso" };
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    updateShape(store, ref, 0, { x: -50 }, "shape:part:torso:0");
    vi.spyOn(Date, "now").mockReturnValue(now + 400);
    updateShape(store, ref, 0, { x: -60 }, "shape:part:torso:0");

    const shape = store.doc.parts.find((p) => p.slot === "torso")!.shapes[0]!;
    expect(shape.kind === "rect" && shape.x).toBe(-60);

    store.undo();
    const afterUndo = store.doc.parts.find((p) => p.slot === "torso")!.shapes[0]!;
    // 元の値に一発で戻る
    if (afterUndo.kind === "rect") {
      expect(afterUndo.x).not.toBe(-60);
      expect(afterUndo.x).not.toBe(-50);
    }

    vi.restoreAllMocks();
  });
});

describe("commands-character: movePin", () => {
  it("part の origin ピンを移動できる", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "part", slot: "torso" };
    movePin(store, ref, "origin", [5, 10]);
    const pins = store.doc.parts.find((p) => p.slot === "torso")!.pins;
    expect(pins["origin"]).toEqual([5, 10]);
  });

  it("face の anchor を移動できる", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "face", slot: "mouth" };
    movePin(store, ref, "anchor", [3, -260]);
    expect(store.doc.face["mouth"]!.anchor).toEqual([3, -260]);
  });

  it("hair の pin を移動できる", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "hair", layer: "back", index: 0 };
    movePin(store, ref, "pin", [1, -330]);
    expect(store.doc.hair.back[0]!.pin).toEqual([1, -330]);
  });
});

describe("commands-character: mirrorLR", () => {
  it("upperArmL → upperArmR がx対称になる", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "part", slot: "upperArmL" };
    mirrorLR(store, ref);
    const l = store.doc.parts.find((p) => p.slot === "upperArmL")!;
    const r = store.doc.parts.find((p) => p.slot === "upperArmR")!;
    expect(l.pins["origin"]![0]).toBeCloseTo(-(r.pins["origin"]![0] ?? 0));
    // shapes should be mirrored
    const ls = l.shapes[0];
    const rs = r.shapes[0];
    if (ls?.kind === "rect" && rs?.kind === "rect") {
      expect(rs.x).toBeCloseTo(-(ls.x + ls.w));
    }
  });

  it("対応なしref (torso) でコマンドは空振り", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "part", slot: "torso" };
    const revBefore = store.revision;
    mirrorLR(store, ref);
    // dispatch は呼ばれるが patches=0 で revision は変わらない
    expect(store.revision).toBe(revBefore);
  });
});
