import { afterEach, describe, expect, it } from "vitest";
import { DocStore } from "./doc-store.js";
import { setIdFactory } from "./id.js";
import { ulid } from "ulid";
import {
  createEmptyProject,
  createEmptyScene,
  type CharacterElement,
  type ProjectDoc,
  type TextElement,
} from "./schema/project.js";
import {
  addAction,
  addCameraKey,
  addElement,
  addExpressionKey,
  duplicateElement,
  duplicateScene,
  moveScene,
  moveSceneTo,
  removeCameraKey,
  removeElement,
  reorderElement,
  replaceElementRef,
  setElementEnter,
  setElementLocked,
  setSceneBackground,
  setSceneTransition,
  setTextProps,
  unlockAllElements,
  updateAction,
  updateCameraKey,
  updateElementTransform,
} from "./commands-project.js";

afterEach(() => {
  setIdFactory(ulid);
});

function storeWithScene(): { store: DocStore<ProjectDoc>; sceneId: string } {
  const project = createEmptyProject();
  const scene = createEmptyScene(0);
  project.scenes.push(scene);
  return { store: new DocStore(project), sceneId: scene.id };
}

function charEl(id: string): CharacterElement {
  return {
    id,
    kind: "character",
    ref: "builtin:template-a",
    transform: { x: 960, y: 700, scale: 0.9, flipX: false },
    z: 0,
    locked: false,
    enter: { type: "cut", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
    actions: [],
    expressions: [],
  };
}

function textEl(id: string): TextElement {
  return {
    id,
    kind: "text",
    text: "テキスト",
    size: 64,
    color: "#2E2A33",
    strokeColor: "#ffffff",
    strokeWidth: 8,
    transform: { x: 960, y: 200, scale: 1, flipX: false },
    z: 100,
    locked: false,
    enter: { type: "cut", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
  };
}

describe("addElement / removeElement", () => {
  it("追加と undo で元に戻る", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    expect(store.doc.scenes[0]!.elements).toHaveLength(1);
    store.undo();
    expect(store.doc.scenes[0]!.elements).toHaveLength(0);
  });

  it("削除と undo で復元される", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    removeElement(store, sceneId, "e1");
    expect(store.doc.scenes[0]!.elements).toHaveLength(0);
    store.undo();
    expect(store.doc.scenes[0]!.elements).toHaveLength(1);
    expect(store.doc.scenes[0]!.elements[0]!.id).toBe("e1");
  });
});

describe("updateElementTransform", () => {
  it("累積デルタ更新は同一mergeKeyで1つの履歴にまとまる", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    const baseUndo = store.canUndo();
    expect(baseUndo).toBe(true);
    updateElementTransform(store, sceneId, "e1", { x: 100 });
    updateElementTransform(store, sceneId, "e1", { x: 200 });
    updateElementTransform(store, sceneId, "e1", { x: 300 });
    const el = store.doc.scenes[0]!.elements[0]!;
    expect(el.transform.x).toBe(300);
    // addElement + (merge済みtransform) で undo は2回で空に戻る
    store.undo(); // transform一括
    expect((store.doc.scenes[0]!.elements[0]!).transform.x).toBe(960);
    store.undo(); // addElement
    expect(store.doc.scenes[0]!.elements).toHaveLength(0);
  });
});

describe("duplicateScene", () => {
  it("深複製で新しいシーンidと要素idを持つ", () => {
    let counter = 0;
    setIdFactory(() => `dup-${counter++}`);
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("orig-el"));

    duplicateScene(store, sceneId);
    const scenes = store.doc.scenes;
    expect(scenes).toHaveLength(2);
    expect(scenes[1]!.id).not.toBe(scenes[0]!.id);
    // 要素idも振り直されている
    expect(scenes[1]!.elements[0]!.id).not.toBe("orig-el");
    // 内容(参照)は同じ
    const a = scenes[0]!.elements[0]!;
    const b = scenes[1]!.elements[0]!;
    if (a.kind !== "character" || b.kind !== "character") throw new Error("char");
    expect(b.ref).toBe(a.ref);
  });

  it("複製は元シーンの直後に挿入される", () => {
    let counter = 0;
    setIdFactory(() => `s-${counter++}`);
    const project = createEmptyProject();
    const s0 = createEmptyScene(0);
    const s1 = createEmptyScene(1);
    project.scenes.push(s0, s1);
    const store = new DocStore(project);
    duplicateScene(store, s0.id);
    expect(store.doc.scenes).toHaveLength(3);
    expect(store.doc.scenes[2]!.id).toBe(s1.id); // 元の2番目が末尾へ
  });
});

