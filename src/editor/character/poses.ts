import type { Pose } from "../../runtime/pose.js";

export interface PoseDef {
  label: string;
  pose: Pose;
  handShape?: string;
}

export const POSES: PoseDef[] = [
  { label: "休め", pose: {} },
  {
    label: "手を振る",
    pose: {
      rotations: { upperArmL: -150, forearmL: -35, head: 6 },
    },
  },
  {
    label: "歩き",
    pose: {
      rotations: {
        thighL: -30, shinL: 40, thighR: 20, shinR: 5,
        torso: 6, upperArmL: 25, upperArmR: -25,
      },
      rootOffset: [0, -6],
    },
  },
  {
    label: "ジャンプ",
    pose: {
      rotations: {
        upperArmL: -150, forearmL: -20,
        upperArmR: 150, forearmR: 20,
        thighL: -10, shinL: 15, thighR: 10, shinR: -15,
        head: -4,
      },
      rootOffset: [0, -55],
    },
    handShape: "open",
  },
];
