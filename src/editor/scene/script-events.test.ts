import { describe, expect, it } from "vitest";
import { buildScriptEvents, type ScriptEvent } from "./script-events.js";
import type { ProjectDoc, SceneDoc } from "../../core/schema/project.js";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

function makeProject(scenes: SceneDoc[]): ProjectDoc {
  return {
    formatVersion: 1,
    id: "proj-1",
    title: "テスト",
    stage: { w: 1920, h: 1080, fps: 30 },
    bgm: [],
    scenes,
  };
}

function makeScene(overrides: Partial<SceneDoc> = {}): SceneDoc {
  return {
    id: "scene-1",
    duration: 5.0,
    durationMode: "manual",
    background: null,
    camera: [],
    transition: { type: "cut", dur: 0.5 },
    elements: [],
    seed: 0,
    ...overrides,
  };
}

function charElement(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: "character" as const,
    ref: "builtin:template-a",
    transform: { x: 960, y: 700, scale: 1, flipX: false },
    z: 0,
    locked: false,
    enter: { type: "cut" as const, delay: 0, dur: 0.4 },
    exit: { type: "cut" as const, at: null, dur: 0.4 },
    actions: [] as Array<{ t: number; clip: string; speed: number; moveTo?: { x: number; y?: number } }>,
    expressions: [] as Array<{ t: number; preset: string }>,
    ...overrides,
  };
}

function balloonElement(id: string, text: string, delay = 0) {
  return {
    id,
    kind: "balloon" as const,
    shape: "round" as const,
    text,
    size: 40,
    w: 420,
    h: 240,
    fill: "#fff",
    textColor: "#000",
    lineColor: "#000",
    lineWidth: 4,
    tail: { x: -60, y: 220 },
    transform: { x: 600, y: 300, scale: 1, flipX: false },
    z: 200,
    locked: false,
    enter: { type: "cut" as const, delay, dur: 0.4 },
    exit: { type: "cut" as const, at: null, dur: 0.4 },
  };
}

// ---------------------------------------------------------------------------
// t昇順
// ---------------------------------------------------------------------------

describe("buildScriptEvents: t昇順ソート", () => {
  it("複数イベントが t 昇順で並ぶ", () => {
    const scene = makeScene({
      elements: [
        charElement("el1", {
          actions: [{ t: 2.5, clip: "walk", speed: 1 }],
          expressions: [{ t: 1.2, preset: "smile" }],
        }),
      ],
      camera: [{ t: 0.5, x: 960, y: 540, zoom: 1 }],
    });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);

    const ts = events.map((e) => e.t);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]!);
    }
  });
});

// ---------------------------------------------------------------------------
// 同t内の種別順
// ---------------------------------------------------------------------------

describe("buildScriptEvents: 同t種別順", () => {
  it("同 t では enter < dialogue < action < expression < camera", () => {
    const t = 1.0;
    const scene = makeScene({
      elements: [
        {
          ...charElement("char1", {
            enter: { type: "fade" as const, delay: t, dur: 0.4 },
            actions: [{ t, clip: "idle", speed: 1 }],
            expressions: [{ t, preset: "smile" }],
          }),
        },
        balloonElement("b1", "こんにちは", t),
      ],
      camera: [{ t, x: 960, y: 540, zoom: 1.5 }],
    });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);

    const atT = events.filter((e) => Math.abs(e.t - t) < 1e-9);
    const kinds = atT.map((e) => e.kind);

    // enter の前に dialogue は来ない
    const enterIdx = kinds.findIndex((k) => k === "enter");
    const dialogueIdx = kinds.findIndex((k) => k === "dialogue");
    const actionIdx = kinds.findIndex((k) => k === "action");
    const expressionIdx = kinds.findIndex((k) => k === "expression");
    const cameraIdx = kinds.findIndex((k) => k === "camera");

    expect(enterIdx).toBeLessThan(dialogueIdx);
    expect(dialogueIdx).toBeLessThan(actionIdx);
    expect(actionIdx).toBeLessThan(expressionIdx);
    expect(expressionIdx).toBeLessThan(cameraIdx);
  });
});

// ---------------------------------------------------------------------------
// cut登場は行なし
// ---------------------------------------------------------------------------

