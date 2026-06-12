import { describe, expect, it } from "vitest";
import type { CharacterElement, SceneDoc } from "../core/schema/project.js";
import { createEmptyProject, createEmptyScene } from "../core/schema/project.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import { evaluateScene, type AudioEnvelopeLookup, type CharResolver } from "./scene-eval.js";
import { resolveFace } from "./expression.js";

const resolver: CharResolver = {
  getCharacter: (ref) => (ref === "builtin:template-a" ? TEMPLATE_A : undefined),
};

function makeCharEl(over: Partial<CharacterElement> = {}): CharacterElement {
  return {
    id: "c1",
    kind: "character",
    ref: "builtin:template-a",
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
  scene.duration = 6;
  scene.elements = [el];
  return { project, scene };
}

// 評価結果から mouth スロットの shapes 参照を取り出す
function mouthShapes(project: ReturnType<typeof createEmptyProject>, scene: SceneDoc, t: number, audio?: AudioEnvelopeLookup) {
  const frame = evaluateScene(project, scene, t, resolver, audio ? { audio } : undefined);
  const item = frame.find((f) => f.elementId === "c1");
  if (!item || item.payload.kind !== "character") throw new Error("character payload missing");
  const mouth = item.payload.items.find((i) => i.key === "face:mouth");
  if (!mouth) throw new Error("mouth render item missing");
  return mouth.shapes;
}

describe("評価器の音声リップフラップ", () => {
  // duration=1s, フレーム0は開・フレーム1以降は閉のエンベロープを返すスタブ
  const audio: AudioEnvelopeLookup = {
    lookup: (path) =>
      path === "assets/audio/vo-001.wav"
        ? { envelope: Uint8Array.from([1, 0, 0, 0]), duration: 1 }
        : undefined,
  };

  it("talk区間内 envelope=1 → 口が open(表情の口と異なる)", () => {
    const el = makeCharEl({ talks: [{ t: 0, audio: "assets/audio/vo-001.wav", gain: 1 }] });
    const { project, scene } = sceneWith(el);
    // t=0 はフレーム0 → envelope=1 → open
    const openShapes = mouthShapes(project, scene, 0, audio);
    const neutralMouth = TEMPLATE_A.face["mouth"]!.shapes["open"];
    expect(openShapes).toEqual(neutralMouth);
  });

  it("talk区間内 envelope=0 → 表情の口(neutral)", () => {
    const el = makeCharEl({ talks: [{ t: 0, audio: "assets/audio/vo-001.wav", gain: 1 }] });
    const { project, scene } = sceneWith(el);
    // t=0.1s はフレーム3 → envelope=0 → neutral の口
    const shapes = mouthShapes(project, scene, 0.1, audio);
    const neutralMouth = TEMPLATE_A.face["mouth"]!.shapes["neutral"];
    expect(shapes).toEqual(neutralMouth);
  });

  it("talk区間外 → 表情の口(audio未指定時と同じ)", () => {
    const el = makeCharEl({ talks: [{ t: 0, audio: "assets/audio/vo-001.wav", gain: 1 }] });
    const { project, scene } = sceneWith(el);
    // t=2s は duration(1s)を超え区間外 → neutral
    const shapes = mouthShapes(project, scene, 2, audio);
    const withoutAudio = mouthShapes(project, scene, 2);
    expect(shapes).toEqual(withoutAudio);
  });

  it("audioオプション無し → エンベロープを使わず表情の口", () => {
    const el = makeCharEl({
      talks: [{ t: 0, audio: "assets/audio/vo-001.wav", gain: 1 }],
      expressions: [{ t: 0, preset: "smile" }],
    });
    const { project, scene } = sceneWith(el);
    const shapes = mouthShapes(project, scene, 0); // audio無し
    const smileMouth = TEMPLATE_A.face["mouth"]!.shapes["smile"];
    expect(shapes).toEqual(smileMouth);
  });

  it("resolveFace: mouthOverride は表情プリセットの口(openSmile)を置き換える", () => {
    const base = resolveFace(TEMPLATE_A, { preset: "laugh" });
    const overridden = resolveFace(TEMPLATE_A, { preset: "laugh", mouthOverride: "open" });
    expect(base.get("mouth")?.shapeName).toBe("openSmile");
    expect(overridden.get("mouth")?.shapeName).toBe("open");
    // 目(blink非依存)は変わらない
    expect(overridden.get("eyeL")?.shapeName).toBe(base.get("eyeL")?.shapeName);
  });
});
