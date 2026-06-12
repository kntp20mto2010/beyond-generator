import { describe, expect, it } from "vitest";
import { toJson, parseProject } from "../../io/serialize.js";
import {
  createEmptyProject,
  createEmptyScene,
  ProjectDocSchema,
  SceneDocSchema,
  type CharacterElement,
  type TextElement,
} from "./project.js";

function buildPopulatedProject() {
  const doc = createEmptyProject();
  const scene = createEmptyScene(0);
  scene.background = { color: "#88aaff" };
  scene.duration = 6;

  const charEl: CharacterElement = {
    id: "el-char",
    kind: "character",
    ref: "builtin:template-a",
    transform: { x: 960, y: 700, scale: 0.9, flipX: true },
    z: 0,
    enter: { type: "slideL", delay: 0.2, dur: 0.5 },
    exit: { type: "fade", at: 5.2, dur: 0.3 },
    actions: [
      { t: 0, clip: "idle", speed: 1 },
      { t: 1.5, clip: "wave", speed: 1.2 },
    ],
    expressions: [
      { t: 0, preset: "neutral" },
      { t: 2, preset: "smile" },
    ],
  };
  const textEl: TextElement = {
    id: "el-text",
    kind: "text",
    text: "こんにちは",
    size: 64,
    color: "#2E2A33",
    strokeColor: "#ffffff",
    strokeWidth: 8,
    transform: { x: 960, y: 200, scale: 1, flipX: false },
    z: 100,
    enter: { type: "pop", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
  };
  scene.elements = [charEl, textEl];
  doc.scenes.push(scene);
  return doc;
}

describe("project schema: 要素入りシーンの round-trip", () => {
  it("toJson + parseProject で deep equal を返す", () => {
    const doc = buildPopulatedProject();
    const parsed = parseProject(toJson(doc));
    expect(parsed).toEqual(doc);
  });

  it("character / text 要素が discriminatedUnion で復元される", () => {
    const doc = buildPopulatedProject();
    const parsed = parseProject(toJson(doc));
    const els = parsed.scenes[0]?.elements ?? [];
    expect(els[0]?.kind).toBe("character");
    expect(els[1]?.kind).toBe("text");
  });

  it("要素の未知フィールドが保持される", () => {
    const doc = buildPopulatedProject();
    (doc.scenes[0]!.elements[0] as Record<string, unknown>)["x_future"] = 42;
    const parsed = parseProject(toJson(doc));
    const el = parsed.scenes[0]?.elements[0] as Record<string, unknown>;
    expect(el["x_future"]).toBe(42);
  });
});

describe("project schema: 旧形式の互換", () => {
  it("elements / background 無しのシーンが default で開ける", () => {
    const legacy = {
      id: "old-scene",
      duration: 4,
      durationMode: "manual",
      seed: 3,
      // background / camera / elements を省略
    };
    const parsed = SceneDocSchema.parse(legacy);
    expect(parsed.background).toBe(null);
    expect(parsed.elements).toEqual([]);
    expect(parsed.camera).toEqual([]);
  });

  it("旧プロジェクト(scenesが旧形式)がそのまま開ける", () => {
    const legacy = {
      formatVersion: 1,
      id: "p",
      title: "旧",
      stage: { w: 1920, h: 1080, fps: 30 },
      bgm: [],
      scenes: [{ id: "s", duration: 4, durationMode: "manual", seed: 0 }],
    };
    const parsed = ProjectDocSchema.parse(legacy);
    expect(parsed.scenes[0]?.elements).toEqual([]);
  });
});

describe("project schema: 効果/transform の default", () => {
  it("enter / exit / transform の必須でないフィールドが補完される", () => {
    const el = {
      id: "e",
      kind: "character",
      ref: "builtin:template-a",
      transform: { x: 1, y: 2 },
      enter: {},
      exit: {},
    };
    const scene = SceneDocSchema.parse({
      id: "s",
      duration: 4,
      durationMode: "manual",
      seed: 0,
      elements: [el],
    });
    const parsed = scene.elements[0];
    if (parsed?.kind !== "character") throw new Error("expected character");
    expect(parsed.transform.scale).toBe(1);
    expect(parsed.transform.flipX).toBe(false);
    expect(parsed.enter.type).toBe("cut");
    expect(parsed.enter.dur).toBe(0.4);
    expect(parsed.exit.at).toBe(null);
    expect(parsed.z).toBe(0);
  });
});
