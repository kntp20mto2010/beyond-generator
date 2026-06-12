import { describe, expect, it } from "vitest";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import { HairSimulator } from "./hair-physics.js";
import { translation, type Mat2D } from "./mat2d.js";

const DT = 1 / 60;

function rotationOf(m: Mat2D): number {
  return Math.atan2(m.b, m.a);
}

describe("HairSimulator", () => {
  it("静止状態では揺れない(deformsが空)", () => {
    const sim = new HairSimulator(TEMPLATE_A);
    const head = translation(0, 0);
    for (let i = 0; i < 120; i++) sim.step(head, DT);
    expect(sim.getDeforms().size).toBe(0);
  });

  it("頭が動くと揺れ、静止後は減衰して戻る", () => {
    const sim = new HairSimulator(TEMPLATE_A);
    // 0.5秒間 左右に振る
    for (let i = 0; i < 30; i++) {
      const x = 60 * Math.sin((i / 30) * Math.PI * 2);
      sim.step(translation(x, 0), DT);
    }
    const excited = sim.getDeforms();
    expect(excited.size).toBeGreaterThan(0);
    const maxRot = Math.max(...[...excited.values()].map((m) => Math.abs(rotationOf(m))));
    expect(maxRot).toBeGreaterThan(0.01);

    // 静止して4秒 → ほぼレストに戻る
    for (let i = 0; i < 240; i++) sim.step(translation(0, 0), DT);
    const settled = sim.getDeforms();
    for (const m of settled.values()) {
      expect(Math.abs(rotationOf(m))).toBeLessThan(0.01);
    }
  });

  it("決定論: 同じ入力列で完全に同じ結果", () => {
    const run = () => {
      const sim = new HairSimulator(TEMPLATE_A);
      const out: number[] = [];
      for (let i = 0; i < 90; i++) {
        const x = 40 * Math.sin(i * 0.21);
        const y = 10 * Math.cos(i * 0.13);
        sim.step(translation(x, y), DT, [300, 0]);
        for (const m of sim.getDeforms().values()) out.push(m.a, m.b, m.tx, m.ty);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("maxAngleクランプ: 極端な入力でも振れ角が上限以下", () => {
    const sim = new HairSimulator(TEMPLATE_A);
    for (let i = 0; i < 120; i++) {
      const x = i % 2 === 0 ? 500 : -500; // 暴力的な振動
      sim.step(translation(x, 0), DT, [3000, 0]);
    }
    const maxAngles = new Map(
      (["back", "mid", "front"] as const).flatMap((layer) =>
        TEMPLATE_A.hair[layer].map((s, i) => [
          `hair:${layer}:${i}`,
          (s.physics.maxAngle * Math.PI) / 180,
        ]),
      ),
    );
    for (const [key, m] of sim.getDeforms()) {
      const limit = maxAngles.get(key);
      if (limit === undefined) continue;
      // シアー分があるため回転角のみ検証(+5%の数値余裕)
      expect(Math.abs(rotationOf(m))).toBeLessThanOrEqual(limit * 1.05);
    }
  });

  it("仮想速度(トレッドミル)だけでも定常的になびく", () => {
    const sim = new HairSimulator(TEMPLATE_A);
    const head = translation(0, 0);
    for (let i = 0; i < 300; i++) sim.step(head, DT, [580, 0]);
    const deforms = sim.getDeforms();
    expect(deforms.size).toBeGreaterThan(0);
    const back = deforms.get("hair:back:0");
    expect(back).toBeDefined();
    // +x方向へ走る → 垂れ髪の先端は−x側(後方)へ = 時計回り = 正の回転(mat2d規約)
    if (back) expect(rotationOf(back)).toBeGreaterThan(0.05);
  });

  it("resetで初期状態に戻る", () => {
    const sim = new HairSimulator(TEMPLATE_A);
    for (let i = 0; i < 60; i++) sim.step(translation(i * 3, 0), DT);
    expect(sim.getDeforms().size).toBeGreaterThan(0);
    sim.reset();
    expect(sim.getDeforms().size).toBe(0);
  });
});
