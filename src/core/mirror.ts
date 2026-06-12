import type { PathCmd, Shape, Vec2 } from "./schema/geometry.js";

function mirrorVec2(v: Vec2): Vec2 {
  return [-v[0], v[1]];
}

function mirrorPathCmd(cmd: PathCmd): PathCmd {
  switch (cmd.c) {
    case "M": return { c: "M", p: mirrorVec2(cmd.p) };
    case "L": return { c: "L", p: mirrorVec2(cmd.p) };
    case "Q": return { c: "Q", cp: mirrorVec2(cmd.cp), p: mirrorVec2(cmd.p) };
    case "C": return { c: "C", cp1: mirrorVec2(cmd.cp1), cp2: mirrorVec2(cmd.cp2), p: mirrorVec2(cmd.p) };
    case "Z": return { c: "Z" };
  }
}

export function mirrorShape(shape: Shape): Shape {
  switch (shape.kind) {
    case "rect": {
      const { x, y, w, h, r, fill, stroke } = shape;
      const mirrored: Shape = { kind: "rect", x: -(x + w), y, w, h, fill, stroke };
      if (r !== undefined) (mirrored as typeof shape).r = r;
      return mirrored;
    }
    case "ellipse": {
      const { cx, cy, rx, ry, fill, stroke } = shape;
      return { kind: "ellipse", cx: -cx, cy, rx, ry, fill, stroke };
    }
    case "polygon": {
      const { points, fill, stroke } = shape;
      return { kind: "polygon", points: points.map(mirrorVec2), fill, stroke };
    }
    case "path": {
      const { d, fill, stroke } = shape;
      return { kind: "path", d: d.map(mirrorPathCmd), fill, stroke };
    }
  }
}

export function mirrorPins(pins: Record<string, Vec2>): Record<string, Vec2> {
  const result: Record<string, Vec2> = {};
  for (const [k, v] of Object.entries(pins)) {
    result[k] = mirrorVec2(v);
  }
  return result;
}

// L↔R スロット対応表
const LR_PAIRS: Array<[string, string]> = [
  ["upperArmL", "upperArmR"],
  ["forearmL", "forearmR"],
  ["thighL", "thighR"],
  ["shinL", "shinR"],
  ["footL", "footR"],
  ["handL", "handR"],
  ["shoulderL", "shoulderR"],
  ["hipL", "hipR"],
];

// 顔パーツの L↔R 対応
const FACE_LR_PAIRS: Array<[string, string]> = [
  ["browL", "browR"],
  ["eyeL", "eyeR"],
  ["cheekL", "cheekR"],
];

export function mirrorPartSlot(slot: string): string | null {
  for (const [l, r] of LR_PAIRS) {
    if (slot === l) return r;
    if (slot === r) return l;
  }
  return null;
}

export function mirrorFaceSlot(slot: string): string | null {
  for (const [l, r] of FACE_LR_PAIRS) {
    if (slot === l) return r;
    if (slot === r) return l;
  }
  return null;
}

// hair mid: index 0 ↔ index 1
export function mirrorHairMidIndex(index: number): number | null {
  if (index === 0) return 1;
  if (index === 1) return 0;
  return null;
}
