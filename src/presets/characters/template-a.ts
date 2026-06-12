import type { CharacterDoc } from "../../core/schema/character.js";

// スターターテンプレート「ハル」
// キャラ空間: root(腰)=(0,0)、y-down、接地 y=+310、頭頂(髪含む) y=-348
export const TEMPLATE_A: CharacterDoc = {
  formatVersion: 1,
  id: "template-a",
  name: "ハル",
  skeleton: "humanoid-v1",
  palette: {
    skin: "#F0C19C",
    hair: "#463029",
    primary: "#5B7DB1",
    secondary: "#3F4A5A",
    accent: "#D9704C",
    line: "#2E2A33",
  },
  parts: [
    // --- 奥腕(R) ---
    {
      slot: "upperArmR",
      z: 20,
      pins: { origin: [-38, -185], joint: [-38, -100] },
      shapes: [
        { kind: "rect", x: -46, y: -193, w: 16, h: 101, r: 8, fill: "@primary" },
      ],
    },
    {
      slot: "forearmR",
      z: 21,
      pins: { origin: [-38, -100], joint: [-38, -20] },
      shapes: [
        { kind: "rect", x: -45, y: -107, w: 14, h: 94, r: 7, fill: "@skin" },
      ],
    },
    // --- 奥脚(R) ---
    {
      slot: "thighR",
      z: 30,
      pins: { origin: [-16, 0], joint: [-16, 155] },
      shapes: [
        { kind: "rect", x: -27, y: -11, w: 22, h: 177, r: 11, fill: "@secondary" },
      ],
    },
    {
      slot: "shinR",
      z: 31,
      pins: { origin: [-16, 155], joint: [-16, 290] },
      shapes: [
        { kind: "rect", x: -25, y: 146, w: 18, h: 153, r: 9, fill: "@secondary" },
      ],
    },
    {
      slot: "footR",
      z: 32,
      pins: { origin: [-16, 290], sole: [-16, 310] },
      shapes: [{ kind: "ellipse", cx: -19, cy: 300, rx: 18, ry: 11, fill: "@accent" }],
    },
    // --- 手前脚(L) ---
    {
      slot: "thighL",
      z: 40,
      pins: { origin: [16, 0], joint: [16, 155] },
      shapes: [
        { kind: "rect", x: 5, y: -11, w: 22, h: 177, r: 11, fill: "@secondary" },
      ],
    },
    {
      slot: "shinL",
      z: 41,
      pins: { origin: [16, 155], joint: [16, 290] },
      shapes: [
        { kind: "rect", x: 7, y: 146, w: 18, h: 153, r: 9, fill: "@secondary" },
      ],
    },
    {
      slot: "footL",
      z: 42,
      pins: { origin: [16, 290], sole: [16, 310] },
      shapes: [{ kind: "ellipse", cx: 19, cy: 300, rx: 18, ry: 11, fill: "@accent" }],
    },
    // --- 胴 ---
    {
      slot: "torso",
      z: 50,
      pins: {
        origin: [0, 0],
        neckTop: [0, -205],
        shoulderL: [38, -185],
        shoulderR: [-38, -185],
        hipL: [16, 0],
        hipR: [-16, 0],
      },
      shapes: [
        { kind: "rect", x: -42, y: -210, w: 84, h: 222, r: 26, fill: "@primary" },
        { kind: "rect", x: -40, y: -12, w: 80, h: 34, r: 12, fill: "@secondary" },
      ],
    },
    // --- 頭(首含む) ---
    {
      slot: "head",
      z: 60,
      pins: { origin: [0, -205] },
      shapes: [
        { kind: "rect", x: -9, y: -228, w: 18, h: 30, r: 6, fill: "@skin" },
        { kind: "rect", x: -46, y: -338, w: 92, h: 118, r: 34, fill: "@skin" },
      ],
    },
    // --- 手前腕(L) ---
    {
      slot: "upperArmL",
      z: 90,
      pins: { origin: [38, -185], joint: [38, -100] },
      shapes: [
        { kind: "rect", x: 30, y: -193, w: 16, h: 101, r: 8, fill: "@primary" },
      ],
    },
    {
      slot: "forearmL",
      z: 91,
      pins: { origin: [38, -100], joint: [38, -20] },
      shapes: [
        { kind: "rect", x: 31, y: -107, w: 14, h: 94, r: 7, fill: "@skin" },
      ],
    },
  ],
  hands: {
    open: {
      shapes: [{ kind: "ellipse", cx: 38, cy: -8, rx: 11, ry: 12, fill: "@skin" }],
      pins: { origin: [38, -20], grip: [38, 2] },
    },
    fist: {
      shapes: [{ kind: "ellipse", cx: 38, cy: -10, rx: 10, ry: 10, fill: "@skin" }],
      pins: { origin: [38, -20], grip: [38, 0] },
    },
  },
  face: {
    browL: {
      anchor: [19, -297],
      z: 78,
      shapes: {
        neutral: [{ kind: "rect", x: 12, y: -300, w: 14, h: 5, r: 2.5, fill: "@hair" }],
      },
    },
    browR: {
      anchor: [-19, -297],
      z: 78,
      shapes: {
        neutral: [{ kind: "rect", x: -26, y: -300, w: 14, h: 5, r: 2.5, fill: "@hair" }],
      },
    },
    eyeL: {
      anchor: [19, -282],
      z: 74,
      shapes: {
        neutral: [{ kind: "ellipse", cx: 19, cy: -282, rx: 4.5, ry: 5, fill: "@line" }],
      },
    },
    eyeR: {
      anchor: [-19, -282],
      z: 74,
      shapes: {
        neutral: [{ kind: "ellipse", cx: -19, cy: -282, rx: 4.5, ry: 5, fill: "@line" }],
      },
    },
    mouth: {
      anchor: [0, -252],
      z: 73,
      shapes: {
        neutral: [
          {
            kind: "path",
            d: [
              { c: "M", p: [-11, -256] },
              { c: "Q", cp: [0, -245], p: [11, -256] },
            ],
            stroke: { color: "@line", width: 3.5 },
          },
        ],
      },
    },
  },
  hair: {
    back: [
      {
        shapes: [{ kind: "rect", x: -52, y: -348, w: 104, h: 100, r: 40, fill: "@hair" }],
        pin: [0, -335],
        physics: { stiffness: 0.55, damping: 0.8, inertia: 0.6, maxAngle: 22, gravity: 0.15, segments: 1 },
      },
    ],
    mid: [
      {
        shapes: [{ kind: "rect", x: -52, y: -322, w: 13, h: 68, r: 6, fill: "@hair" }],
        pin: [-46, -318],
        physics: { stiffness: 0.7, damping: 0.85, inertia: 0.45, maxAngle: 14, gravity: 0.1, segments: 1 },
      },
      {
        shapes: [{ kind: "rect", x: 39, y: -322, w: 13, h: 68, r: 6, fill: "@hair" }],
        pin: [46, -318],
        physics: { stiffness: 0.7, damping: 0.85, inertia: 0.45, maxAngle: 14, gravity: 0.1, segments: 1 },
      },
    ],
    front: [
      {
        shapes: [{ kind: "rect", x: -47, y: -342, w: 94, h: 36, r: 14, fill: "@hair" }],
        pin: [0, -332],
        physics: { stiffness: 0.75, damping: 0.85, inertia: 0.4, maxAngle: 10, gravity: 0.05, segments: 1 },
      },
    ],
  },
  blink: { enabled: true, rate: 1 },
};
