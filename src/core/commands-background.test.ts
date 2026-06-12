import { describe, expect, it } from "vitest";
import { DocStore } from "./doc-store.js";
import {
  addScene,
  setSceneBackground,
  setSceneBackgroundImage,
} from "./commands-project.js";
import { createEmptyProject, ProjectDocSchema } from "./schema/project.js";

const IMG = "assets/generated/bg-school-001.png";

function setup() {
  const store = new DocStore(createEmptyProject());
  addScene(store);
  const sceneId = store.doc.scenes[0]!.id;
  return { store, sceneId };
}

describe("背景の色と画像の独立保持", () => {
  it("画像を設定→色を設定しても画像が残る", () => {
    const { store, sceneId } = setup();
    setSceneBackgroundImage(store, sceneId, IMG);
    setSceneBackground(store, sceneId, "#cfe3f7");
    expect(store.doc.scenes[0]!.background).toEqual({ color: "#cfe3f7", image: IMG });
  });

  it("色を消しても画像が残り、画像も消すとnullになる", () => {
    const { store, sceneId } = setup();
    setSceneBackground(store, sceneId, "#cfe3f7");
    setSceneBackgroundImage(store, sceneId, IMG);
    setSceneBackground(store, sceneId, null);
    expect(store.doc.scenes[0]!.background).toEqual({ image: IMG });
    setSceneBackgroundImage(store, sceneId, null);
    expect(store.doc.scenes[0]!.background).toBeNull();
  });

  it("画像設定はundoできる", () => {
    const { store, sceneId } = setup();
    setSceneBackgroundImage(store, sceneId, IMG);
    expect(store.doc.scenes[0]!.background?.image).toBe(IMG);
    store.undo();
    expect(store.doc.scenes[0]!.background ?? null).toBeNull();
  });

  it("imageフィールド付きシーンがスキーマを通る(round-trip)", () => {
    const { store, sceneId } = setup();
    setSceneBackgroundImage(store, sceneId, IMG);
    setSceneBackground(store, sceneId, "#ffffff");
    const parsed = ProjectDocSchema.parse(JSON.parse(JSON.stringify(store.doc)));
    expect(parsed.scenes[0]!.background).toEqual({ color: "#ffffff", image: IMG });
  });
});
