import { describe, expect, it } from "vitest";
import type {
  CharacterElement,
  ProjectDoc,
  SceneDoc,
  TextElement,
} from "../core/schema/project.js";
import { createEmptyProject, createEmptyScene } from "../core/schema/project.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import { CLIPS } from "../presets/clips/index.js";
import { sampleClip } from "./clip-player.js";
import {
  evaluateActionTrack,
  evaluateEffect,
  evaluateScene,
  type CharResolver,
} from "./scene-eval.js";

const resolver: CharResolver = {
  getCharacter: (ref) => (ref === "builtin:template-a" ? TEMPLATE_A : undefined),
};

function makeCharEl(over: Partial<CharacterElement> = {}): CharacterElement {
  return {
    id: over.id ?? "c1",
    kind: "character",
    ref: "builtin:template-a",
    transform: { x: 960, y: 700, scale: 0.9, flipX: false },
    z: 0,
    enter: { type: "cut", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
    actions: [],
    expressions: [],
    ...over,
  };
}

function sceneWith(elements: SceneDoc["elements"], seed = 5): { project: ProjectDoc; scene: SceneDoc } {
  const project = createEmptyProject();
  const scene = createEmptyScene(seed);
  scene.duration = 6;
  scene.elements = elements;
  project.scenes.push(scene);
  return { project, scene };
}

// ---------------------------------------------------------------------------
// evaluateActionTrack
// ---------------------------------------------------------------------------

describe("evaluateActionTrack", () => {
  it("アクションが無ければ暗黙の idle を再生する", () => {
    const frame = evaluateActionTrack([], 0.3);
    const idle = sampleClip(CLIPS["idle"]!, 0.3);
    expect(frame.pose.rotations?.torso ?? 0).toBeCloseTo(idle.pose.rotations?.torso ?? 0, 5);
  });

  it("純関数: 同入力で同出力", () => {
    const actions = [{ t: 0.5, clip: "wave", speed: 1 }];
    const a = evaluateActionTrack(actions, 1.0);
    const b = evaluateActionTrack(actions, 1.0);
    expect(a).toEqual(b);
  });

  it("active アクションのローカル時刻に speed が掛かる", () => {
    const actions = [{ t: 1.0, clip: "wave", speed: 2 }];
    const frame = evaluateActionTrack(actions, 1.5); // local = (1.5-1.0)*2 = 1.0
    const expected = sampleClip(CLIPS["wave"]!, 1.0);
    expect(frame.pose.rotations?.upperArmL ?? 0).toBeCloseTo(
      expected.pose.rotations?.upperArmL ?? 0,
      5,
    );
  });

  it("クロスフェード窓を越えた後は active クリップに一致(暗黙idle→wave)", () => {
    const actions = [{ t: 1.0, clip: "wave", speed: 1 }];
    const after = evaluateActionTrack(actions, 1.3); // 0.3 > 0.22
    const pure = sampleClip(CLIPS["wave"]!, 0.3);
    expect(after.pose.rotations?.upperArmL ?? 0).toBeCloseTo(
      pure.pose.rotations?.upperArmL ?? 0,
      5,
    );
  });

  it("アクション切替時の値が連続(クロスフェードでジャンプしない)", () => {
    const actions = [
      { t: 0, clip: "idle", speed: 1 },
      { t: 1.0, clip: "run", speed: 1 },
    ];
    let prev: number | null = null;
    for (let t = 0.9; t <= 1.25; t += 0.008) {
      const v = evaluateActionTrack(actions, t).pose.rotations?.thighL ?? 0;
      if (prev !== null) expect(Math.abs(v - prev)).toBeLessThan(8);
      prev = v;
    }
  });

  it("非ループクリップは最終姿勢を保持する", () => {
    const actions = [{ t: 0, clip: "point", speed: 1 }];
    const frame = evaluateActionTrack(actions, 10);
    expect(frame.pose.rotations?.upperArmL ?? 0).toBeCloseTo(-95, 0);
  });

  it("同時刻の複数アクションは配列順の後勝ち", () => {
    const actions = [
      { t: 0, clip: "idle", speed: 1 },
      { t: 1.0, clip: "wave", speed: 1 },
      { t: 1.0, clip: "point", speed: 1 },
    ];
    const frame = evaluateActionTrack(actions, 1.5);
    const point = sampleClip(CLIPS["point"]!, 0.5);
    expect(frame.pose.rotations?.upperArmL ?? 0).toBeCloseTo(
      point.pose.rotations?.upperArmL ?? 0,
      5,
    );
  });

  it("明示的な t=0 アクションは暗黙idleより優先", () => {
    const actions = [{ t: 0, clip: "run", speed: 1 }];
    const frame = evaluateActionTrack(actions, 0.5);
    const run = sampleClip(CLIPS["run"]!, 0.5);
    expect(frame.pose.rotations?.thighL ?? 0).toBeCloseTo(run.pose.rotations?.thighL ?? 0, 5);
  });
});

// ---------------------------------------------------------------------------
// evaluateEffect
// ---------------------------------------------------------------------------

describe("evaluateEffect", () => {
  const enterCut = { type: "cut" as const, delay: 0, dur: 0.4 };
  const exitNone = { type: "cut" as const, at: null, dur: 0.4 };

  it("delay前は不可視", () => {
    const v = evaluateEffect({ type: "fade", delay: 1, dur: 0.4 }, exitNone, 6, 0.5);
    expect(v.visible).toBe(false);
  });

  it("exit(cut)はちょうどexit.atで消える", () => {
    const exit = { type: "cut" as const, at: 3, dur: 0.4 };
    expect(evaluateEffect(enterCut, exit, 6, 2.99).visible).toBe(true);
    expect(evaluateEffect(enterCut, exit, 6, 3).visible).toBe(false);
  });

  it("fade enter: alpha = p", () => {
    const enter = { type: "fade" as const, delay: 0, dur: 0.4 };
    expect(evaluateEffect(enter, exitNone, 6, 0).alpha).toBeCloseTo(0, 3);
    expect(evaluateEffect(enter, exitNone, 6, 0.2).alpha).toBeCloseTo(0.5, 3);
    expect(evaluateEffect(enter, exitNone, 6, 0.4).alpha).toBeCloseTo(1, 3);
  });

  it("slideL enter: offset.x が負から0へ収束", () => {
    const enter = { type: "slideL" as const, delay: 0, dur: 0.4 };
    const start = evaluateEffect(enter, exitNone, 6, 0);
    expect(start.offset[0]).toBeLessThan(0);
    const end = evaluateEffect(enter, exitNone, 6, 0.4);
    expect(end.offset[0]).toBeCloseTo(0, 3);
  });

  it("pop enter: scaleMul が backOut(オーバーシュート)", () => {
    const enter = { type: "pop" as const, delay: 0, dur: 0.4 };
    expect(evaluateEffect(enter, exitNone, 6, 0).scaleMul).toBeCloseTo(0, 2);
    // backOutは途中で1を超える
    let over = false;
    for (let t = 0; t <= 0.4; t += 0.02) {
      if (evaluateEffect(enter, exitNone, 6, t).scaleMul > 1.01) over = true;
    }
    expect(over).toBe(true);
    expect(evaluateEffect(enter, exitNone, 6, 0.4).scaleMul).toBeCloseTo(1, 2);
  });

  it("fade exit: alpha = 1-q、窓末で不可視", () => {
    const exit = { type: "fade" as const, at: 3, dur: 0.4 };
    expect(evaluateEffect(enterCut, exit, 6, 3).alpha).toBeCloseTo(1, 3);
    expect(evaluateEffect(enterCut, exit, 6, 3.2).alpha).toBeCloseTo(0.5, 3);
    expect(evaluateEffect(enterCut, exit, 6, 3.4).visible).toBe(false);
  });

  it("exit.at=null はシーン末まで可視", () => {
    expect(evaluateEffect(enterCut, exitNone, 6, 100).visible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluateScene
// ---------------------------------------------------------------------------

describe("evaluateScene", () => {
  it("z昇順で返る", () => {
    const text: TextElement = {
      id: "t1",
      kind: "text",
      text: "hi",
      size: 48,
      color: "#000",
      strokeColor: null,
      strokeWidth: 6,
      transform: { x: 0, y: 0, scale: 1, flipX: false },
      z: 5,
      enter: { type: "cut", delay: 0, dur: 0.4 },
      exit: { type: "cut", at: null, dur: 0.4 },
    };
    const char = makeCharEl({ id: "c1", z: 50 });
    const { project, scene } = sceneWith([text, char]);
    const frame = evaluateScene(project, scene, 1, resolver);
    expect(frame.map((f) => f.elementId)).toEqual(["t1", "c1"]);
    expect(frame[0]!.z).toBeLessThan(frame[1]!.z);
  });

  it("表情キーは t<=t の最後を選ぶ", () => {
    const char = makeCharEl({
      expressions: [
        { t: 0, preset: "neutral" },
        { t: 2, preset: "smile" },
      ],
    });
    const { project, scene } = sceneWith([char]);
    const at1 = evaluateScene(project, scene, 1, resolver)[0]!;
    const at3 = evaluateScene(project, scene, 3, resolver)[0]!;
    if (at1.payload.kind !== "character" || at3.payload.kind !== "character") {
      throw new Error("expected character payload");
    }
    const mouth1 = at1.payload.items.find((i) => i.key === "face:mouth");
    const mouth3 = at3.payload.items.find((i) => i.key === "face:mouth");
    // neutral と smile で口形状の参照が変わる
    expect(mouth1!.shapes).not.toBe(mouth3!.shapes);
  });

  it("まばたき決定論: 同seed/同tで同結果", () => {
    const char = makeCharEl();
    const { project, scene } = sceneWith([char], 9);
    const a = evaluateScene(project, scene, 1.234, resolver)[0]!;
    const b = evaluateScene(project, scene, 1.234, resolver)[0]!;
    if (a.payload.kind !== "character" || b.payload.kind !== "character") {
      throw new Error("expected character payload");
    }
    const eyeA = a.payload.items.find((i) => i.key === "face:eyeL");
    const eyeB = b.payload.items.find((i) => i.key === "face:eyeL");
    expect(eyeA!.matrix).toEqual(eyeB!.matrix);
  });

  it("未解決キャラは placeholder ペイロードになる", () => {
    const char = makeCharEl({ ref: "characters/missing.byc.json" });
    const { project, scene } = sceneWith([char]);
    const frame = evaluateScene(project, scene, 1, resolver);
    expect(frame[0]!.payload.kind).toBe("placeholder");
  });

  it("不可視要素はフレームに含まれない", () => {
    const char = makeCharEl({ enter: { type: "fade", delay: 2, dur: 0.4 } });
    const { project, scene } = sceneWith([char]);
    expect(evaluateScene(project, scene, 0.5, resolver)).toHaveLength(0);
  });
});
