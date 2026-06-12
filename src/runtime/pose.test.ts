import { describe, expect, it } from "vitest";
import type { CharacterDoc } from "../core/schema/character.js";
import { CharacterDocSchema, validateCharacter } from "../core/schema/character.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import { apply } from "./mat2d.js";
import { buildRenderList, computeBoneWorld, type Pose } from "./pose.js";

// 腕チェーンだけの最小キャラ(数値検証用)
const ARM_CHAR = {
  formatVersion: 1,
  id: "test",
  name: "test",
  skeleton: "humanoid-v1",
  palette: {},
  parts: [
    { slot: "torso", z: 50, pins: { origin: [0, 0] }, shapes: [] },
    {
      slot: "upperArmL",
      z: 90,
      pins: { origin: [10, -100], joint: [10, -50] },
      shapes: [],
    },
    {
      slot: "forearmL",
      z: 91,
      pins: { origin: [10, -50], joint: [10, -10] },
      shapes: [],
    },
  ],
  hands: {},
  face: {},
  hair: { front: [], mid: [], back: [] },
  blink: { enabled: true, rate: 1 },
} as unknown as CharacterDoc;

const WRIST: [number, number] = [10, -10]; // キャラ空間の手首レスト位置

function wristWorld(pose: Pose): [number, number] {
  const bones = computeBoneWorld(ARM_CHAR, pose);
  const forearm = bones.get("forearmL");
  if (!forearm) throw new Error("forearmL が解決されていない");
  const local: [number, number] = [
    WRIST[0] - forearm.origin[0],
    WRIST[1] - forearm.origin[1],
  ];
  const m = forearm.world;
  // matrix はレスト原点周りの変換。チェーン先端の検証は origin 込みで行う
  return apply(m, local);
}

describe("computeBoneWorld", () => {
  it("レストポーズでは作画位置と一致する", () => {
    const [x, y] = wristWorld({});
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(-10);
  });

  it("上腕+90°(時計回り)で手首が肩の高さ・左側に来る", () => {
    const [x, y] = wristWorld({ rotations: { upperArmL: 90 } });
    expect(x).toBeCloseTo(-80);
    expect(y).toBeCloseTo(-100);
  });

  it("上腕+90°+前腕+90°で前腕が真上を向く", () => {
    const [x, y] = wristWorld({
      rotations: { upperArmL: 90, forearmL: 90 },
    });
    expect(x).toBeCloseTo(-40);
    expect(y).toBeCloseTo(-140);
  });

  it("胴の回転が腕チェーン全体に伝播する", () => {
    const [x, y] = wristWorld({ rotations: { torso: 90 } });
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(10);
  });

  it("rootOffsetが全体に加算される", () => {
    const [x, y] = wristWorld({ rootOffset: [5, 7] });
    expect(x).toBeCloseTo(15);
    expect(y).toBeCloseTo(-3);
  });

  it("ピン未設定のボーンは子ごとスキップされる", () => {
    const broken = {
      ...ARM_CHAR,
      parts: ARM_CHAR.parts.filter((p) => p.slot !== "upperArmL"),
    } as CharacterDoc;
    const bones = computeBoneWorld(broken, {});
    expect(bones.has("torso")).toBe(true);
    expect(bones.has("upperArmL")).toBe(false);
    expect(bones.has("forearmL")).toBe(false);
  });
});

describe("TEMPLATE_A", () => {
  it("スキーマ検証を通る", () => {
    expect(() => CharacterDocSchema.parse(TEMPLATE_A)).not.toThrow();
  });

  it("必須スロット・ピンが揃っている", () => {
    expect(validateCharacter(TEMPLATE_A)).toEqual([]);
  });

  it("レストポーズで足裏が接地ライン(y=310)にある", () => {
    const bones = computeBoneWorld(TEMPLATE_A, {});
    const foot = bones.get("footL");
    if (!foot) throw new Error("footL が解決されていない");
    const part = TEMPLATE_A.parts.find((p) => p.slot === "footL");
    const sole = part?.pins["sole"];
    if (!sole) throw new Error("sole ピンがない");
    const local: [number, number] = [
      sole[0] - foot.origin[0],
      sole[1] - foot.origin[1],
    ];
    const [, y] = apply(foot.world, local);
    expect(y).toBeCloseTo(310);
  });

  it("RenderItemがz昇順で並び、両手・顔・髪3層を含む", () => {
    const bones = computeBoneWorld(TEMPLATE_A, {});
    const items = buildRenderList(TEMPLATE_A, bones);
    const zs = items.map((i) => i.z);
    expect([...zs].sort((a, b) => a - b)).toEqual(zs);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("hand:handL");
    expect(keys).toContain("hand:handR");
    expect(keys).toContain("face:mouth");
    expect(keys).toContain("hair:back:0");
    expect(keys).toContain("hair:mid:1");
    expect(keys).toContain("hair:front:0");
  });

  it("奥の手(R)はミラーされ、手前の手(L)と左右対称の位置に出る", () => {
    const bones = computeBoneWorld(TEMPLATE_A, {});
    const items = buildRenderList(TEMPLATE_A, bones);
    const handL = items.find((i) => i.key === "hand:handL");
    const handR = items.find((i) => i.key === "hand:handR");
    if (!handL || !handR) throw new Error("手のRenderItemがない");
    // 作画上の手の中心 (38,-8) を両者の行列に通す
    const pL = apply(handL.matrix, [38, -8]);
    const pR = apply(handR.matrix, [38, -8]);
    expect(pL[0]).toBeCloseTo(38);
    expect(pR[0]).toBeCloseTo(-38);
    expect(pL[1]).toBeCloseTo(pR[1]);
  });
});
