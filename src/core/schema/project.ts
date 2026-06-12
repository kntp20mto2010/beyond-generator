import { z } from "zod";
import { newId } from "../id.js";

// ---------------------------------------------------------------------------
// 共通: transform / 効果 / アクション / 表情キー
// ---------------------------------------------------------------------------

export const TransformSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    scale: z.number().positive().default(1),
    flipX: z.boolean().default(false),
  })
  .passthrough();
export type Transform = z.infer<typeof TransformSchema>;

export const EffectTypeSchema = z.enum([
  "cut",
  "fade",
  "slideL",
  "slideR",
  "slideT",
  "slideB",
  "pop",
]);
export type EffectType = z.infer<typeof EffectTypeSchema>;

export const EnterSchema = z
  .object({
    type: EffectTypeSchema.default("cut"),
    delay: z.number().min(0).default(0),
    dur: z.number().min(0).default(0.4),
  })
  .passthrough();
export type Enter = z.infer<typeof EnterSchema>;

export const ExitSchema = z
  .object({
    type: EffectTypeSchema.default("cut"),
    at: z.number().nullable().default(null), // null = シーン末まで居る
    dur: z.number().min(0).default(0.4),
  })
  .passthrough();
export type Exit = z.infer<typeof ExitSchema>;

export const ActionSchema = z
  .object({
    t: z.number().min(0),
    clip: z.string(), // CLIPS の id
    speed: z.number().positive().default(1),
    // 移動先(ステージ座標)。y省略 = 開始時のyを維持(横移動)。未指定 = 移動なし
    moveTo: z.object({ x: z.number(), y: z.number().optional() }).passthrough().optional(),
  })
  .passthrough();
export type Action = z.infer<typeof ActionSchema>;

export const ExpressionKeySchema = z
  .object({
    t: z.number().min(0),
    preset: z.string(), // EXPRESSION_PRESETS のキー
  })
  .passthrough();
export type ExpressionKey = z.infer<typeof ExpressionKeySchema>;

// ---------------------------------------------------------------------------
// カメラ / シーントランジション
// ---------------------------------------------------------------------------

export const CameraKeySchema = z
  .object({
    t: z.number().min(0),
    x: z.number(), // カメラ中心(ステージ座標)
    y: z.number(),
    zoom: z.number().positive().default(1),
    ease: z.string().optional(), // EasingName。未指定 = quadInOut
  })
  .passthrough();
export type CameraKey = z.infer<typeof CameraKeySchema>;

export const TransitionSchema = z
  .object({
    type: z.enum(["cut", "fade", "wipe", "slide"]).default("cut"),
    dur: z.number().min(0).default(0.5),
  })
  .passthrough();
export type Transition = z.infer<typeof TransitionSchema>;

// ---------------------------------------------------------------------------
// 要素(キャラ / テキスト)
// ---------------------------------------------------------------------------

export const CharacterElementSchema = z
  .object({
    id: z.string(),
    kind: z.literal("character"),
    ref: z.string(), // "builtin:template-a" | "characters/<id>.byc.json"
    transform: TransformSchema,
    z: z.number().default(0),
    locked: z.boolean().default(false),
    enter: EnterSchema.default({}),
    exit: ExitSchema.default({}),
    actions: z.array(ActionSchema).default([]),
    expressions: z.array(ExpressionKeySchema).default([]),
  })
  .passthrough();
export type CharacterElement = z.infer<typeof CharacterElementSchema>;

export const TextElementSchema = z
  .object({
    id: z.string(),
    kind: z.literal("text"),
    text: z.string(),
    size: z.number().positive().default(48),
    color: z.string().default("#2E2A33"),
    strokeColor: z.string().nullable().default(null), // 縁取り(null=なし)
    strokeWidth: z.number().min(0).default(6),
    transform: TransformSchema,
    z: z.number().default(100),
    locked: z.boolean().default(false),
    enter: EnterSchema.default({}),
    exit: ExitSchema.default({}),
  })
  .passthrough();
export type TextElement = z.infer<typeof TextElementSchema>;

// 吹き出し(角丸 / 雲 / トゲ)。中心(0,0)に w×h を描き、しっぽ先端は要素ローカル座標
export const BalloonElementSchema = z
  .object({
    id: z.string(),
    kind: z.literal("balloon"),
    shape: z.enum(["round", "cloud", "spike"]).default("round"),
    text: z.string(),
    size: z.number().positive().default(40), // フォントサイズ
    w: z.number().positive().default(420),
    h: z.number().positive().default(240),
    fill: z.string().default("#ffffff"),
    textColor: z.string().default("#2E2A33"),
    lineColor: z.string().default("#2E2A33"),
    lineWidth: z.number().min(0).default(4),
    tail: z.object({ x: z.number(), y: z.number() }).default({ x: -60, y: 220 }),
    transform: TransformSchema,
    z: z.number().default(200),
    locked: z.boolean().default(false),
    enter: EnterSchema.default({}),
    exit: ExitSchema.default({}),
  })
  .passthrough();
export type BalloonElement = z.infer<typeof BalloonElementSchema>;

export const SceneElementSchema = z.discriminatedUnion("kind", [
  CharacterElementSchema,
  TextElementSchema,
  BalloonElementSchema,
]);
export type SceneElement = z.infer<typeof SceneElementSchema>;

// ---------------------------------------------------------------------------
// シーン / プロジェクト
// ---------------------------------------------------------------------------

export const SceneDocSchema = z
  .object({
    id: z.string(),
    duration: z.number(),
    durationMode: z.literal("manual"),
    background: z
      .object({
        color: z.string().optional(),
        // リポジトリ/プロジェクト相対パスの画像(devはHTTP配信、FS解決はPhase 4b)
        image: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .default(null), // null = 紙色 #f4f1ec
    camera: z.array(CameraKeySchema).default([]),
    // 前シーンからこのシーンへの切替効果。scenes[0] は無視(常にcut)
    transition: TransitionSchema.default({}),
    elements: z.array(SceneElementSchema).default([]),
    seed: z.number(),
  })
  .passthrough();

export type SceneDoc = z.infer<typeof SceneDocSchema>;

export const StageSchema = z
  .object({
    w: z.literal(1920),
    h: z.literal(1080),
    fps: z.literal(30),
  })
  .passthrough();

export const ProjectDocSchema = z
  .object({
    formatVersion: z.literal(1),
    id: z.string(),
    title: z.string(),
    stage: StageSchema,
    bgm: z.array(z.unknown()),
    scenes: z.array(SceneDocSchema),
  })
  .passthrough();

export type ProjectDoc = z.infer<typeof ProjectDocSchema>;

export const PAPER_COLOR = "#f4f1ec";

export function createEmptyProject(): ProjectDoc {
  return {
    formatVersion: 1,
    id: newId(),
    title: "新しいプロジェクト",
    stage: { w: 1920, h: 1080, fps: 30 },
    bgm: [],
    scenes: [],
  };
}

export function createEmptyScene(seed: number): SceneDoc {
  return {
    id: newId(),
    duration: 4.0,
    durationMode: "manual",
    background: null,
    camera: [],
    transition: { type: "cut", dur: 0.5 },
    elements: [],
    seed,
  };
}
