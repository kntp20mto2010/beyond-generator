import { describe, expect, it } from "vitest";
import { toJson, parseProject } from "../../io/serialize.js";
import {
  createEmptyProject,
  createEmptyScene,
  ProjectDocSchema,
  SceneDocSchema,
  type BalloonElement,
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
    locked: false,
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
    talks: [
      { t: 0.5, audio: "assets/audio/vo-001.wav", gain: 1 },
      { t: 3, audio: "assets/audio/vo-002.wav", gain: 0.8 },
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
    locked: false,
    enter: { type: "pop", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
  };
  scene.elements = [charEl, textEl];
  doc.scenes.push(scene);
  return doc;
}

function buildProjectWithCameraAndMove() {
  const doc = createEmptyProject();
  const scene = createEmptyScene(0);
  scene.duration = 6;
  scene.camera = [
    { t: 0, x: 960, y: 540, zoom: 1, ease: "quadInOut" },
    { t: 3, x: 600, y: 400, zoom: 1.8 },
  ];
  scene.transition = { type: "wipe", dur: 0.7 };
  const charEl: CharacterElement = {
    id: "mover",
    kind: "character",
    ref: "builtin:template-a",
    transform: { x: 200, y: 700, scale: 0.9, flipX: false },
    z: 0,
    locked: false,
    enter: { type: "cut", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
    actions: [{ t: 0, clip: "walk", speed: 1, moveTo: { x: 1400, y: 720 } }],
    expressions: [],
    talks: [],
  };
  scene.elements = [charEl];
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

describe("project schema: camera / transition / moveTo の round-trip", () => {
  it("toJson + parseProject で deep equal を返す", () => {
    const doc = buildProjectWithCameraAndMove();
    const parsed = parseProject(toJson(doc));
    expect(parsed).toEqual(doc);
  });

  it("camera キー・transition・moveTo が復元される", () => {
    const doc = buildProjectWithCameraAndMove();
    const parsed = parseProject(toJson(doc));
    const s = parsed.scenes[0]!;
    expect(s.camera).toHaveLength(2);
    expect(s.camera[1]?.zoom).toBe(1.8);
    expect(s.transition.type).toBe("wipe");
    const el = s.elements[0];
    if (el?.kind !== "character") throw new Error("expected character");
    expect(el.actions[0]?.moveTo).toEqual({ x: 1400, y: 720 });
  });

  it("moveTo の y 省略形が保持される", () => {
    const doc = buildProjectWithCameraAndMove();
    const el = doc.scenes[0]!.elements[0];
    if (el?.kind !== "character") throw new Error("expected character");
    el.actions[0]!.moveTo = { x: 500 };
    const parsed = parseProject(toJson(doc));
    const pel = parsed.scenes[0]?.elements[0];
    if (pel?.kind !== "character") throw new Error("expected character");
    expect(pel.actions[0]?.moveTo).toEqual({ x: 500 });
  });
});

describe("project schema: camera/transition の旧形式互換", () => {
  it("camera/transition/moveTo 無しのシーンが default で開ける", () => {
    const legacy = {
      id: "old-scene",
      duration: 4,
      durationMode: "manual",
      seed: 3,
      elements: [
        {
          id: "c",
          kind: "character",
          ref: "builtin:template-a",
          transform: { x: 1, y: 2 },
          actions: [{ t: 0, clip: "idle" }], // moveTo無し
        },
      ],
      // camera / transition を省略
    };
    const parsed = SceneDocSchema.parse(legacy);
    expect(parsed.camera).toEqual([]);
    expect(parsed.transition).toEqual({ type: "cut", dur: 0.5 });
    const el = parsed.elements[0];
    if (el?.kind !== "character") throw new Error("expected character");
    expect(el.actions[0]?.moveTo).toBeUndefined();
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

describe("project schema: balloon 要素", () => {
  function buildBalloonProject() {
    const doc = createEmptyProject();
    const scene = createEmptyScene(0);
    scene.duration = 6;
    const balloon: BalloonElement = {
      id: "b1",
      kind: "balloon",
      shape: "cloud",
      text: "やあ",
      size: 44,
      w: 480,
      h: 260,
      fill: "#ffffff",
      textColor: "#2E2A33",
      lineColor: "#333333",
      lineWidth: 5,
      tail: { x: -80, y: 200 },
      transform: { x: 620, y: 300, scale: 1, flipX: false },
      z: 200,
      locked: false,
      enter: { type: "pop", delay: 0, dur: 0.4 },
      exit: { type: "cut", at: null, dur: 0.4 },
    };
    scene.elements = [balloon];
    doc.scenes.push(scene);
    return doc;
  }

  it("balloon 入りシーンが round-trip で deep equal", () => {
    const doc = buildBalloonProject();
    const parsed = parseProject(toJson(doc));
    expect(parsed).toEqual(doc);
  });

  it("balloon が discriminatedUnion で復元される", () => {
    const doc = buildBalloonProject();
    const parsed = parseProject(toJson(doc));
    const el = parsed.scenes[0]?.elements[0];
    expect(el?.kind).toBe("balloon");
    if (el?.kind !== "balloon") throw new Error("expected balloon");
    expect(el.shape).toBe("cloud");
    expect(el.tail).toEqual({ x: -80, y: 200 });
  });

  it("balloon の省略フィールドが default で補完される", () => {
    const scene = SceneDocSchema.parse({
      id: "s",
      duration: 4,
      durationMode: "manual",
      seed: 0,
      elements: [{ id: "b", kind: "balloon", text: "hi", transform: { x: 1, y: 2 } }],
    });
    const el = scene.elements[0];
    if (el?.kind !== "balloon") throw new Error("expected balloon");
    expect(el.shape).toBe("round");
    expect(el.w).toBe(420);
    expect(el.h).toBe(240);
    expect(el.size).toBe(40);
    expect(el.tail).toEqual({ x: -60, y: 220 });
    expect(el.z).toBe(200);
    expect(el.locked).toBe(false);
  });
});

describe("project schema: locked 省略の旧ファイル", () => {
  it("locked 無しの character / text が default false で開ける", () => {
    const scene = SceneDocSchema.parse({
      id: "s",
      duration: 4,
      durationMode: "manual",
      seed: 0,
      elements: [
        { id: "c", kind: "character", ref: "builtin:template-a", transform: { x: 1, y: 2 } },
        { id: "t", kind: "text", text: "hi", transform: { x: 3, y: 4 } },
      ],
    });
    const c = scene.elements[0];
    const t = scene.elements[1];
    expect(c?.locked).toBe(false);
    expect(t?.locked).toBe(false);
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

describe("project schema: talks / bgm", () => {
  it("talks 無しの旧キャラが default [] で開ける", () => {
    const scene = SceneDocSchema.parse({
      id: "s",
      duration: 4,
      durationMode: "manual",
      seed: 0,
      elements: [
        { id: "c", kind: "character", ref: "builtin:template-a", transform: { x: 1, y: 2 } },
      ],
    });
    const c = scene.elements[0];
    if (c?.kind !== "character") throw new Error("expected character");
    expect(c.talks).toEqual([]);
  });

  it("bgm が空配列の旧ファイルがそのまま開ける", () => {
    const doc = parseProject(toJson(createEmptyProject()));
    expect(doc.bgm).toEqual([]);
  });

  it("talks / bgm 入りプロジェクトが round-trip で deep equal", () => {
    const doc = createEmptyProject();
    doc.bgm = [{ audio: "assets/audio/bgm.mp3", gain: 0.4, loop: true }];
    const scene = createEmptyScene(0);
    scene.elements = [
      {
        id: "c",
        kind: "character",
        ref: "builtin:template-a",
        transform: { x: 960, y: 700, scale: 0.9, flipX: false },
        z: 0,
        locked: false,
        enter: { type: "cut", delay: 0, dur: 0.4 },
        exit: { type: "cut", at: null, dur: 0.4 },
        actions: [],
        expressions: [],
        talks: [{ t: 1.2, audio: "assets/audio/vo-003.wav", gain: 0.9 }],
      },
    ];
    doc.scenes.push(scene);
    expect(parseProject(toJson(doc))).toEqual(doc);
  });

  it("BgmSchema の gain / loop が default 補完される", () => {
    const parsed = ProjectDocSchema.parse({
      formatVersion: 1,
      id: "p",
      title: "t",
      stage: { w: 1920, h: 1080, fps: 30 },
      bgm: [{ audio: "assets/audio/bgm.mp3" }],
      scenes: [],
    });
    expect(parsed.bgm[0]).toMatchObject({ audio: "assets/audio/bgm.mp3", gain: 0.5, loop: true });
  });
});
