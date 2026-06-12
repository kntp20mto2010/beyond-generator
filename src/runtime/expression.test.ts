import { describe, expect, it } from "vitest";
import type { CharacterDoc } from "../core/schema/character.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import { blinkAt, resolveFace } from "./expression.js";
import { mulberry32 } from "./rand.js";

describe("resolveFace", () => {
  it("neutralでは全スロットがneutral・オフセットなし", () => {
    const res = resolveFace(TEMPLATE_A, { preset: "neutral" });
    for (const slot of ["browL", "browR", "eyeL", "eyeR", "mouth"]) {
      const r = res.get(slot);
      expect(r?.shapeName).toBe("neutral");
      expect(r?.offset).toEqual([0, 0]);
    }
  });

  it("angryプリセットで眉angryIn・口frownになる", () => {
    const res = resolveFace(TEMPLATE_A, { preset: "angry" });
    expect(res.get("browL")?.shapeName).toBe("angryIn");
    expect(res.get("browR")?.shapeName).toBe("angryIn");
    expect(res.get("mouth")?.shapeName).toBe("frown");
    expect(res.get("eyeL")?.shapeName).toBe("neutral");
  });

  it("surprisedで眉にbrowOffsetYが乗る", () => {
    const res = resolveFace(TEMPLATE_A, { preset: "surprised" });
    expect(res.get("browL")?.offset[1]).toBeLessThan(0);
    expect(res.get("mouth")?.shapeName).toBe("open");
  });

  it("存在しないシェイプはneutralへフォールバック", () => {
    const char = {
      ...TEMPLATE_A,
      face: {
        mouth: { anchor: [0, 0], z: 73, shapes: { neutral: [] } },
      },
    } as unknown as CharacterDoc;
    const res = resolveFace(char, { preset: "angry" }); // frownが無い
    expect(res.get("mouth")?.shapeName).toBe("neutral");
  });

  it("blink≥0.5でclosedシェイプがあればスワップ、無ければsquash", () => {
    const withClosed = resolveFace(TEMPLATE_A, { blink: 0.9 });
    expect(withClosed.get("eyeL")?.shapeName).toBe("closed");
    expect(withClosed.get("eyeL")?.squashY).toBeUndefined();

    const char = {
      ...TEMPLATE_A,
      face: {
        eyeL: { anchor: [19, -282], z: 74, shapes: { neutral: [] } },
      },
    } as unknown as CharacterDoc;
    const fallback = resolveFace(char, { blink: 0.9 });
    expect(fallback.get("eyeL")?.shapeName).toBe("neutral");
    expect(fallback.get("eyeL")?.squashY).toBeCloseTo(0.1, 1);
  });

  it("視線: pupilが無いキャラではeyeに控えめなオフセット", () => {
    const res = resolveFace(TEMPLATE_A, { gaze: [1, 0] });
    const eye = res.get("eyeL");
    expect(eye && eye.offset[0]).toBeGreaterThan(0);
    expect(eye && eye.offset[0]).toBeLessThan(5);
    expect(res.get("mouth")?.offset[0]).toBe(0);
  });
});

describe("blinkAt", () => {
  it("決定論: 同じseedで同じ瞬きカーブ", () => {
    const s1: number[] = [];
    const s2: number[] = [];
    const r1 = mulberry32(7);
    const r2 = mulberry32(7);
    const samples1 = [];
    const samples2 = [];
    for (let t = 0; t < 20; t += 0.01) {
      samples1.push(blinkAt(t, r1, s1));
      samples2.push(blinkAt(t, r2, s2));
    }
    expect(samples1).toEqual(samples2);
    // 20秒で少なくとも3回は瞬きが起きている
    const peaks = samples1.filter((v) => v > 0.9).length;
    expect(peaks).toBeGreaterThan(2);
  });

  it("瞬きの谷間では0", () => {
    const schedule: number[] = [];
    const rng = mulberry32(1);
    blinkAt(0, rng, schedule); // スケジュール生成
    const first = schedule[0] ?? 0;
    expect(blinkAt(first - 0.2, rng, schedule)).toBe(0);
    expect(blinkAt(first + 0.07, rng, schedule)).toBeGreaterThan(0.8);
  });
});
