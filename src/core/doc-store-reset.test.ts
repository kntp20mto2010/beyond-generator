import { describe, it, expect } from "vitest";
import { DocStore } from "./doc-store.js";

interface Counter {
  value: number;
}

describe("DocStore.reset", () => {
  it("reset後にcanUndo=false・canRedo=false", () => {
    const store = new DocStore<Counter>({ value: 0 });
    store.dispatch("inc", (d) => { d.value = 1; });
    store.dispatch("inc", (d) => { d.value = 2; });
    expect(store.canUndo()).toBe(true);

    store.reset({ value: 99 });
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });

  it("reset後にdoc が新しい値になっている", () => {
    const store = new DocStore<Counter>({ value: 0 });
    store.dispatch("inc", (d) => { d.value = 1; });
    store.reset({ value: 42 });
    expect(store.doc.value).toBe(42);
  });

  it("reset で revision が増える", () => {
    const store = new DocStore<Counter>({ value: 0 });
    const r0 = store.revision;
    store.reset({ value: 10 });
    expect(store.revision).toBe(r0 + 1);
  });

  it("reset で購読コールバックが呼ばれる", () => {
    const store = new DocStore<Counter>({ value: 0 });
    let called = 0;
    store.subscribe(() => { called++; });
    store.reset({ value: 5 });
    expect(called).toBe(1);
  });

  it("reset後 undoスタックは空でundo操作は何もしない", () => {
    const store = new DocStore<Counter>({ value: 0 });
    store.dispatch("inc", (d) => { d.value = 99; });
    store.reset({ value: 10 });
    store.undo(); // no-op
    expect(store.doc.value).toBe(10);
  });
});
