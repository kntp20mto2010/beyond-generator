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
  evaluateCamera,
  evaluateCharMotion,
  evaluateEffect,
  evaluateScene,
  expandActions,
  type CharResolver,
} from "./scene-eval.js";
import type { Action, CameraKey } from "../core/schema/project.js";

const resolver: CharResolver = {
  getCharacter: (ref) => (ref === "builtin:template-a" ? TEMPLATE_A : undefined),
};

// moveTo無しの純ポーズ評価では origin は from/to に影響しない(任意値でよい)
const ORIGIN: [number, number] = [0, 0];

function makeCharEl(over: Partial<CharacterElement> = {}): CharacterElement {
  return {
    id: over.id ?? "c1",
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
    const frame = evaluateActionTrack(ORIGIN, [], 0.3);
    const idle = sampleClip(CLIPS["idle"]!, 0.3);
    expect(frame.pose.rotations?.torso ?? 0).toBeCloseTo(idle.pose.rotations?.torso ?? 0, 5);
  });

  it("純関数: 同入力で同出力", () => {
    const actions = [{ t: 0.5, clip: "wave", speed: 1 }];
    const a = evaluateActionTrack(ORIGIN, actions, 1.0);
    const b = evaluateActionTrack(ORIGIN, actions, 1.0);
    expect(a).toEqual(b);
  });

  it("active アクションのローカル時刻に speed が掛かる", () => {
    const actions = [{ t: 1.0, clip: "wave", speed: 2 }];
    const frame = evaluateActionTrack(ORIGIN, actions, 1.5); // local = (1.5-1.0)*2 = 1.0
    const expected = sampleClip(CLIPS["wave"]!, 1.0);
    expect(frame.pose.rotations?.upperArmL ?? 0).toBeCloseTo(
      expected.pose.rotations?.upperArmL ?? 0,
      5,
    );
  });

  it("クロスフェード窓を越えた後は active クリップに一致(暗黙idle→wave)", () => {
    const actions = [{ t: 1.0, clip: "wave", speed: 1 }];
    const after = evaluateActionTrack(ORIGIN, actions, 1.3); // 0.3 > 0.22
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
      const v = evaluateActionTrack(ORIGIN, actions, t).pose.rotations?.thighL ?? 0;
      if (prev !== null) expect(Math.abs(v - prev)).toBeLessThan(8);
      prev = v;
    }
  });

  it("非ループクリップは最終姿勢を保持する", () => {
    const actions = [{ t: 0, clip: "point", speed: 1 }];
    const frame = evaluateActionTrack(ORIGIN, actions, 10);
    expect(frame.pose.rotations?.upperArmL ?? 0).toBeCloseTo(-95, 0);
  });

  it("同時刻の複数アクションは配列順の後勝ち", () => {
    const actions = [
      { t: 0, clip: "idle", speed: 1 },
      { t: 1.0, clip: "wave", speed: 1 },
      { t: 1.0, clip: "point", speed: 1 },
    ];
    const frame = evaluateActionTrack(ORIGIN, actions, 1.5);
    const point = sampleClip(CLIPS["point"]!, 0.5);
    expect(frame.pose.rotations?.upperArmL ?? 0).toBeCloseTo(
      point.pose.rotations?.upperArmL ?? 0,
      5,
    );
  });

  it("明示的な t=0 アクションは暗黙idleより優先", () => {
    const actions = [{ t: 0, clip: "run", speed: 1 }];
    const frame = evaluateActionTrack(ORIGIN, actions, 0.5);
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
      locked: false,
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

  // ---- effective z (placement + Y による自動 z) -----------------------------

  it("床置きオブジェクトは Y が大きいほど手前 (前の row が高 z)", () => {
    const makeObj = (id: string, src: string, y: number, z = 0) => ({
      id,
      kind: "object" as const,
      src,
      cells: { w: 4, h: 3 },
      transform: { x: 960, y, scale: 1, flipX: false },
      z,
      locked: false,
      enter: { type: "cut", delay: 0, dur: 0 } as const,
      exit: { type: "cut", at: null, dur: 0 } as const,
    });
    // 同じ src(=同じ placement=floor)で奥/手前に置く
    const back = makeObj("back", "assets/objects/sakura-wardrobe-dimetric.png", 480);
    const front = makeObj("front", "assets/objects/sakura-wardrobe-dimetric.png", 960);
    // 配列順は back→front (自然描画なら back→front=front 手前)
    const { project, scene } = sceneWith([back, front]);
    const frame = evaluateScene(project, scene, 0, resolver);
    // ソート結果: 小→大 (奥→手前)。back が先、front が後。
    expect(frame.map((f) => f.elementId)).toEqual(["back", "front"]);
    expect(frame[0]!.z).toBe(480); // y=480 + z=0
    expect(frame[1]!.z).toBe(960);
    // 配列順を逆にしても同じ結果(自動 z が勝つ)
    const swapped = sceneWith([front, back]);
    const f2 = evaluateScene(swapped.project, swapped.scene, 0, resolver);
    expect(f2.map((f) => f.elementId)).toEqual(["back", "front"]);
  });

  it("壁掛けは最背面 (-10000 + z) で常に床置きより奥", () => {
    const wallItem = {
      id: "wall",
      kind: "object" as const,
      src: "assets/objects/sakura-window-curtain.png", // placement: wall
      cells: { w: 4, h: 3 },
      transform: { x: 960, y: 240, scale: 1, flipX: false },
      z: 100, // 大きい手動 z でも壁は奥
      locked: false,
      enter: { type: "cut", delay: 0, dur: 0 } as const,
      exit: { type: "cut", at: null, dur: 0 } as const,
    };
    const floorItem = {
      ...wallItem,
      id: "floor",
      src: "assets/objects/sakura-wardrobe-dimetric.png", // placement: floor
      transform: { x: 1200, y: 960, scale: 1, flipX: false },
      z: -50,
    };
    const { project, scene } = sceneWith([wallItem, floorItem]);
    const frame = evaluateScene(project, scene, 0, resolver);
    // 壁掛けは -10000+100=-9900、床は 960-50=910 → 壁が先
    expect(frame.map((f) => f.elementId)).toEqual(["wall", "floor"]);
    expect(frame[0]!.z).toBe(-9900);
    expect(frame[1]!.z).toBe(910);
  });

  it("text / balloon は el.z をそのまま使う (Y 加算しない)", () => {
    const text: TextElement = {
      id: "t1", kind: "text", text: "hi", size: 48, color: "#000",
      strokeColor: null, strokeWidth: 6,
      transform: { x: 0, y: 900, scale: 1, flipX: false },
      z: 500, locked: false,
      enter: { type: "cut", delay: 0, dur: 0 },
      exit: { type: "cut", at: null, dur: 0 },
    };
    const { project, scene } = sceneWith([text]);
    const frame = evaluateScene(project, scene, 0, resolver);
    expect(frame[0]!.z).toBe(500); // y は加算されない
  });
});

