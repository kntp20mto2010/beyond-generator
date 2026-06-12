import type { ProjectDoc } from "../../core/schema/project.js";

// doc 内の全 talk / bgm の音声パスを重複なく集める(ensureAudioLoaded 用)。純関数。
export function collectAudioPaths(doc: ProjectDoc): string[] {
  const set = new Set<string>();
  for (const bgm of doc.bgm) {
    if (bgm.audio) set.add(bgm.audio);
  }
  for (const scene of doc.scenes) {
    for (const el of scene.elements) {
      if (el.kind !== "character") continue;
      for (const talk of el.talks) {
        if (talk.audio) set.add(talk.audio);
      }
    }
  }
  return [...set];
}
