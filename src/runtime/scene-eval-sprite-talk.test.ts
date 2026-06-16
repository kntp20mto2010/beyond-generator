import { describe, expect, it } from "vitest";
import type { CharacterElement, SceneDoc } from "../core/schema/project.js";
import { createEmptyProject, createEmptyScene } from "../core/schema/project.js";
import { SAKURA_CFG } from "../editor/newchar/character-configs.js";
import { evaluateScene, type AudioEnvelopeLookup, type CharResolver } from "./scene-eval.js";

// スプライトキャラ(新キャラ)の口パク発火 drivers.talk を決定論的に検証する。
// 発火条件: 発話クリップ(talk/sit-talk)がアクティブ、または talk音声がアクティブ。
const resolver: CharResolver = {
  getCharacter: () => undefined,
  getSpriteCharacter: (ref) => (ref === "builtin:sakura" ? SAKURA_CFG : undefined),
};

// duration=1s の talk音声スタブ(中身は talk 判定に無関係、窓だけ使う)
const audio: AudioEnvelopeLookup = {
  lookup: (path) =>
    path === "assets/audio/vo-001.wav"
      ? { envelope: Uint8Array.from([1, 0, 0, 0]), duration: 1 }
      : undefined,
};

function makeSpriteEl(over: Partial<CharacterElement> = {}): CharacterElement {
  return {
    id: "s1",
    kind: "character",
    ref: "builtin:sakura",
    transform: { x: 960, y: 700, scale: 0.9, flipX: false },
    z: 0,
    locked: false,
    enter: { type: "cut", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
    actions: [],
    expressions: [],
    talks: [],
    ...over,
  };
}

function sceneWith(el: CharacterElement): { project: ReturnType<typeof createEmptyProject>; scene: SceneDoc } {
  const project = createEmptyProject();
  const scene = createEmptyScene(5);
  scene.duration = 8;
  scene.elements = [el];
  return { project, scene };
}

function talkDriver(el: CharacterElement, t: number, withAudio: boolean): boolean {
  const { project, scene } = sceneWith(el);
  const frame = evaluateScene(project, scene, t, resolver, withAudio ? { audio } : undefined);
  const item = frame.find((f) => f.elementId === "s1");
  if (!item || item.payload.kind !== "sprite-character") {
    throw new Error("sprite-character payload missing");
  }
  return item.payload.drivers.talk;
}

describe("スプライトキャラの口パク発火 drivers.talk", () => {
  it("clip=talk(従来) → talk=true(音声無しでも所作で口が動く)", () => {
    const el = makeSpriteEl({ actions: [{ t: 0, clip: "talk", speed: 1 }] });
    expect(talkDriver(el, 1, false)).toBe(true);
  });

  it("clip=sit-talk → talk=true(着座したまま喋る・音声非依存)", () => {
    const el = makeSpriteEl({ actions: [{ t: 0, clip: "sit-talk", speed: 1 }] });
    expect(talkDriver(el, 1, false)).toBe(true);
  });

  it("clip=sit(着座保持)のみ・音声無し → talk=false(座って黙っている)", () => {
    const el = makeSpriteEl({ actions: [{ t: 0, clip: "sit", speed: 1 }] });
    expect(talkDriver(el, 1, false)).toBe(false);
  });

  it("clip=sit + talk音声が窓内 → talk=true(座ったまま音声に同期して喋る)", () => {
    const el = makeSpriteEl({
      actions: [{ t: 0, clip: "sit", speed: 1 }],
      talks: [{ t: 2, audio: "assets/audio/vo-001.wav", gain: 1 }],
    });
    // 音声窓 [2, 3)。t=2.5 は窓内
    expect(talkDriver(el, 2.5, true)).toBe(true);
  });

  it("clip=sit + talk音声が窓外 → talk=false(発話終了で口が止まる)", () => {
    const el = makeSpriteEl({
      actions: [{ t: 0, clip: "sit", speed: 1 }],
      talks: [{ t: 2, audio: "assets/audio/vo-001.wav", gain: 1 }],
    });
    // 音声窓 [2, 3)。t=4 は窓外 → 口は閉じる(音声同期)
    expect(talkDriver(el, 4, true)).toBe(false);
  });

  it("audio未供給(書き出し前等)でも sit-talk なら talk=true(所作フォールバック)", () => {
    const el = makeSpriteEl({
      actions: [{ t: 0, clip: "sit-talk", speed: 1 }],
      talks: [{ t: 0, audio: "assets/audio/vo-001.wav", gain: 1 }],
    });
    expect(talkDriver(el, 1, false)).toBe(true);
  });

  it("clip=idle・音声無し → talk=false", () => {
    const el = makeSpriteEl({ actions: [{ t: 0, clip: "idle", speed: 1 }] });
    expect(talkDriver(el, 1, false)).toBe(false);
  });
});
