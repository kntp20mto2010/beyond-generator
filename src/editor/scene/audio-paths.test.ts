import { describe, expect, it } from "vitest";
import { createEmptyProject, createEmptyScene, type CharacterElement } from "../../core/schema/project.js";
import { collectAudioPaths } from "./audio-paths.js";

function charEl(id: string, talks: CharacterElement["talks"]): CharacterElement {
  return {
    id,
    kind: "character",
    ref: "builtin:template-a",
    transform: { x: 0, y: 0, scale: 1, flipX: false },
    z: 0,
    locked: false,
    enter: { type: "cut", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
    actions: [],
    expressions: [],
    talks,
  };
}

describe("collectAudioPaths", () => {
  it("talk と bgm のパスを重複なく集める", () => {
    const doc = createEmptyProject();
    doc.bgm = [{ audio: "assets/audio/bgm.mp3", gain: 0.5, loop: true }];
    const s1 = createEmptyScene(0);
    s1.elements = [
      charEl("a", [
        { t: 0, audio: "assets/audio/vo-001.wav", gain: 1 },
        { t: 1, audio: "assets/audio/vo-002.wav", gain: 1 },
      ]),
    ];
    const s2 = createEmptyScene(1);
    s2.elements = [
      charEl("b", [{ t: 0, audio: "assets/audio/vo-001.wav", gain: 1 }]), // 重複
    ];
    doc.scenes.push(s1, s2);
    const paths = collectAudioPaths(doc);
    expect(paths.sort()).toEqual([
      "assets/audio/bgm.mp3",
      "assets/audio/vo-001.wav",
      "assets/audio/vo-002.wav",
    ]);
  });

  it("talk/bgm が無ければ空配列", () => {
    const doc = createEmptyProject();
    doc.scenes.push(createEmptyScene(0));
    expect(collectAudioPaths(doc)).toEqual([]);
  });
});
