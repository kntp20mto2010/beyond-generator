import { describe, it, expect } from "vitest";
import { mirrorShape, mirrorPins, mirrorPartSlot, mirrorFaceSlot, mirrorHairMidIndex } from "./mirror.js";
import type { Shape, Vec2 } from "./schema/geometry.js";

describe("mirrorShape: rect", () => {
  it("x座標が反転する (x' = -(x+w))", () => {
    const s: Shape = { kind: "rect", x: 10, y: -20, w: 30, h: 40, fill: "#fff" };
    const m = mirrorShape(s);
    expect(m.kind).toBe("rect");
    if (m.kind === "rect") {
      expect(m.x).toBeCloseTo(-40);
      expect(m.y).toBe(-20);
      expect(m.w).toBe(30);
      expect(m.h).toBe(40);
    }
  });

  it("r属性が保持される", () => {
    const s: Shape = { kind: "rect", x: 0, y: 0, w: 20, h: 10, r: 5, fill: "#fff" };
    const m = mirrorShape(s);
    if (m.kind === "rect") expect(m.r).toBe(5);
  });
});

describe("mirrorShape: ellipse", () => {
  it("cx が符号反転する", () => {
    const s: Shape = { kind: "ellipse", cx: 15, cy: -30, rx: 10, ry: 12, fill: "@skin" };
    const m = mirrorShape(s);
    expect(m.kind).toBe("ellipse");
    if (m.kind === "ellipse") {
      expect(m.cx).toBeCloseTo(-15);
      expect(m.cy).toBe(-30);
      expect(m.rx).toBe(10);
      expect(m.ry).toBe(12);
    }
  });
});

describe("mirrorShape: polygon", () => {
  it("全頂点のx座標が反転する", () => {
    const s: Shape = {
      kind: "polygon",
      points: [[10, 0], [20, 10], [0, 10]],
      fill: "@primary",
    };
    const m = mirrorShape(s);
    expect(m.kind).toBe("polygon");
    if (m.kind === "polygon") {
      expect(m.points[0]?.[0]).toBeCloseTo(-10);
      expect(m.points[0]?.[1]).toBeCloseTo(0);
      expect(m.points[1]?.[0]).toBeCloseTo(-20);
      expect(m.points[1]?.[1]).toBeCloseTo(10);
      expect(m.points[2]?.[0]).toBeCloseTo(0);
      expect(m.points[2]?.[1]).toBeCloseTo(10);
    }
  });
});

describe("mirrorShape: path", () => {
  it("M/L/Q/C/Zコマンドのx座標が反転する", () => {
    const s: Shape = {
      kind: "path",
      d: [
        { c: "M", p: [5, 0] },
        { c: "L", p: [10, 5] },
        { c: "Q", cp: [15, 10], p: [20, 0] },
        { c: "C", cp1: [5, -5], cp2: [15, -5], p: [20, 0] },
        { c: "Z" },
      ],
      fill: "@hair",
    };
    const m = mirrorShape(s);
    expect(m.kind).toBe("path");
    if (m.kind === "path") {
      const d = m.d;
      const m0 = d[0];
      const m1 = d[1];
      const m2 = d[2];
      const m3 = d[3];
      const m4 = d[4];
      if (m0?.c === "M") expect(m0.p[0]).toBeCloseTo(-5);
      if (m1?.c === "L") expect(m1.p[0]).toBeCloseTo(-10);
      if (m2?.c === "Q") {
        expect(m2.cp[0]).toBeCloseTo(-15);
        expect(m2.p[0]).toBeCloseTo(-20);
      }
      if (m3?.c === "C") {
        expect(m3.cp1[0]).toBeCloseTo(-5);
        expect(m3.cp2[0]).toBeCloseTo(-15);
        expect(m3.p[0]).toBeCloseTo(-20);
      }
      expect(m4?.c).toBe("Z");
    }
  });
});

describe("mirrorPins", () => {
  it("全ピンのx座標が反転する", () => {
    const pins: Record<string, Vec2> = {
      origin: [10, -100],
      joint: [10, -50],
    };
    const m = mirrorPins(pins);
    expect(m["origin"]).toEqual([-10, -100]);
    expect(m["joint"]).toEqual([-10, -50]);
  });
});

describe("mirrorPartSlot: L↔R対応", () => {
  it("upperArmL → upperArmR", () => {
    expect(mirrorPartSlot("upperArmL")).toBe("upperArmR");
  });
  it("thighR → thighL", () => {
    expect(mirrorPartSlot("thighR")).toBe("thighL");
  });
  it("対応なしのスロットはnull", () => {
    expect(mirrorPartSlot("torso")).toBeNull();
    expect(mirrorPartSlot("head")).toBeNull();
  });
});

describe("mirrorFaceSlot", () => {
  it("browL → browR", () => {
    expect(mirrorFaceSlot("browL")).toBe("browR");
  });
  it("eyeR → eyeL", () => {
    expect(mirrorFaceSlot("eyeR")).toBe("eyeL");
  });
  it("mouth はnull", () => {
    expect(mirrorFaceSlot("mouth")).toBeNull();
  });
});

describe("mirrorHairMidIndex", () => {
  it("0 → 1", () => {
    expect(mirrorHairMidIndex(0)).toBe(1);
  });
  it("1 → 0", () => {
    expect(mirrorHairMidIndex(1)).toBe(0);
  });
  it("2以上はnull", () => {
    expect(mirrorHairMidIndex(2)).toBeNull();
  });
});
