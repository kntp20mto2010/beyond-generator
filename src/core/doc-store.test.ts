import { describe, it, expect, vi } from "vitest";
import { DocStore } from "./doc-store.js";

interface Counter {
  value: number;
  label: string;
}

function makeStore(initial: Counter = { value: 0, label: "" }) {
  return new DocStore<Counter>(initial);
}

describe("DocStore: dispatch / undo / redo", () => {
  it("dispatch changes the doc", () => {
    const store = makeStore();
    store.dispatch("inc", (d) => { d.value = 1; });
    expect(store.doc.value).toBe(1);
  });

  it("undo reverts to previous state", () => {
    const store = makeStore();
    store.dispatch("inc", (d) => { d.value = 10; });
    store.undo();
    expect(store.doc.value).toBe(0);
  });

  it("redo re-applies the reverted command", () => {
    const store = makeStore();
    store.dispatch("inc", (d) => { d.value = 42; });
    store.undo();
    store.redo();
    expect(store.doc.value).toBe(42);
  });

  it("canUndo is false initially, true after dispatch", () => {
    const store = makeStore();
    expect(store.canUndo()).toBe(false);
    store.dispatch("set", (d) => { d.value = 1; });
    expect(store.canUndo()).toBe(true);
  });

  it("canRedo is false initially, true after undo", () => {
    const store = makeStore();
    store.dispatch("set", (d) => { d.value = 1; });
    expect(store.canRedo()).toBe(false);
    store.undo();
    expect(store.canRedo()).toBe(true);
  });

  it("revision increments on dispatch, undo, and redo", () => {
    const store = makeStore();
    const r0 = store.revision;
    store.dispatch("set", (d) => { d.value = 1; });
    expect(store.revision).toBe(r0 + 1);
    store.undo();
    expect(store.revision).toBe(r0 + 2);
    store.redo();
    expect(store.revision).toBe(r0 + 3);
  });
});

describe("DocStore: mergeKey統合", () => {
  it("2回の同一mergeKeyが1000ms以内なら1undo操作で両方戻る", () => {
    const store = makeStore({ value: 0, label: "" });
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    store.dispatch("title", (d) => { d.label = "A"; }, { mergeKey: "lbl" });
    vi.spyOn(Date, "now").mockReturnValue(now + 500);
    store.dispatch("title", (d) => { d.label = "AB"; }, { mergeKey: "lbl" });

    expect(store.doc.label).toBe("AB");
    store.undo();
    expect(store.doc.label).toBe("");

    vi.restoreAllMocks();
  });

  it("1001ms後の同一mergeKeyは別エントリになる", () => {
    const store = makeStore({ value: 0, label: "" });
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    store.dispatch("title", (d) => { d.label = "A"; }, { mergeKey: "lbl" });
    vi.spyOn(Date, "now").mockReturnValue(now + 1001);
    store.dispatch("title", (d) => { d.label = "AB"; }, { mergeKey: "lbl" });

    store.undo();
    expect(store.doc.label).toBe("A");
    store.undo();
    expect(store.doc.label).toBe("");

    vi.restoreAllMocks();
  });
});

describe("DocStore: dispatch後にredoクリア", () => {
  it("undo後に新しいdispatchでredoスタックがクリアされる", () => {
    const store = makeStore();
    store.dispatch("a", (d) => { d.value = 1; });
    store.dispatch("b", (d) => { d.value = 2; });
    store.undo();
    expect(store.canRedo()).toBe(true);
    store.dispatch("c", (d) => { d.value = 99; });
    expect(store.canRedo()).toBe(false);
  });
});

describe("DocStore: 履歴上限200", () => {
  it("201回dispatchしても200エントリを超えない", () => {
    const store = makeStore();
    for (let i = 0; i < 201; i++) {
      store.dispatch("inc", (d) => { d.value = i; });
    }
    // 200回undoできるが201回目はできない
    for (let i = 0; i < 200; i++) {
      expect(store.canUndo()).toBe(true);
      store.undo();
    }
    expect(store.canUndo()).toBe(false);
  });
});

describe("DocStore: subscribe", () => {
  it("dispatchで購読コールバックが呼ばれる", () => {
    const store = makeStore();
    let called = 0;
    const unsub = store.subscribe(() => { called++; });
    store.dispatch("set", (d) => { d.value = 1; });
    expect(called).toBe(1);
    unsub();
    store.dispatch("set", (d) => { d.value = 2; });
    expect(called).toBe(1);
  });
});
