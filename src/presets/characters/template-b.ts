import type { CharacterDoc } from "../../core/schema/character.js";
import { TEMPLATE_A } from "./template-a.js";

// スターターテンプレート「ハナ」
// リグ・顔・手は template-a と完全互換(Replaceでアクション/表情がそのまま生きる)
// 差分: パレット(ローズ×暖ブラウン)、ワンピース+セーラー襟、ロングヘア+サイドテール

export const TEMPLATE_B: CharacterDoc = {
  formatVersion: 1,
  id: "template-b",
  name: "ハナ",
  skeleton: "humanoid-v1",
  palette: {
    skin: "#F2C6A0",
    hair: "#8A5A44",
    primary: "#C96F7B",
    secondary: "#4D4257",
    accent: "#E8B84B",
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
    // --- 胴(ワンピース+スカート+セーラー襟+ベルト) ---
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
        // スカート(台形に広がる)
        { kind: "polygon", points: [[-41, -18], [41, -18], [55, 50], [-55, 50]], fill: "@primary" },
        // 裾ライン
        { kind: "polygon", points: [[-54, 44], [54, 44], [55, 50], [-55, 50]], fill: "@secondary" },
        // セーラー襟
        { kind: "polygon", points: [[-26, -206], [26, -206], [0, -172]], fill: "@secondary" },
        // リボンベルト
        { kind: "rect", x: -42, y: -70, w: 84, h: 13, r: 6.5, fill: "@accent" },
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
        // スカルプキャップ(揺れない地髪)
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
  // 顔・手・まばたきは template-a と共有(同一ローカル座標系なので完全流用可)
  hands: TEMPLATE_A.hands,
  face: TEMPLATE_A.face,
  hair: {
    back: [
      {
        // ロングの後ろ髪(肩下まで)
        shapes: [{ kind: "rect", x: -56, y: -348, w: 112, h: 158, r: 42, fill: "@hair" }],
        pin: [0, -332],
        physics: { stiffness: 0.5, damping: 0.8, inertia: 0.65, maxAngle: 24, gravity: 0.18, segments: 1 },
      },
    ],
    mid: [
      {
        // サイドテール(左)
        shapes: [{ kind: "rect", x: -64, y: -322, w: 17, h: 138, r: 8.5, fill: "@hair" }],
        pin: [-55, -316],
        physics: { stiffness: 0.55, damping: 0.82, inertia: 0.6, maxAngle: 26, gravity: 0.2, segments: 1 },
      },
      {
        // サイドテール(右)
        shapes: [{ kind: "rect", x: 47, y: -322, w: 17, h: 138, r: 8.5, fill: "@hair" }],
        pin: [55, -316],
        physics: { stiffness: 0.55, damping: 0.82, inertia: 0.6, maxAngle: 26, gravity: 0.2, segments: 1 },
      },
    ],
    front: [
      {
        // ぱっつん前髪
        shapes: [{ kind: "rect", x: -47, y: -344, w: 94, h: 42, r: 16, fill: "@hair" }],
        pin: [0, -332],
        physics: { stiffness: 0.78, damping: 0.86, inertia: 0.35, maxAngle: 6, gravity: 0.05, segments: 1 },
      },
    ],
  },
  blink: { enabled: true, rate: 1 },
};