describe("moveScene", () => {
  it("インデックスを入れ替える", () => {
    const project = createEmptyProject();
    const s0 = createEmptyScene(0);
    const s1 = createEmptyScene(1);
    project.scenes.push(s0, s1);
    const store = new DocStore(project);
    moveScene(store, s1.id, -1);
    expect(store.doc.scenes[0]!.id).toBe(s1.id);
    expect(store.doc.scenes[1]!.id).toBe(s0.id);
  });

  it("端を越える移動は無視", () => {
    const project = createEmptyProject();
    const s0 = createEmptyScene(0);
    project.scenes.push(s0);
    const store = new DocStore(project);
    moveScene(store, s0.id, -1);
    expect(store.doc.scenes[0]!.id).toBe(s0.id);
  });
});

describe("moveSceneTo", () => {
  function threeScenes() {
    const project = createEmptyProject();
    const s0 = createEmptyScene(0);
    const s1 = createEmptyScene(1);
    const s2 = createEmptyScene(2);
    project.scenes.push(s0, s1, s2);
    return { store: new DocStore(project), ids: [s0.id, s1.id, s2.id] as const };
  }

  it("前→後ろへ移動(0 → 2)", () => {
    const { store, ids } = threeScenes();
    moveSceneTo(store, ids[0], 2);
    expect(store.doc.scenes.map((s) => s.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it("後ろ→前へ移動(2 → 0)", () => {
    const { store, ids } = threeScenes();
    moveSceneTo(store, ids[2], 0);
    expect(store.doc.scenes.map((s) => s.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it("同位置は no-op(undo履歴も増えない)", () => {
    const { store, ids } = threeScenes();
    const rev = store.revision;
    moveSceneTo(store, ids[1], 1);
    expect(store.doc.scenes.map((s) => s.id)).toEqual([ids[0], ids[1], ids[2]]);
    expect(store.revision).toBe(rev);
    expect(store.canUndo()).toBe(false);
  });

  it("範囲外のtoIndexは無視", () => {
    const { store, ids } = threeScenes();
    moveSceneTo(store, ids[0], 5);
    moveSceneTo(store, ids[0], -1);
    expect(store.doc.scenes.map((s) => s.id)).toEqual([ids[0], ids[1], ids[2]]);
  });

  it("undo 1回で元の並びに戻る", () => {
    const { store, ids } = threeScenes();
    moveSceneTo(store, ids[0], 2);
    store.undo();
    expect(store.doc.scenes.map((s) => s.id)).toEqual([ids[0], ids[1], ids[2]]);
  });
});

describe("アクション", () => {
  it("追加後 t 昇順でソートされる", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    addAction(store, sceneId, "e1", { t: 2, clip: "wave", speed: 1 });
    addAction(store, sceneId, "e1", { t: 0.5, clip: "run", speed: 1 });
    addAction(store, sceneId, "e1", { t: 1, clip: "nod", speed: 1 });
    const el = store.doc.scenes[0]!.elements[0]!;
    if (el.kind !== "character") throw new Error("char");
    expect(el.actions.map((a) => a.t)).toEqual([0.5, 1, 2]);
  });

  it("updateAction で t を変えると再ソートされる", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    addAction(store, sceneId, "e1", { t: 0.5, clip: "run", speed: 1 });
    addAction(store, sceneId, "e1", { t: 2, clip: "wave", speed: 1 });
    updateAction(store, sceneId, "e1", 0, { t: 3 }); // run を末尾へ
    const el = store.doc.scenes[0]!.elements[0]!;
    if (el.kind !== "character") throw new Error("char");
    expect(el.actions.map((a) => a.t)).toEqual([2, 3]);
    expect(el.actions[1]!.clip).toBe("run");
  });

  it("テキスト要素にはアクションが追加されない", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, textEl("t1"));
    addAction(store, sceneId, "t1", { t: 0, clip: "wave", speed: 1 });
    const el = store.doc.scenes[0]!.elements[0]!;
    expect(el.kind).toBe("text");
    expect((el as Record<string, unknown>)["actions"]).toBeUndefined();
  });
});

describe("表情キー", () => {
  it("追加後 t 昇順", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    addExpressionKey(store, sceneId, "e1", { t: 2, preset: "smile" });
    addExpressionKey(store, sceneId, "e1", { t: 0, preset: "neutral" });
    const el = store.doc.scenes[0]!.elements[0]!;
    if (el.kind !== "character") throw new Error("char");
    expect(el.expressions.map((e) => e.t)).toEqual([0, 2]);
  });
});

describe("setSceneBackground / setTextProps", () => {
  it("背景色の設定と解除", () => {
    const { store, sceneId } = storeWithScene();
    setSceneBackground(store, sceneId, "#112233");
    expect(store.doc.scenes[0]!.background).toEqual({ color: "#112233" });
    setSceneBackground(store, sceneId, null);
    expect(store.doc.scenes[0]!.background).toBe(null);
  });

  it("テキスト内容の更新", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, textEl("t1"));
    setTextProps(store, sceneId, "t1", { text: "更新", size: 80 });
    const el = store.doc.scenes[0]!.elements[0]!;
    if (el.kind !== "text") throw new Error("text");
    expect(el.text).toBe("更新");
    expect(el.size).toBe(80);
  });
});

describe("カメラキー CRUD", () => {
  it("追加後は t 昇順、undo で元に戻る", () => {
    const { store, sceneId } = storeWithScene();
    addCameraKey(store, sceneId, { t: 2, x: 200, y: 0, zoom: 1 });
    addCameraKey(store, sceneId, { t: 0, x: 0, y: 0, zoom: 1 });
    const cam = store.doc.scenes[0]!.camera;
    expect(cam.map((k) => k.t)).toEqual([0, 2]); // tソート
    store.undo();
    expect(store.doc.scenes[0]!.camera).toHaveLength(1);
    store.undo();
    expect(store.doc.scenes[0]!.camera).toHaveLength(0);
  });

  it("更新で値が変わり、t変更で再ソートされる", () => {
    const { store, sceneId } = storeWithScene();
    addCameraKey(store, sceneId, { t: 0, x: 0, y: 0, zoom: 1 });
    addCameraKey(store, sceneId, { t: 1, x: 100, y: 0, zoom: 1 });
    updateCameraKey(store, sceneId, 0, { zoom: 2.5 });
    expect(store.doc.scenes[0]!.camera[0]!.zoom).toBe(2.5);
    // index0(t=0)を t=5 へ → 末尾に並び替わる
    updateCameraKey(store, sceneId, 0, { t: 5 });
    expect(store.doc.scenes[0]!.camera.map((k) => k.t)).toEqual([1, 5]);
  });

  it("削除で対象キーが消える", () => {
    const { store, sceneId } = storeWithScene();
    addCameraKey(store, sceneId, { t: 0, x: 0, y: 0, zoom: 1 });
    addCameraKey(store, sceneId, { t: 1, x: 100, y: 0, zoom: 1 });
    removeCameraKey(store, sceneId, 0);
    expect(store.doc.scenes[0]!.camera).toHaveLength(1);
    expect(store.doc.scenes[0]!.camera[0]!.t).toBe(1);
  });
});

describe("setSceneTransition", () => {
  it("transition のパッチ適用 + undo", () => {
    const { store, sceneId } = storeWithScene();
    setSceneTransition(store, sceneId, { type: "slide", dur: 0.9 });
    expect(store.doc.scenes[0]!.transition).toEqual({ type: "slide", dur: 0.9 });
    store.undo();
    expect(store.doc.scenes[0]!.transition.type).toBe("cut");
  });
});

describe("updateAction: moveTo の付与と解除", () => {
  it("moveTo を付与 → 解除すると key が残らない", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    addAction(store, sceneId, "e1", { t: 0, clip: "walk", speed: 1 });
    // 付与
    updateAction(store, sceneId, "e1", 0, { moveTo: { x: 500, y: 300 } });
    const el1 = store.doc.scenes[0]!.elements[0]!;
    if (el1.kind !== "character") throw new Error("char");
    expect(el1.actions[0]!.moveTo).toEqual({ x: 500, y: 300 });
    // 解除(moveTo: undefined かつ "moveTo" in patch)
    updateAction(store, sceneId, "e1", 0, { moveTo: undefined });
    const el2 = store.doc.scenes[0]!.elements[0]!;
    if (el2.kind !== "character") throw new Error("char");
    expect("moveTo" in el2.actions[0]!).toBe(false);
  });
});

