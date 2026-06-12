import { describe, expect, it } from "vitest";
import type { ClipDoc } from "../core/schema/clip.js";
import { ClipDocSchema } from "../core/schema/clip.js";
import { CLIPS } from "../presets/clips/index.js";
import { ClipPlayer, sampleClip } from "./clip-player.js";

const SIMPLE: ClipDoc = {
  formatVersion: 1,
  id: "simple",
  label: "テスト",
  duration: 1.0,
  loop: true,
  virtualVelocity: 100,
  tracks: {
    bones: {
      upperArmL: { rot: [[0, 0], [0.5, 50], [1.0, 0]] },
    },
    root: { y: [[0, 0], [0.5, -10], [1.0, 0]] },
    handShape: [[0, "relax"], [0.5, "fist"]],
  },
};

const ONESHOT: ClipDoc = {
  formatVersion: 1,
  id: "oneshot",
  label: "単発",
  duration: 1.0,
  loop: false,
  tracks: {
    bones: { head: { rot: [[0.2, 0], [0.8, 30]] } },
    root: {},
    handShape: [],
  },
};

describe("sampleClip", () => {
  it("線形補間と端の値", () => {
    expect(sampleClip(SIMPLE, 0).pose.rotations?.upperArmL).toBeCloseTo(0);
    expect(sampleClip(SIMPLE, 0.25).pose.rotations?.upperArmL).toBeCloseTo(25);
    expect(sampleClip(SIMPLE, 0.5).pose.rotations?.upperArmL).toBeCloseTo(50);
    expect(sampleClip(SIMPLE, 0.5).pose.rootOffset?.[1]).toBeCloseTo(-10);
  });

  it("ループは duration で巻き戻る", () => {
    expect(sampleClip(SIMPLE, 1.25).pose.rotations?.upperArmL).toBeCloseTo(25);
    expect(sampleClip(SIMPLE, 10.5).pose.rotations?.upperArmL).toBeCloseTo(50);
  });

  it("非ループは最終値で保持される", () => {
    expect(sampleClip(ONESHOT, 2.0).pose.rotations?.head).toBeCloseTo(30);
  });

  it("最初のキーより前は先頭値で保持される", () => {
    expect(sampleClip(ONESHOT, 0.1).pose.rotations?.head).toBeCloseTo(0);
  });

  it("handShapeは直前のキーが有効", () => {
    expect(sampleClip(SIMPLE, 0.2).handShape).toBe("relax");
    expect(sampleClip(SIMPLE, 0.7).handShape).toBe("fist");
  });

  it("イージング(sineInOut)は中点で半分、単調増加", () => {
    const clip: ClipDoc = {
      ...SIMPLE,
      loop: false, // ループだと t=1.0 が 0 に巻き戻り単調性が壊れる(仕様通り)
      tracks: {
        bones: { torso: { rot: [[0, 0, "sineInOut"], [1, 100]] } },
        root: {},
        handShape: [],
      },
    };
    expect(sampleClip(clip, 0.5).pose.rotations?.torso).toBeCloseTo(50);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = sampleClip(clip, Math.min(t, 1)).pose.rotations?.torso ?? 0;
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });
});

describe("ClipPlayer(遷移)", () => {
  it("切替時にクロスフェードし、遷移後は新クリップに一致する", () => {
    const player = new ClipPlayer();
    const walk = CLIPS["walk"]!;
    const run = CLIPS["run"]!;
    player.play(walk, 0);

    const before = player.evaluate(1.0)!;
    player.play(run, 1.0, 0.2);

    // 切替直後はほぼ旧ポーズ
    const justAfter = player.evaluate(1.001)!;
    const dThigh = Math.abs(
      (justAfter.pose.rotations?.thighL ?? 0) - (before.pose.rotations?.thighL ?? 0),
    );
    expect(dThigh).toBeLessThan(3);

    // 遷移完了後は純粋なrun評価と一致
    const after = player.evaluate(1.3)!;
    const pureRun = sampleClip(run, 1.3 - 1.0);
    expect(after.pose.rotations?.thighL).toBeCloseTo(pureRun.pose.rotations?.thighL ?? 0, 5);
    expect(after.virtualVelocity).toBe(580);
  });

  it("遷移中の値が連続(ジャンプしない)", () => {
    const player = new ClipPlayer();
    player.play(CLIPS["walk"]!, 0);
    player.evaluate(0.9);
    player.play(CLIPS["run"]!, 0.9, 0.2);
    let prev: number | null = null;
    for (let t = 0.9; t <= 1.15; t += 0.008) {
      const v = player.evaluate(t)!.pose.rotations?.thighL ?? 0;
      if (prev !== null) {
        expect(Math.abs(v - prev)).toBeLessThan(8); // 8ms毎の変化量が小さい
      }
      prev = v;
    }
  });

  it("同じクリップの再playは無視される(リスタートしない)", () => {
    const player = new ClipPlayer();
    player.play(CLIPS["walk"]!, 0);
    const a = player.evaluate(0.3)!;
    player.play(CLIPS["walk"]!, 0.3);
    const b = player.evaluate(0.3)!;
    expect(b.pose.rotations?.thighL).toBeCloseTo(a.pose.rotations?.thighL ?? 0, 5);
  });
});

describe("プリセットクリップ", () => {
  it("全クリップがスキーマ検証を通る", () => {
    for (const clip of Object.values(CLIPS)) {
      expect(() => ClipDocSchema.parse(clip)).not.toThrow();
    }
  });

  it("ループクリップは末尾キーが先頭値で閉じている", () => {
    for (const clip of Object.values(CLIPS)) {
      if (!clip.loop) continue;
      for (const [bone, ch] of Object.entries(clip.tracks.bones)) {
        const keys = ch.rot;
        if (!keys || keys.length < 2) continue;
        const first = keys[0]!;
        const last = keys[keys.length - 1]!;
        expect(last[1], `${clip.id}.${bone} の末尾キー`).toBeCloseTo(first[1]);
        expect(last[0], `${clip.id}.${bone} の末尾時刻`).toBeCloseTo(clip.duration);
      }
    }
  });

  it("walkとrunは脚が左右対称の位相を持つ", () => {
    const walk = CLIPS["walk"]!;
    const t0 = sampleClip(walk, 0);
    expect(t0.pose.rotations?.thighL).toBeCloseTo(-(t0.pose.rotations?.thighR ?? 0));
  });

  it("CLIPSに10本登録されている", () => {
    expect(Object.keys(CLIPS).length).toBe(10);
  });

  it("各クリップのidがファイル名(キー)と一致する", () => {
    for (const [key, clip] of Object.entries(CLIPS)) {
      expect(clip.id).toBe(key);
    }
  });
});

describe("Phase3b 新クリップ", () => {
  it("point: loop=false、t=10で最終姿勢を保持(upperArmL ≈ -95)", () => {
    const point = CLIPS["point"]!;
    expect(point.loop).toBe(false);
    const frame = sampleClip(point, 10);
    expect(frame.pose.rotations?.upperArmL).toBeCloseTo(-95, 0);
  });

  it("jump: t=0.4 で root.y < -40(跳躍中)", () => {
    const jump = CLIPS["jump"]!;
    const frame = sampleClip(jump, 0.4);
    expect(frame.pose.rootOffset?.[1]).toBeLessThan(-40);
  });

  it("jump: t=1.0 で root.y ≈ 0(着地復帰)", () => {
    const jump = CLIPS["jump"]!;
    const frame = sampleClip(jump, 1.0);
    expect(frame.pose.rootOffset?.[1]).toBeCloseTo(0, 0);
  });
});
