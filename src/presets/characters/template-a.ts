import type { CharacterDoc } from "../../core/schema/character.js";
import type { Shape } from "../../core/schema/geometry.js";
import { mirrorShape } from "../../core/mirror.js";

// スターターテンプレート「ハル」
// キャラ空間: root(腰)=(0,0)、y-down、接地 y=+310、頭頂(髪含む) y=-348

// 顔シェイプはL側を作画し、R側は mirrorShape で自動生成(対称性の保証)
const BROW_L: Record<string, Shape[]> = {
  neutral: [{ kind: "rect", x: 12, y: -300, w: 14, h: 5, r: 2.5, fill: "@hair" }],
  up: [{ kind: "rect", x: 12, y: -306, w: 14, h: 5, r: 2.5, fill: "@hair" }],
  angryIn: [
    { kind: "polygon", points: [[12, -295], [26, -301], [26, -296.5], [12, -290.5]], fill: "@hair" },
  ],
  sadOut: [
    { kind: "polygon", points: [[12, -301], [26, -296], [26, -291.5], [12, -296.5]], fill: "@hair" },
  ],
  worried: [
    { kind: "polygon", points: [[12, -297], [19, -301], [26, -297], [26, -293], [19, -297], [12, -293]], fill: "@hair" },
  ],
};

const EYE_L: Record<string, Shape[]> = {
  neutral: [{ kind: "ellipse", cx: 19, cy: -282, rx: 4.5, ry: 5, fill: "@line" }],
  closed: [
    {
      kind: "path",
      d: [{ c: "M", p: [12.5, -280] }, { c: "Q", cp: [19, -276.5], p: [25.5, -280] }],
      stroke: { color: "@line", width: 3 },
    },
  ],
  happy: [
    {
      kind: "path",
      d: [{ c: "M", p: [12.5, -279] }, { c: "Q", cp: [19, -286], p: [25.5, -279] }],
      stroke: { color: "@line", width: 3 },
    },
  ],
  half: [{ kind: "ellipse", cx: 19, cy: -280.5, rx: 4.5, ry: 2.8, fill: "@line" }],
  wide: [{ kind: "ellipse", cx: 19, cy: -282.5, rx: 5.5, ry: 6.5, fill: "@line" }],
};

const MOUTH: Record<string, Shape[]> = {
  neutral: [
    {
      kind: "path",
      d: [{ c: "M", p: [-9, -253.5] }, { c: "Q", cp: [0, -249.5], p: [9, -253.5] }],
      stroke: { color: "@line", width: 3.5 },
    },
  ],
  smile: [
    {
      kind: "path",
      d: [{ c: "M", p: [-12, -257] }, { c: "Q", cp: [0, -245], p: [12, -257] }],
      stroke: { color: "@line", width: 3.5 },
    },
  ],
  openSmile: [
    {
      kind: "path",
      d: [
        { c: "M", p: [-13, -258] },
        { c: "Q", cp: [0, -240], p: [13, -258] },
        { c: "Q", cp: [0, -252], p: [-13, -258] },
        { c: "Z" },
      ],
      fill: "@line",
    },
  ],
  frown: [
    {
      kind: "path",
      d: [{ c: "M", p: [-11, -249] }, { c: "Q", cp: [0, -258], p: [11, -249] }],
      stroke: { color: "@line", width: 3.5 },
    },
  ],
  flat: [
    {
      kind: "path",
      d: [{ c: "M", p: [-10, -252] }, { c: "L", p: [10, -252] }],
      stroke: { color: "@line", width: 3.5 },
    },
  ],
  open: [{ kind: "ellipse", cx: 0, cy: -251, rx: 6, ry: 7.5, fill: "@line" }],
  sadOpen: [
    {
      kind: "path",
      d: [
        { c: "M", p: [-12, -246] },
        { c: "Q", cp: [0, -258], p: [12, -246] },
        { c: "Q", cp: [0, -242], p: [-12, -246] },
        { c: "Z" },
      ],
      fill: "@line",
    },
  ],
};

function mirrorShapeSet(set: Record<string, Shape[]>): Record<string, Shape[]> {
  return Object.fromEntries(
    Object.entries(set).map(([name, shapes]) => [name, shapes.map(mirrorShape)]),
  );
}
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
        // スカルプキャップ(揺れない地髪): ストランドがなびいた時に肌でなく髪色を見せる
        // レスト時は前髪(y-342..-306)の裏に完全に隠れる
        { kind: "rect", x: -45, y: -338, w: 90, h: 30, r: 22, fill: "@hair" },
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
    browL: { anchor: [19, -297], z: 78, shapes: BROW_L },
    browR: { anchor: [-19, -297], z: 78, shapes: mirrorShapeSet(BROW_L) },
    eyeL: { anchor: [19, -282], z: 74, shapes: EYE_L },
    eyeR: { anchor: [-19, -282], z: 74, shapes: mirrorShapeSet(EYE_L) },
    mouth: { anchor: [0, -252], z: 73, shapes: MOUTH },
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
        physics: { stiffness: 0.7, damping: 0.85, inertia: 0.45, maxAngle: 10, gravity: 0.1, segments: 1 },
      },
      {
        shapes: [{ kind: "rect", x: 39, y: -322, w: 13, h: 68, r: 6, fill: "@hair" }],
        pin: [46, -318],
        physics: { stiffness: 0.7, damping: 0.85, inertia: 0.45, maxAngle: 10, gravity: 0.1, segments: 1 },
      },
    ],
    front: [
      {
        shapes: [{ kind: "rect", x: -47, y: -342, w: 94, h: 36, r: 14, fill: "@hair" }],
        pin: [0, -332],
        physics: { stiffness: 0.75, damping: 0.85, inertia: 0.4, maxAngle: 7, gravity: 0.05, segments: 1 },
      },
    ],
  },
  blink: { enabled: true, rate: 1 },
};
