import type { Pose } from "./pose.js";

// 仮実装のプロシージャルサイクル(Phase 3 でキーフレームクリップに置換)
// 髪物理のデモと表情確認のためだけに存在する
export type CycleKind = "idle" | "walk" | "run";

export interface CycleFrame {
  pose: Pose;
  // その場アニメの仮想移動速度 [u/s](髪物理のトレッドミル入力)
  virtualVelocity: number;
}

const TAU = Math.PI * 2;

export function evalCycle(kind: CycleKind, t: number): CycleFrame {
  switch (kind) {
    case "idle": {
      const s = Math.sin(TAU * 0.35 * t);
      return {
        pose: {
          rotations: {
            torso: 1.2 * s,
            head: 0.9 * Math.sin(TAU * 0.35 * t - 0.6),
            upperArmL: 1.5 * s,
            upperArmR: -1.5 * s,
          },
          rootOffset: [0, 1.2 * s],
        },
        virtualVelocity: 0,
      };
    }
    case "walk": {
      const f = 1.5;
      const s = Math.sin(TAU * f * t);
      const swingL = Math.sin(TAU * f * t - 0.7);
      const swingR = Math.sin(TAU * f * t - 0.7 + Math.PI);
      return {
        pose: {
          rotations: {
            thighL: 27 * s,
            thighR: -27 * s,
            shinL: Math.max(0, 38 * swingL),
            shinR: Math.max(0, 38 * swingR),
            upperArmL: -20 * s,
            upperArmR: 20 * s,
            forearmL: 10,
            forearmR: 10,
            torso: 4,
            head: -2 + 0.8 * Math.sin(TAU * 2 * f * t),
          },
          rootOffset: [0, -3.5 * (0.5 - 0.5 * Math.cos(TAU * 2 * f * t))],
        },
        virtualVelocity: 240,
      };
    }
    case "run": {
      const f = 2.3;
      const s = Math.sin(TAU * f * t);
      const swingL = Math.sin(TAU * f * t - 0.85);
      const swingR = Math.sin(TAU * f * t - 0.85 + Math.PI);
      return {
        pose: {
          rotations: {
            thighL: 46 * s,
            thighR: -46 * s,
            shinL: 12 + Math.max(0, 62 * swingL),
            shinR: 12 + Math.max(0, 62 * swingR),
            upperArmL: -34 * s,
            upperArmR: 34 * s,
            forearmL: 38,
            forearmR: 38,
            torso: 13,
            head: -6 + 1.2 * Math.sin(TAU * 2 * f * t),
          },
          rootOffset: [0, -13 * (0.5 - 0.5 * Math.cos(TAU * 2 * f * t))],
        },
        virtualVelocity: 580,
      };
    }
  }
}