describe("buildScriptEvents: cut登場の除外", () => {
  it("enter.type=cut かつ delay=0 のキャラは enter 行を出さない", () => {
    const scene = makeScene({
      elements: [
        charElement("el1"), // default: type=cut, delay=0
      ],
    });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);
    const enterEvents = events.filter((e) => e.kind === "enter");
    expect(enterEvents).toHaveLength(0);
  });

  it("enter.type=fade なら enter 行を出す", () => {
    const scene = makeScene({
      elements: [
        charElement("el1", {
          enter: { type: "fade" as const, delay: 0, dur: 0.4 },
        }),
      ],
    });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);
    const enterEvents = events.filter((e) => e.kind === "enter");
    expect(enterEvents).toHaveLength(1);
  });

  it("enter.delay>0 なら type=cut でも enter 行を出す", () => {
    const scene = makeScene({
      elements: [
        charElement("el1", {
          enter: { type: "cut" as const, delay: 1.5, dur: 0.4 },
        }),
      ],
    });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);
    const enterEvents = events.filter((e) => e.kind === "enter");
    expect(enterEvents).toHaveLength(1);
    expect(enterEvents[0]!.t).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// dialogue の本文と t
// ---------------------------------------------------------------------------

describe("buildScriptEvents: dialogue", () => {
  it("balloon は dialogue 行を出し、text は enter.delay を t に使う", () => {
    const scene = makeScene({
      elements: [
        balloonElement("b1", "おはよう!", 0.8),
      ],
    });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);
    const dialogues = events.filter((e): e is Extract<ScriptEvent, { kind: "dialogue" }> => e.kind === "dialogue");
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0]!.text).toBe("おはよう!");
    expect(dialogues[0]!.t).toBe(0.8);
    expect(dialogues[0]!.elementId).toBe("b1");
  });
});

// ---------------------------------------------------------------------------
// moveTo 付きアクション
// ---------------------------------------------------------------------------

describe("buildScriptEvents: moveTo付きアクション", () => {
  it("moveTo.x が moveToX として含まれる", () => {
    const scene = makeScene({
      elements: [
        charElement("el1", {
          actions: [{ t: 0, clip: "walk", speed: 1, moveTo: { x: 1500, y: 700 } }],
        }),
      ],
    });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);
    const actionEvents = events.filter(
      (e): e is Extract<ScriptEvent, { kind: "action" }> => e.kind === "action",
    );
    expect(actionEvents).toHaveLength(1);
    expect(actionEvents[0]!.moveToX).toBe(1500);
  });

  it("moveTo なしのアクションは moveToX が undefined", () => {
    const scene = makeScene({
      elements: [
        charElement("el1", {
          actions: [{ t: 0, clip: "idle", speed: 1 }],
        }),
      ],
    });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);
    const actionEvents = events.filter(
      (e): e is Extract<ScriptEvent, { kind: "action" }> => e.kind === "action",
    );
    expect(actionEvents[0]!.moveToX).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// transition 行
// ---------------------------------------------------------------------------

describe("buildScriptEvents: transition行", () => {
  it("nextScene.transition.type=fade なら transition 行を追加", () => {
    const scene = makeScene({ id: "s1", duration: 4.0 });
    const nextScene = makeScene({ id: "s2", transition: { type: "fade" as const, dur: 0.5 } });
    const proj = makeProject([scene, nextScene]);
    const events = buildScriptEvents(proj, scene, nextScene);
    const transEvents = events.filter(
      (e): e is Extract<ScriptEvent, { kind: "transition" }> => e.kind === "transition",
    );
    expect(transEvents).toHaveLength(1);
    expect(transEvents[0]!.t).toBe(4.0);
    expect(transEvents[0]!.type).toBe("fade");
    expect(transEvents[0]!.dur).toBe(0.5);
  });

  it("nextScene.transition.type=cut は transition 行なし", () => {
    const scene = makeScene({ id: "s1" });
    const nextScene = makeScene({ id: "s2", transition: { type: "cut" as const, dur: 0 } });
    const proj = makeProject([scene, nextScene]);
    const events = buildScriptEvents(proj, scene, nextScene);
    const transEvents = events.filter((e) => e.kind === "transition");
    expect(transEvents).toHaveLength(0);
  });

  it("nextScene が null なら transition 行なし", () => {
    const scene = makeScene({ id: "s1" });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);
    const transEvents = events.filter((e) => e.kind === "transition");
    expect(transEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// カメラ行
// ---------------------------------------------------------------------------

describe("buildScriptEvents: カメラ行", () => {
  it("カメラキーがあれば camera 行が出る", () => {
    const scene = makeScene({
      camera: [
        { t: 0, x: 960, y: 540, zoom: 1 },
        { t: 2.0, x: 800, y: 400, zoom: 2 },
      ],
    });
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);
    const camEvents = events.filter(
      (e): e is Extract<ScriptEvent, { kind: "camera" }> => e.kind === "camera",
    );
    expect(camEvents).toHaveLength(2);
    expect(camEvents[0]!.zoom).toBe(1);
    expect(camEvents[0]!.index).toBe(0);
    expect(camEvents[1]!.zoom).toBe(2);
    expect(camEvents[1]!.index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 空シーン
// ---------------------------------------------------------------------------

describe("buildScriptEvents: 空シーン", () => {
  it("要素・カメラなしなら空配列", () => {
    const scene = makeScene();
    const proj = makeProject([scene]);
    const events = buildScriptEvents(proj, scene, null);
    expect(events).toHaveLength(0);
  });
});
