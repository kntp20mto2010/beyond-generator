import { z } from "zod";

// キー = [時刻(秒), 値, イージング?]。イージングはそのキーから次のキーまでの区間に適用
const EasingNameSchema = z.enum([
  "linear",
  "sineInOut",
  "quadIn",
  "quadOut",
  "quadInOut",
  "backOut",
  "bounceOut",
]);

const KeySchema = z.union([
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), EasingNameSchema]),
]);
export type ClipKey = z.infer<typeof KeySchema>;

const KeysSchema = z.array(KeySchema).min(1);

export const ClipDocSchema = z
  .object({
    formatVersion: z.literal(1),
    id: z.string(),
    label: z.string(),
    duration: z.number().positive(),
    loop: z.boolean(),
    // その場再生時の仮想移動速度 [u/s](髪物理トレッドミル・将来のmoveTo同期用)
    virtualVelocity: z.number().optional(),
    tracks: z
      .object({
        bones: z.record(z.string(), z.object({ rot: KeysSchema.optional() }).passthrough()).default({}),
        root: z.object({ x: KeysSchema.optional(), y: KeysSchema.optional() }).passthrough().default({}),
        handShape: z.array(z.tuple([z.number(), z.string()])).default([]),
      })
      .passthrough()
      .default({ bones: {}, root: {}, handShape: [] }),
  })
  .passthrough();
export type ClipDoc = z.infer<typeof ClipDocSchema>;

// ループクリップの規約: 最終キーは先頭キーと同じ値で明示的に閉じる(暗黙のwrap補間はしない)
