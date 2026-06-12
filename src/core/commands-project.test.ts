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
  addElement,
  addExpressionKey,
  duplicateScene,
  moveScene,
  removeElement,
  setElementEnter,
  setSceneBackground,
  setTextProps,
  updateAction,
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
