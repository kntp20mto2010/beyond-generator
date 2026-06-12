import type { StrandPhysics } from "../core/schema/character.js";

export const HAIR_PHYSICS_PRESETS: Record<string, { label: string } & StrandPhysics> = {
  short:  { label: "ショート",      stiffness: 0.7,  damping: 0.85, inertia: 0.45, maxAngle: 12, gravity: 0.08, segments: 1 },
  bob:    { label: "ボブ",          stiffness: 0.55, damping: 0.8,  inertia: 0.6,  maxAngle: 18, gravity: 0.15, segments: 1 },
  long:   { label: "ロング",        stiffness: 0.35, damping: 0.75, inertia: 0.8,  maxAngle: 30, gravity: 0.3,  segments: 2 },
  pony:   { label: "ポニーテール",  stiffness: 0.45, damping: 0.7,  inertia: 0.85, maxAngle: 38, gravity: 0.45, segments: 2 },
  ahoge:  { label: "アホ毛",        stiffness: 0.25, damping: 0.55, inertia: 0.9,  maxAngle: 45, gravity: 0.05, segments: 2 },
};