describe("setElementEnter", () => {
  it("enter効果のパッチ適用", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    setElementEnter(store, sceneId, "e1", { type: "slideL", dur: 0.6 });
    const el = store.doc.scenes[0]!.elements[0]!;
    expect(el.enter.type).toBe("slideL");
    expect(el.enter.dur).toBe(0.6);
  });
});

// ---------------------------------------------------------------------------
// Phase 4b-2: duplicate / reorder / lock / replace
// ---------------------------------------------------------------------------

function zOrder(store: DocStore<ProjectDoc>): number[] {
  return store.doc.scenes[0]!.elements.map((e) => e.z);
}

describe("duplicateElement", () => {
  it("新id + x,y+24 + z=既存max+1 の深複製", () => {
    let counter = 0;
    setIdFactory(() => `dup-${counter++}`);
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, { ...charEl("e1"), z: 3 });
    duplicateElement(store, sceneId, "e1");
    const els = store.doc.scenes[0]!.elements;
    expect(els).toHaveLength(2);
    const copy = els[1]!;
    expect(copy.id).not.toBe("e1");
    expect(copy.transform.x).toBe(960 + 24);
    expect(copy.transform.y).toBe(700 + 24);
    expect(copy.z).toBe(4); // max(3)+1
  });

  it("複製は元と独立(深複製)", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    duplicateElement(store, sceneId, "e1");
    const copy = store.doc.scenes[0]!.elements[1]!;
    updateElementTransform(store, sceneId, copy.id, { x: 5 });
    // 元は変わらない
    expect(store.doc.scenes[0]!.elements[0]!.transform.x).toBe(960);
  });

  it("undo で複製が消える", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    duplicateElement(store, sceneId, "e1");
    expect(store.doc.scenes[0]!.elements).toHaveLength(2);
    store.undo();
    expect(store.doc.scenes[0]!.elements).toHaveLength(1);
  });
});

