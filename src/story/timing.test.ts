import { describe, it, expect } from "vitest";
import {
  CLIP_DUR,
  estMove,
  estTalk,
  PLACE_TABLE,
  quantize,
  resolvePlace,
  VEL,
  voiceLen,
} from "./timing.js";
import { CLIPS } from "../presets/clips/index.js";

describe("CLIP_DUR / VEL は実プリセット由来", () => {
  it("CLIP_DUR は CLIPS の duration と一致(近似ハードコードでない)", () => {
    for (const [k, dur] of Object.entries(CLIP_DUR)) {
      expect(dur).toBe(CLIPS[k]!.duration);
    }
  });

  it("VEL は walk=240 / run=580(virtualVelocity 実値)", () => {
    expect(VEL.walk).toBe(CLIPS["walk"]!.virtualVelocity);
    expect(VEL.run).toBe(CLIPS["run"]!.virtualVelocity);
    expect(VEL.walk).toBe(240);
    expect(VEL.run).toBe(580);
  });

  it("virtualVelocity=0 のクリップは既定 240 にフォールバック", () => {
    expect(VEL.talk1).toBe(240);
    expect(VEL.idle).toBe(240);
  });
});

describe("estTalk", () => {
  it("spec の式どおり(ceil(len/cps*10)/10 + 0.2*読点 + 0.2)", () => {
    // "あい" len2, cps7 → ceil(0.2857*10)/10=0.3, +0.2 = 0.5
    expect(estTalk("あい", 7)).toBeCloseTo(0.5, 6);
    // "あ、い" len3, cps7 → ceil(0.4286*10)/10=0.5, +0.2(読点)+0.2 = 0.9
    expect(estTalk("あ、い", 7)).toBeCloseTo(0.9, 6);
  });

  it("読点を秒に加算する", () => {
    const withComma = estTalk("はい、そうです", 7);
    const noComma = estTalk("はいそうです", 7);
    expect(withComma).toBeGreaterThan(noComma);
  });
});

// §7 較正: vo-001〜007(実測 VOICEVOX WAV 長)に対し est 誤差が許容内。charPerSec=5.5
describe("est 較正(実測7サンプル / VOICEVOX)", () => {
  const CPS = 5.5;
  const samples: { line: string; real: number }[] = [
    { line: "ふぁ〜…ねむい…", real: 1.728 },
    { line: "ハルくん、おはよう!", real: 1.675 },
    { line: "わっ…おはよう、ハナさん", real: 2.763 },
    { line: "今日、体育あるよね?", real: 2.347 },
    { line: "うん、ドッジボールだって!", real: 2.155 },
    { line: "やったー!", real: 0.768 },
    { line: "燃えるぞ〜!", real: 0.939 },
  ];

  it("各サンプルの誤差は ±0.8s 以内", () => {
    for (const s of samples) {
      const est = estTalk(s.line, CPS);
      expect(Math.abs(est - s.real)).toBeLessThanOrEqual(0.8);
    }
  });

  it("平均誤差は 0.5s 以内", () => {
    const sum = samples.reduce(
      (acc, s) => acc + Math.abs(estTalk(s.line, CPS) - s.real),
      0,
    );
    expect(sum / samples.length).toBeLessThanOrEqual(0.5);
  });
});

describe("voiceLen", () => {
  const dur = { "vo-001": 1.474 };
  it("実長があれば実長を優先", () => {
    expect(voiceLen("vo-001", "どんな長さでも", 7, dur)).toBe(1.474);
  });
  it("実長なし+line ありは estTalk", () => {
    expect(voiceLen("vo-099", "あい", 7, dur)).toBe(estTalk("あい", 7));
  });
  it("voice も line も無ければ 3.0", () => {
    expect(voiceLen(undefined, undefined, 7, dur)).toBe(3.0);
  });
});

describe("estMove", () => {
  it("|dx|/(VEL*speed)", () => {
    expect(estMove(0, 480, "walk", 1)).toBeCloseTo(480 / 240, 6);
    expect(estMove(0, 580, "run", 1)).toBeCloseTo(580 / 580, 6);
    expect(estMove(0, 480, "walk", 2)).toBeCloseTo(480 / 480, 6);
  });
});

describe("resolvePlace / PLACE_TABLE", () => {
  it("離散プレースは表どおり", () => {
    expect(resolvePlace("center", 700)).toEqual({ x: 960, y: 700 });
    expect(resolvePlace("farLeft", 700)).toEqual({ x: 200, y: 700 });
    expect(PLACE_TABLE.centerRight).toBe(1240);
  });
  it("座標オブジェクトは y 省略時 groundY", () => {
    expect(resolvePlace({ x: 500 }, 700)).toEqual({ x: 500, y: 700 });
    expect(resolvePlace({ x: 500, y: 300 }, 700)).toEqual({ x: 500, y: 300 });
  });
});

describe("quantize", () => {
  it("1/30s グリッドへ丸める", () => {
    expect(quantize(0.1)).toBeCloseTo(3 / 30, 6); // 0.1 → 0.1
    expect(quantize(0.123)).toBe(Math.round(0.123 * 30) / 30);
    expect(quantize(1 / 30)).toBe(1 / 30);
  });
});
