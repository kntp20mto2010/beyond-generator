import { z } from "zod";

// ---------------------------------------------------------------------------
// 約49語彙 enum(spec/12 §1)。生成段階で hallucination を弾く厳格制限
// ---------------------------------------------------------------------------

// clip ∈ {idle,walk,run,talk1,talk2,point,wave,nod,headShake,jump}
export const ClipNameSchema = z.enum([
  "idle",
  "walk",
  "run",
  "talk1",
  "talk2",
  "point",
  "wave",
  "nod",
  "headShake",
  "jump",
]);
export type ClipName = z.infer<typeof ClipNameSchema>;

// preset ∈ {neutral,smile,laugh,sad,cry,angry,surprised,worried,smug,tired}
export const PresetNameSchema = z.enum([
  "neutral",
  "smile",
  "laugh",
  "sad",
  "cry",
  "angry",
  "surprised",
  "worried",
  "smug",
  "tired",
]);
export type PresetName = z.infer<typeof PresetNameSchema>;

// shape ∈ {round,cloud,spike}
export const BalloonShapeSchema = z.enum(["round", "cloud", "spike"]);
export type BalloonShape = z.infer<typeof BalloonShapeSchema>;

// effect ∈ {cut,fade,slideL,slideR,slideT,slideB,pop}
export const EffectNameSchema = z.enum([
  "cut",
  "fade",
  "slideL",
  "slideR",
  "slideT",
  "slideB",
  "pop",
]);
export type EffectName = z.infer<typeof EffectNameSchema>;

// transition ∈ {cut,fade,wipe,slide}
export const TransitionNameSchema = z.enum(["cut", "fade", "wipe", "slide"]);
export type TransitionName = z.infer<typeof TransitionNameSchema>;

// 発話 shot の clip(talk のみ)
export const TalkClipSchema = z.enum(["talk1", "talk2"]);

// 動作 shot の do(clip 語彙のうち非talk)
export const DoNameSchema = z.enum([
  "idle",
  "walk",
  "run",
  "point",
  "wave",
  "nod",
  "headShake",
  "jump",
]);
export type DoName = z.infer<typeof DoNameSchema>;

// ---------------------------------------------------------------------------
// 配置(離散プレース or 明示座標)
// ---------------------------------------------------------------------------

export const PlaceNameSchema = z.enum([
  "farLeft",
  "left",
  "centerLeft",
  "center",
  "centerRight",
  "right",
  "farRight",
]);
export type PlaceName = z.infer<typeof PlaceNameSchema>;

export const PlaceSchema = z.union([
  PlaceNameSchema,
  z.object({ x: z.number(), y: z.number().optional() }),
]);
export type Place = z.infer<typeof PlaceSchema>;

// ---------------------------------------------------------------------------
// cast / shot / scene / story
// ---------------------------------------------------------------------------

export const CastSchema = z.object({
  id: z.string(),
  ref: z.string(),
  at: PlaceSchema,
  scale: z.number().positive().optional(),
  face: z.enum(["left", "right"]).optional(),
  mood: PresetNameSchema.optional(),
  enter: EffectNameSchema.optional(),
});
export type Cast = z.infer<typeof CastSchema>;

export const BalloonOverrideSchema = z.object({
  shape: BalloonShapeSchema.optional(),
  at: PlaceSchema.optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  fill: z.string().optional(),
  keep: z.boolean().optional(),
  tail: z
    .union([z.literal("auto"), z.object({ x: z.number(), y: z.number() })])
    .default("auto"),
});
export type BalloonOverride = z.infer<typeof BalloonOverrideSchema>;

export const CameraShotSchema = z.union([
  z.literal("reset"),
  z.object({
    on: z.union([z.string(), PlaceSchema]).optional(),
    zoom: z.number().positive().default(1.35),
    ease: z.string().optional(),
  }),
]);
export type CameraShot = z.infer<typeof CameraShotSchema>;

export const ShotSchema = z.object({
  // 発話(最頻)
  who: z.string().optional(),
  line: z.string().optional(),
  emotion: PresetNameSchema.optional(),
  clip: TalkClipSchema.optional(),
  voice: z.string().optional(),
  silent: z.boolean().default(false),
  balloon: BalloonOverrideSchema.optional(),
  // 動作
  do: DoNameSchema.optional(),
  walkTo: PlaceSchema.optional(),
  runTo: PlaceSchema.optional(),
  speed: z.number().positive().default(1),
  // 演出
  camera: CameraShotSchema.optional(),
  caption: z.string().optional(),
  // timing(基本書かない。書けば固定アンカー)
  at: z.number().optional(),
  after: z
    .union([z.literal("prev"), z.literal("prevStart"), z.number()])
    .optional(),
  gap: z.number().optional(),
  hold: z.number().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type Shot = z.infer<typeof ShotSchema>;

export const SceneTransitionSchema = z
  .union([
    TransitionNameSchema,
    z.object({ type: TransitionNameSchema, dur: z.number().min(0) }),
  ])
  .default("cut");

export const SceneSchema = z.object({
  id: z.string().optional(),
  bg: z.string().nullable().optional(),
  transition: SceneTransitionSchema,
  duration: z.number().positive().optional(),
  hold: z.number().min(0).default(0.5),
  cast: z.array(CastSchema).min(1),
  shots: z.array(ShotSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

export const StoryDefaultsSchema = z
  .object({
    charPerSec: z.number().positive().default(5.5), // VOICEVOX実測≈4.45発話字/秒(spec/12 §7)
    gapSec: z.number().min(0).default(0.25),
    balloonShape: BalloonShapeSchema.default("round"),
    scale: z.number().positive().default(0.9),
    groundY: z.number().default(700),
  })
  .default({});
export type StoryDefaults = z.infer<typeof StoryDefaultsSchema>;

export const StoryBgmSchema = z.union([
  z.string(),
  z.object({
    audio: z.string(),
    gain: z.number().min(0).default(0.5),
    loop: z.boolean().default(true),
  }),
]);

export const StorySchema = z.object({
  format: z.literal("byond-story/1"),
  id: z.string().optional(),
  title: z.string(),
  defaults: StoryDefaultsSchema,
  bgm: StoryBgmSchema.optional(),
  audioDurations: z.record(z.string(), z.number().positive()).default({}),
  scenes: z.array(SceneSchema).min(1),
});
export type Story = z.infer<typeof StorySchema>;

// ---------------------------------------------------------------------------
// parseStory: 語彙外 clip/preset を含む Story を reject
// ---------------------------------------------------------------------------

export function parseStory(json: string | unknown): Story {
  let raw: unknown;
  if (typeof json === "string") {
    try {
      raw = JSON.parse(json) as unknown;
    } catch {
      throw new Error("台本JSONの解析に失敗しました");
    }
  } else {
    raw = json;
  }
  const result = StorySchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`台本スキーマ検証エラー: ${result.error.message}`);
  }
  return result.data;
}
