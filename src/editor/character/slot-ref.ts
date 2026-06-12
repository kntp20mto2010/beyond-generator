import type { CharacterDoc } from "../../core/schema/character.js";
import type { Shape, Vec2 } from "../../core/schema/geometry.js";
import { HAIR_Z, HAND_Z } from "../../runtime/skeleton.js";

export type SlotRef =
  | { kind: "part"; slot: string }
  | { kind: "face"; slot: string; variant?: string }
  | { kind: "hair"; layer: "front" | "mid" | "back"; index: number }
  | { kind: "hand"; name: string };

export function refKey(ref: SlotRef): string {
  switch (ref.kind) {
    case "part": return `part:${ref.slot}`;
    case "face": return `face:${ref.slot}:${ref.variant ?? "neutral"}`;
    case "hair": return `hair:${ref.layer}:${ref.index}`;
    case "hand": return `hand:${ref.name}`;
  }
}

const PART_LABELS: Record<string, string> = {
  torso: "胴",
  head: "頭",
  upperArmL: "上腕L",
  upperArmR: "上腕R",
  forearmL: "前腕L",
  forearmR: "前腕R",
  thighL: "太腿L",
  thighR: "太腿R",
  shinL: "脛L",
  shinR: "脛R",
  footL: "足L",
  footR: "足R",
};

const FACE_LABELS: Record<string, string> = {
  browL: "眉L",
  browR: "眉R",
  eyeL: "目L",
  eyeR: "目R",
  mouth: "口",
  nose: "鼻",
};

const HAIR_LAYER_LABELS: Record<string, string> = {
  back: "髪(後)",
  mid: "髪(中)",
  front: "髪(前)",
};

export function refLabel(ref: SlotRef): string {
  switch (ref.kind) {
    case "part":
      return PART_LABELS[ref.slot] ?? ref.slot;
    case "face":
      return FACE_LABELS[ref.slot] ?? ref.slot;
    case "hair":
      return `${HAIR_LAYER_LABELS[ref.layer] ?? ref.layer}[${ref.index}]`;
    case "hand":
      return `手(${ref.name})`;
  }
}

const PART_ORDER = [
  "torso", "head",
  "upperArmL", "forearmL",
  "upperArmR", "forearmR",
  "thighL", "shinL", "footL",
  "thighR", "shinR", "footR",
];

export function listSlotRefs(char: CharacterDoc): SlotRef[] {
  const refs: SlotRef[] = [];

  // body parts in canonical order, then any extra parts
  const orderedSlots = PART_ORDER.filter((s) =>
    char.parts.some((p) => p.slot === s)
  );
  const extraSlots = char.parts
    .map((p) => p.slot)
    .filter((s) => !PART_ORDER.includes(s));
  for (const slot of [...orderedSlots, ...extraSlots]) {
    refs.push({ kind: "part", slot });
  }

  // face slots
  for (const slot of Object.keys(char.face)) {
    refs.push({ kind: "face", slot });
  }

  // hair: back, mid, front
  for (const layer of ["back", "mid", "front"] as const) {
    char.hair[layer].forEach((_, i) => {
      refs.push({ kind: "hair", layer, index: i });
    });
  }

  // hands
  for (const name of Object.keys(char.hands)) {
    refs.push({ kind: "hand", name });
  }

  return refs;
}

export function getShapes(
  char: CharacterDoc,
  ref: SlotRef,
): readonly Shape[] | undefined {
  switch (ref.kind) {
    case "part": {
      const part = char.parts.find((p) => p.slot === ref.slot);
      return part?.shapes;
    }
    case "face": {
      const face = char.face[ref.slot];
      if (!face) return undefined;
      const variantName = ref.variant ?? "neutral";
      return face.shapes[variantName] ?? face.shapes["neutral"] ?? Object.values(face.shapes)[0];
    }
    case "hair": {
      const strand = char.hair[ref.layer][ref.index];
      return strand?.shapes;
    }
    case "hand": {
      const hand = char.hands[ref.name];
      return hand?.shapes;
    }
  }
}

export function getPins(
  char: CharacterDoc,
  ref: SlotRef,
): Record<string, Vec2> {
  switch (ref.kind) {
    case "part": {
      const part = char.parts.find((p) => p.slot === ref.slot);
      return part?.pins ?? {};
    }
    case "face": {
      const face = char.face[ref.slot];
      if (!face) return {};
      return { anchor: face.anchor };
    }
    case "hair": {
      const strand = char.hair[ref.layer][ref.index];
      if (!strand) return {};
      return { pin: strand.pin };
    }
    case "hand": {
      const hand = char.hands[ref.name];
      return hand?.pins ?? {};
    }
  }
}

export function getZ(char: CharacterDoc, ref: SlotRef): number | undefined {
  switch (ref.kind) {
    case "part": {
      const part = char.parts.find((p) => p.slot === ref.slot);
      return part?.z;
    }
    case "face": {
      return char.face[ref.slot]?.z;
    }
    case "hair": {
      return HAIR_Z[ref.layer];
    }
    case "hand": {
      // hands don't have a canonical single z, use L side
      return HAND_Z["handL"];
    }
  }
}
