import { z } from "zod";
import { ShapeSchema, Vec2Schema } from "./geometry.js";

const PinsSchema = z.record(z.string(), Vec2Schema);

const PartDefSchema = z
  .object({
    slot: z.string(),
    z: z.number(),
    pins: PinsSchema.default({}),
    shapes: z.array(ShapeSchema),
  })
  .passthrough();
export type PartDef = z.infer<typeof PartDefSchema>;

const HandShapeSchema = z
  .object({
    shapes: z.array(ShapeSchema),
    pins: PinsSchema.default({}),
  })
  .passthrough();
export type HandShape = z.infer<typeof HandShapeSchema>;

const FaceSlotSchema = z
  .object({
    anchor: Vec2Schema,
    z: z.number(),
    // シェイプセット: 表情名 → 形状群(Phase 1 は "neutral" のみ使用)
    shapes: z.record(z.string(), z.array(ShapeSchema)),
  })
  .passthrough();
export type FaceSlot = z.infer<typeof FaceSlotSchema>;

const StrandPhysicsSchema = z
  .object({
    stiffness: z.number().min(0).max(1),
    damping: z.number().min(0).max(1),
    inertia: z.number().min(0).max(1),
    maxAngle: z.number().min(0),
    gravity: z.number().min(0).max(1),
    segments: z.number().int().min(1).max(2),
  })
  .passthrough();
export type StrandPhysics = z.infer<typeof StrandPhysicsSchema>;

const StrandSchema = z
  .object({
    shapes: z.array(ShapeSchema),
    pin: Vec2Schema,
    physics: StrandPhysicsSchema,
  })
  .passthrough();
export type Strand = z.infer<typeof StrandSchema>;

export const CharacterDocSchema = z
  .object({
    formatVersion: z.literal(1),
    id: z.string(),
    name: z.string(),
    skeleton: z.literal("humanoid-v1"),
    palette: z.record(z.string(), z.string()),
    parts: z.array(PartDefSchema),
    hands: z.record(z.string(), HandShapeSchema).default({}),
    face: z.record(z.string(), FaceSlotSchema).default({}),
    hair: z
      .object({
        front: z.array(StrandSchema).default([]),
        mid: z.array(StrandSchema).default([]),
        back: z.array(StrandSchema).default([]),
      })
      .passthrough()
      .default({ front: [], mid: [], back: [] }),
    blink: z
      .object({ enabled: z.boolean(), rate: z.number().positive() })
      .passthrough()
      .default({ enabled: true, rate: 1 }),
  })
  .passthrough();
export type CharacterDoc = z.infer<typeof CharacterDocSchema>;

// 静止ポーズ表示に最低限必要なスロットとピン
const REQUIRED_PARTS: Record<string, string[]> = {
  torso: ["origin"],
  head: ["origin"],
  upperArmL: ["origin", "joint"],
  forearmL: ["origin", "joint"],
  upperArmR: ["origin", "joint"],
  forearmR: ["origin", "joint"],
  thighL: ["origin", "joint"],
  shinL: ["origin", "joint"],
  footL: ["origin"],
  thighR: ["origin", "joint"],
  shinR: ["origin", "joint"],
  footR: ["origin"],
};

export function validateCharacter(char: CharacterDoc): string[] {
  const issues: string[] = [];
  for (const [slot, pins] of Object.entries(REQUIRED_PARTS)) {
    const part = char.parts.find((p) => p.slot === slot);
    if (!part) {
      issues.push(`必須パーツがありません: ${slot}`);
      continue;
    }
    for (const pin of pins) {
      if (!part.pins[pin]) {
        issues.push(`ピン未設定: ${slot}.${pin}`);
      }
    }
  }
  if (!char.hands["open"]) {
    issues.push("ハンドシェイプ open がありません");
  }
  return issues;
}