describe("reorderElement", () => {
  // z昇順で a(0), b(1), c(2)
  function threeEls(): { store: DocStore<ProjectDoc>; sceneId: string } {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, { ...charEl("a"), z: 0 });
    addElement(store, sceneId, { ...charEl("b"), z: 1 });
    addElement(store, sceneId, { ...charEl("c"), z: 2 });
    return { store, sceneId };
  }
  function zof(store: DocStore<ProjectDoc>, id: string): number {
    return store.doc.scenes[0]!.elements.find((e) => e.id === id)!.z;
  }

  it("front: 対象を最前面へ、z は 0..n-1 に正規化", () => {
    const { store, sceneId } = threeEls();
    reorderElement(store, sceneId, "a", "front");
    expect(zof(store, "a")).toBe(2);
    expect(zof(store, "b")).toBe(0);
    expect(zof(store, "c")).toBe(1);
    expect([...zOrder(store)].sort()).toEqual([0, 1, 2]);
  });

  it("back: 対象を最背面へ", () => {
    const { store, sceneId } = threeEls();
    reorderElement(store, sceneId, "c", "back");
    expect(zof(store, "c")).toBe(0);
    expect(zof(store, "a")).toBe(1);
    expect(zof(store, "b")).toBe(2);
  });

  it("forward: 1つ前面へ", () => {
    const { store, sceneId } = threeEls();
    reorderElement(store, sceneId, "a", "forward");
    expect(zof(store, "a")).toBe(1);
    expect(zof(store, "b")).toBe(0);
    expect(zof(store, "c")).toBe(2);
  });

  it("backward: 1つ背面へ", () => {
    const { store, sceneId } = threeEls();
    reorderElement(store, sceneId, "c", "backward");
    expect(zof(store, "c")).toBe(1);
    expect(zof(store, "b")).toBe(2);
    expect(zof(store, "a")).toBe(0);
  });

  it("同z混在から開始しても順序が安定(配列順で正規化)", () => {
    const { store, sceneId } = storeWithScene();
    // すべて z=0(同z)。配列順 a,b,c を維持して正規化されるべき
    addElement(store, sceneId, { ...charEl("a"), z: 0 });
    addElement(store, sceneId, { ...charEl("b"), z: 0 });
    addElement(store, sceneId, { ...charEl("c"), z: 0 });
    reorderElement(store, sceneId, "b", "front");
    // a,c は元の相対順を保ち 0,1、b は最前面 2
    expect(store.doc.scenes[0]!.elements.find((e) => e.id === "a")!.z).toBe(0);
    expect(store.doc.scenes[0]!.elements.find((e) => e.id === "c")!.z).toBe(1);
    expect(store.doc.scenes[0]!.elements.find((e) => e.id === "b")!.z).toBe(2);
  });

  it("undo が1回で元のz配置へ戻る", () => {
    const { store, sceneId } = threeEls();
    const before = zOrder(store);
    reorderElement(store, sceneId, "a", "front");
    expect(zOrder(store)).not.toEqual(before);
    store.undo();
    expect(zOrder(store)).toEqual(before);
  });
});

