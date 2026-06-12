import { z } from "zod";

export const Vec2Schema = z.tuple([z.number(), z.number()]);
export type Vec2 = z.infer<typeof Vec2Schema>;

// "@slotName"(パレット参照)or "#RRGGBB"
const FillSchema = z.string();

const StrokeSchema = z
  .object({ color: FillSchema, width: z.number().positive() })
  .passthrough();

const PathCmdSchema = z.discriminatedUnion("c", [
  z.object({ c: z.literal("M"), p: Vec2Schema }),
  z.object({ c: z.literal("L"), p: Vec2Schema }),
  z.object({ c: z.literal("Q"), cp: Vec2Schema, p: Vec2Schema }),
  z.object({ c: z.literal("C"), cp1: Vec2Schema, cp2: Vec2Schema, p: Vec2Schema }),
  z.object({ c: z.literal("Z") }),
]);
export type PathCmd = z.infer<typeof PathCmdSchema>;

const shapeStyle = {
  fill: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
};

export const ShapeSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("rect"),
        x: z.number(),
        y: z.number(),
        w: z.number().positive(),
        h: z.number().positive(),
        r: z.number().min(0).optional(),
        ...shapeStyle,
      })
      .passthrough(),
    z
      .object({
        kind: z.literal("ellipse"),
        cx: z.number(),
        cy: z.number(),
        rx: z.number().positive(),
        ry: z.number().positive(),
        ...shapeStyle,
      })
      .passthrough(),
    z
      .object({
        kind: z.literal("polygon"),
        points: z.array(Vec2Schema).min(3),
        ...shapeStyle,
      })
      .passthrough(),
    z
      .object({
        kind: z.literal("path"),
        d: z.array(PathCmdSchema).min(2),
        ...shapeStyle,
      })
      .passthrough(),
  ])
  .refine((s) => s.fill !== undefined || s.stroke !== undefined, {
    message: "fill か stroke の少なくとも一方が必要です",
  });
export type Shape = z.infer<typeof ShapeSchema>;

const MISSING_COLOR = "#FF00FF";

export function resolveFill(
  fill: string,
  palette: Record<string, string>,
): string {
  if (fill.startsWith("@")) {
    return palette[fill.slice(1)] ?? MISSING_COLOR;
  }
  return fill;
}
