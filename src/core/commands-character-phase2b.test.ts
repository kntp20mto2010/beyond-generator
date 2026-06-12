import { describe, it, expect } from "vitest";
import { DocStore } from "./doc-store.js";
import {
  addFaceVariant,
  removeFaceVariant,
  mirrorLR,
  updateStrandPhysics,
} from "./commands-character.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import type { CharacterDoc } from "./schema/character.js";
import type { SlotRef } from "../editor/character/slot-ref.js";

function makeStore(): DocStore<CharacterDoc> {
  return new DocStore<CharacterDoc>(structuredClone(TEMPLATE_A));
}

describe("addFaceVariant", () => {
  it("neutralの複製でバリアントを追加できる", () => {
    const store = makeStore();
    addFaceVariant(store, "browL", "testVariant", true);
    const shapes = store.doc.face["browL"]?.shapes["testVariant"];
    expect(shapes).toBeDefined();
    expect(shapes).toEqual(store.doc.face["browL"]!.shapes["neutral"]);
  });

  it("copyFromNeutral=falseで空配列", () => {
    const store = makeStore();
    addFaceVariant(store, "browL", "empty", false);
    expect(store.doc.face["browL"]?.shapes["empty"]).toEqual([]);
  });

  it("undoで元に戻る", () => {
    const store = makeStore();
    const before = Object.keys(store.doc.face["browL"]!.shapes).length;
    addFaceVariant(store, "browL", "undoTest", true);
    expect(Object.keys(store.doc.face["browL"]!.shapes).length).toBe(before + 1);
    store.undo();
    expect(Object.keys(store.doc.face["browL"]!.shapes).length).toBe(before);
  });

  it("既存バリアントは上書きしない", () => {
    const store = makeStore();
    const neutralShapes = store.doc.face["browL"]!.shapes["neutral"]!;
    // neutral に対して addFaceVariant しても変わらない
    addFaceVariant(store, "browL", "neutral", false);
    expect(store.doc.face["browL"]!.shapes["neutral"]).toEqual(neutralShapes);
  });
});

describe("removeFaceVariant", () => {
  it("バリアントを削除できる", () => {
    const store = makeStore();
    addFaceVariant(store, "browL", "removeMe", true);
    removeFaceVariant(store, "browL", "removeMe");
    expect(store.doc.face["browL"]?.shapes["removeMe"]).toBeUndefined();
  });

  it("neutralは削除拒否(no-op)", () => {
    const store = makeStore();
    const revBefore = store.revision;
    removeFaceVariant(store, "browL", "neutral");
    expect(store.revision).toBe(revBefore);
    expect(store.doc.face["browL"]?.shapes["neutral"]).toBeDefined();
  });
});

describe("mirrorLR: variant付きface", () => {
  it("browL.angryIn → browR.angryIn が対称になる", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "face", slot: "browL", variant: "angryIn" };
    mirrorLR(store, ref);
    const leftShapes = store.doc.face["browL"]?.shapes["angryIn"];
    const rightShapes = store.doc.face["browR"]?.shapes["angryIn"];
    expect(leftShapes).toBeDefined();
    expect(rightShapes).toBeDefined();
    // L側とR側のx座標は符号反転している
    const ls = leftShapes?.[0];
    const rs = rightShapes?.[0];
    if (ls?.kind === "polygon" && rs?.kind === "polygon") {
      const lx = ls.points[0]?.[0] ?? 0;
      const rx = rs.points[0]?.[0] ?? 0;
      expect(lx).toBeCloseTo(-rx, 1);
    }
  });

  it("相手スロットが同variantを持たない場合も作成する", () => {
    const store = makeStore();
    // browRにangryInを追加してから確認
    addFaceVariant(store, "browL", "newVariant", false);
    const ref: SlotRef = { kind: "face", slot: "browL", variant: "newVariant" };
    mirrorLR(store, ref);
    expect(store.doc.face["browR"]?.shapes["newVariant"]).toBeDefined();
  });
});

describe("updateStrandPhysics", () => {
  it("物理パラメータを更新できる", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "hair", layer: "back", index: 0 };
    updateStrandPhysics(store, ref, { stiffness: 0.9, gravity: 0.5 });
    expect(store.doc.hair.back[0]?.physics.stiffness).toBeCloseTo(0.9);
    expect(store.doc.hair.back[0]?.physics.gravity).toBeCloseTo(0.5);
  });

  it("mergeKeyで統合される(1操作でundo)", () => {
    const store = makeStore();
    const ref: SlotRef = { kind: "hair", layer: "front", index: 0 };
    const origStiffness = store.doc.hair.front[0]?.physics.stiffness ?? 0;
    updateStrandPhysics(store, ref, { stiffness: 0.3 }, "physics:test");
    updateStrandPhysics(store, ref, { stiffness: 0.4 }, "physics:test");
    expect(store.doc.hair.front[0]?.physics.stiffness).toBeCloseTo(0.4);
    store.undo();
    expect(store.doc.hair.front[0]?.physics.stiffness).toBeCloseTo(origStiffness);
  });
});
