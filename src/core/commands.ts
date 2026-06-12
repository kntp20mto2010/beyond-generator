import type { DocStore } from "./doc-store.js";
import type { ProjectDoc } from "./schema/project.js";
import { createEmptyScene } from "./schema/project.js";

export function setTitle(store: DocStore<ProjectDoc>, title: string): void {
  store.dispatch("タイトル変更", (d) => { d.title = title; }, { mergeKey: "title" });
}

export function addScene(store: DocStore<ProjectDoc>): void {
  store.dispatch("シーン追加", (d) => {
    d.scenes.push(createEmptyScene(d.scenes.length));
  });
}

export function removeScene(store: DocStore<ProjectDoc>, id: string): void {
  store.dispatch("シーン削除", (d) => {
    const idx = d.scenes.findIndex((s) => s.id === id);
    if (idx !== -1) d.scenes.splice(idx, 1);
  });
}

export function setSceneDuration(
  store: DocStore<ProjectDoc>,
  id: string,
  sec: number,
): void {
  store.dispatch(
    "シーン長変更",
    (d) => {
      const scene = d.scenes.find((s) => s.id === id);
      if (scene) scene.duration = sec;
    },
    { mergeKey: `dur:${id}` },
  );
}