describe("setElementLocked / unlockAllElements", () => {
  it("ロックのトグルと undo", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, charEl("e1"));
    setElementLocked(store, sceneId, "e1", true);
    expect(store.doc.scenes[0]!.elements[0]!.locked).toBe(true);
    store.undo();
    expect(store.doc.scenes[0]!.elements[0]!.locked).toBe(false);
  });

  it("全ロック解除", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, { ...charEl("a"), locked: true });
    addElement(store, sceneId, { ...textEl("b"), locked: true });
    unlockAllElements(store, sceneId);
    expect(store.doc.scenes[0]!.elements.every((e) => !e.locked)).toBe(true);
  });
});

describe("replaceElementRef", () => {
  it("ref のみ変更し、transform / actions / expressions は不変", () => {
    const { store, sceneId } = storeWithScene();
    const base: CharacterElement = {
      ...charEl("e1"),
      transform: { x: 123, y: 456, scale: 1.3, flipX: true },
      actions: [{ t: 0.5, clip: "wave", speed: 1.2, moveTo: { x: 800, y: 600 } }],
      expressions: [{ t: 1, preset: "smile" }],
    };
    addElement(store, sceneId, base);
    const beforeEl = store.doc.scenes[0]!.elements[0]!;
    if (beforeEl.kind !== "character") throw new Error("char");
    const beforeTransform = structuredClone(beforeEl.transform);
    const beforeActions = structuredClone(beforeEl.actions);
    const beforeExpr = structuredClone(beforeEl.expressions);

    replaceElementRef(store, sceneId, "e1", "characters/other.byc.json");
    const after = store.doc.scenes[0]!.elements[0]!;
    if (after.kind !== "character") throw new Error("char");
    expect(after.ref).toBe("characters/other.byc.json");
    expect(after.transform).toEqual(beforeTransform);
    expect(after.actions).toEqual(beforeActions);
    expect(after.expressions).toEqual(beforeExpr);
  });

  it("text 要素には作用しない", () => {
    const { store, sceneId } = storeWithScene();
    addElement(store, sceneId, textEl("t1"));
    replaceElementRef(store, sceneId, "t1", "characters/x.byc.json");
    const el = store.doc.scenes[0]!.elements[0]!;
    expect(el.kind).toBe("text");
    expect((el as Record<string, unknown>)["ref"]).toBeUndefined();
  });
});
