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

// セリフ音声。長さはバッファ実長から導出(差し替えで自動追従)するためスキーマに持たない
export const TalkSchema = z
  .object({
    t: z.number().min(0),
    audio: z.string(), // "assets/audio/vo-001.wav"(リポジトリ配信 or プロジェクト相対)
    gain: z.number().min(0).default(1),
  })
  .passthrough();
export type Talk = z.infer<typeof TalkSchema>;

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
    talks: z.array(TalkSchema).default([]), // t昇順で保持
  })
  .passthrough();
export type CharacterElement = z.infer<typeof CharacterElementSchema>;

// プロジェクトBGM(v1はUI上1本のみ扱う)
export const BgmSchema = z
  .object({
    audio: z.string(),
    gain: z.number().min(0).default(0.5),
    loop: z.boolean().default(true),
  })
  .passthrough();
export type Bgm = z.infer<typeof BgmSchema>;

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

// オブジェクト(家具/小物)。透過PNGをステージに配置。グリッドスナップで整列。
// アンカーは下端中央(transform.x,y = 接地点)。
export const ObjectElementSchema = z
  .object({
    id: z.string(),
    kind: z.literal("object"),
    src: z.string(), // リポジトリ相対の画像パス(例 "assets/objects/sofa-navy-2seat.png")
    // グリッド footprint(セル数)。サイズはこの n×m セルで管理し、画像はアスペクト
    // 保持で箱に contain する。transform.scale はその contain 値(セルから導出)。
    cells: z
      .object({ w: z.number().int().positive(), h: z.number().int().positive() })
      .default({ w: 4, h: 3 }),
    transform: TransformSchema,
    z: z.number().default(-10), // 既定はキャラ(z=0)の奥
    locked: z.boolean().default(false),
    enter: EnterSchema.default({}),
    exit: ExitSchema.default({}),
  })
  .passthrough();
export type ObjectElement = z.infer<typeof ObjectElementSchema>;

export const SceneElementSchema = z.discriminatedUnion("kind", [
  CharacterElementSchema,
  TextElementSchema,
  BalloonElementSchema,
  ObjectElementSchema,
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
    // 横スクロール: 指定キャラ element id を追ってカメラ x を自動追従。未設定/null=固定/手動カメラキー
    // (.optional で未設定時はキー自体を持たない → 既存シーンの round-trip を壊さない)
    cameraFollowId: z.string().nullable().optional(),
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
    bgm: z.array(BgmSchema), // 旧ファイルは空配列なので互換OK。v1はUI上1本のみ
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
