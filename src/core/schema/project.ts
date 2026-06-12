import { z } from "zod";
import { newId } from "../id.js";

export const SceneDocSchema = z
  .object({
    id: z.string(),
    duration: z.number(),
    durationMode: z.literal("manual"),
    background: z.null(),
    camera: z.array(z.unknown()),
    elements: z.array(z.unknown()),
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
    elements: [],
    seed,
  };
}