// ---------------------------------------------------------------------------
// expandActions / evaluateCharMotion(moveTo歩行移動)
// ---------------------------------------------------------------------------

describe("expandActions / evaluateCharMotion", () => {
  it("等速移動の中間位置(walk v=240, dist=240 → 1秒で到着)", () => {
    const el = makeCharEl({
      transform: { x: 0, y: 0, scale: 1, flipX: false },
      actions: [{ t: 0, clip: "walk", speed: 1, moveTo: { x: 240, y: 0 } }],
    });
    const at0 = evaluateCharMotion(el, 0);
    const at05 = evaluateCharMotion(el, 0.5);
    const at1 = evaluateCharMotion(el, 1);
    expect(at0.pos[0]).toBeCloseTo(0, 5);
    expect(at05.pos[0]).toBeCloseTo(120, 5);
    expect(at1.pos[0]).toBeCloseTo(240, 5);
    // 移動中は vel 非ゼロ、到着後ゼロ
    expect(at05.vel[0]).toBeCloseTo(240, 5);
    expect(evaluateCharMotion(el, 1.5).vel[0]).toBe(0);
  });

  it("到着後は to に静止し、暗黙idleがポーズに効く", () => {
    const el = makeCharEl({
      transform: { x: 0, y: 0, scale: 1, flipX: false },
      actions: [{ t: 0, clip: "walk", speed: 1, moveTo: { x: 240, y: 0 } }],
    });
    // 到着後の位置は固定
    expect(evaluateCharMotion(el, 3).pos[0]).toBeCloseTo(240, 5);
    // evaluateActionTrack: 到着(t=1)以降は暗黙idleのポーズ。十分後でidle相当
    const frame = evaluateActionTrack([0, 0], el.actions, 2.0);
    const idle = sampleClip(CLIPS["idle"]!, 0); // idle先頭(ループ周期内)
    // idleはループ。t=2 はidle開始から1秒 → idle(1秒)と一致を確認
    const idleAt = sampleClip(CLIPS["idle"]!, 2.0 - 1.0);
    expect(frame.pose.rotations?.torso ?? 0).toBeCloseTo(idleAt.pose.rotations?.torso ?? 0, 5);
    void idle;
  });

  it("打ち切り: 移動中に次アクション開始 → 位置が連続", () => {
    const el = makeCharEl({
      transform: { x: 0, y: 0, scale: 1, flipX: false },
      // 1秒で240まで歩く予定だが 0.5s で別アクション → 120で打ち切り
      actions: [
        { t: 0, clip: "walk", speed: 1, moveTo: { x: 240, y: 0 } },
        { t: 0.5, clip: "wave", speed: 1 },
      ],
    });
    const justBefore = evaluateCharMotion(el, 0.499);
    const justAfter = evaluateCharMotion(el, 0.501);
    // 境界で位置が連続(打ち切り点=120付近、両側でジャンプしない)
    expect(Math.abs(justAfter.pos[0] - justBefore.pos[0])).toBeLessThan(1);
    expect(justBefore.pos[0]).toBeCloseTo(119.76, 1);
    // 到達点(t=0.5)はちょうど120、打ち切り後は静止
    expect(evaluateCharMotion(el, 0.5).pos[0]).toBeCloseTo(120, 5);
    expect(evaluateCharMotion(el, 1.0).pos[0]).toBeCloseTo(120, 5);
  });

  it("facing: 左移動で-1、到着後も維持", () => {
    const el = makeCharEl({
      transform: { x: 500, y: 0, scale: 1, flipX: false },
      actions: [{ t: 0, clip: "walk", speed: 1, moveTo: { x: 260, y: 0 } }], // 左へ
    });
    expect(evaluateCharMotion(el, 0.5).facing).toBe(-1);
    // 到着後(dist=240→1秒)も向きは維持
    expect(evaluateCharMotion(el, 3).facing).toBe(-1);
  });

  it("移動が無ければ facing は transform.flipX 準拠", () => {
    const plain = makeCharEl({ transform: { x: 0, y: 0, scale: 1, flipX: false } });
    const flipped = makeCharEl({ transform: { x: 0, y: 0, scale: 1, flipX: true } });
    expect(evaluateCharMotion(plain, 1).facing).toBe(1);
    expect(evaluateCharMotion(flipped, 1).facing).toBe(-1);
  });

  it("virtualVelocity=0クリップ(idle)にmoveTo → 240でフォールバック", () => {
    const el = makeCharEl({
      transform: { x: 0, y: 0, scale: 1, flipX: false },
      actions: [{ t: 0, clip: "idle", speed: 1, moveTo: { x: 240, y: 0 } }],
    });
    // 240/240 = 1秒で到着。t=0.5 で半分
    expect(evaluateCharMotion(el, 0.5).pos[0]).toBeCloseTo(120, 5);
    expect(evaluateCharMotion(el, 1.0).pos[0]).toBeCloseTo(240, 5);
  });

  it("speed=2 で所要時間が半分", () => {
    const el = makeCharEl({
      transform: { x: 0, y: 0, scale: 1, flipX: false },
      actions: [{ t: 0, clip: "walk", speed: 2, moveTo: { x: 240, y: 0 } }],
    });
    // v=480 → 0.5秒で到着。t=0.25 で半分
    expect(evaluateCharMotion(el, 0.25).pos[0]).toBeCloseTo(120, 5);
    expect(evaluateCharMotion(el, 0.5).pos[0]).toBeCloseTo(240, 5);
    expect(evaluateCharMotion(el, 0.6).vel[0]).toBe(0);
  });

  it("y省略 = 開始時のyを維持(横移動)", () => {
    const el = makeCharEl({
      transform: { x: 0, y: 333, scale: 1, flipX: false },
      actions: [{ t: 0, clip: "walk", speed: 1, moveTo: { x: 240 } }],
    });
    const m = evaluateCharMotion(el, 0.5);
    expect(m.pos[1]).toBeCloseTo(333, 5);
  });

  it("moveTo無し要素は従来評価と完全一致(origin不変・位置=transform)", () => {
    const actions: Action[] = [
      { t: 0, clip: "idle", speed: 1 },
      { t: 1, clip: "wave", speed: 1 },
    ];
    const el = makeCharEl({
      transform: { x: 700, y: 400, scale: 1, flipX: false },
      actions,
    });
    // 位置は常に transform のまま
    expect(evaluateCharMotion(el, 2).pos).toEqual([700, 400]);
    // expandActions は to=from(移動なし)・travelEnd=t
    const exp = expandActions([700, 400], actions);
    for (const a of exp) {
      expect(a.to).toEqual(a.from);
      expect(a.travelEnd).toBe(a.t);
    }
  });

  it("到着idleが挿入される(移動後・次アクション無し)", () => {
    const exp = expandActions([0, 0], [
      { t: 0, clip: "walk", speed: 1, moveTo: { x: 240, y: 0 } },
    ]);
    // walk(移動) + 到着idle の2本
    expect(exp.length).toBe(2);
    expect(exp[1]!.clip).toBe("idle");
    expect(exp[1]!.t).toBeCloseTo(1.0, 5);
    expect(exp[1]!.from).toEqual([240, 0]);
  });
});

// ---------------------------------------------------------------------------
// evaluateCamera
// ---------------------------------------------------------------------------

describe("evaluateCamera", () => {
  it("キー無しはデフォルト(中心960,540 zoom1)", () => {
    expect(evaluateCamera([], 0)).toEqual({ x: 960, y: 540, zoom: 1 });
  });

  it("1キーは常にその値", () => {
    const keys: CameraKey[] = [{ t: 1, x: 100, y: 200, zoom: 2 }];
    expect(evaluateCamera(keys, 0)).toEqual({ x: 100, y: 200, zoom: 2 });
    expect(evaluateCamera(keys, 5)).toEqual({ x: 100, y: 200, zoom: 2 });
  });

  it("2キーの中間値(linearで中点)", () => {
    const keys: CameraKey[] = [
      { t: 0, x: 0, y: 0, zoom: 1, ease: "linear" },
      { t: 2, x: 200, y: 100, zoom: 3, ease: "linear" },
    ];
    const mid = evaluateCamera(keys, 1);
    expect(mid.x).toBeCloseTo(100, 5);
    expect(mid.y).toBeCloseTo(50, 5);
    expect(mid.zoom).toBeCloseTo(2, 5);
  });

  it("ease指定(quadIn)で中点は線形未満", () => {
    const keys: CameraKey[] = [
      { t: 0, x: 0, y: 0, zoom: 1, ease: "quadIn" },
      { t: 2, x: 200, y: 0, zoom: 1 },
    ];
    // quadIn(0.5)=0.25 → x=50
    expect(evaluateCamera(keys, 1).x).toBeCloseTo(50, 5);
  });

  it("範囲外はクランプ(最初/最後の値)", () => {
    const keys: CameraKey[] = [
      { t: 1, x: 10, y: 0, zoom: 1 },
      { t: 3, x: 90, y: 0, zoom: 1 },
    ];
    expect(evaluateCamera(keys, 0).x).toBe(10);
    expect(evaluateCamera(keys, 10).x).toBe(90);
  });

  it("未ソート入力でも正しく評価", () => {
    const keys: CameraKey[] = [
      { t: 2, x: 200, y: 0, zoom: 1, ease: "linear" },
      { t: 0, x: 0, y: 0, zoom: 1, ease: "linear" },
    ];
    expect(evaluateCamera(keys, 1).x).toBeCloseTo(100, 5);
  });
});
