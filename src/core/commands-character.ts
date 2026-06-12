import type { Draft } from "immer";
import type { DocStore } from "./doc-store.js";
import type { CharacterDoc, PartDef } from "./schema/character.js";
import type { Shape, Vec2 } from "./schema/geometry.js";
import {
  mirrorFaceSlot,
  mirrorHairMidIndex,
  mirrorPartSlot,
  mirrorPins,
  mirrorShape,
} from "./mirror.js";
import type { SlotRef } from "../editor/character/slot-ref.js";
import { refKey } from "../editor/character/slot-ref.js";

// ---------------------------------------------------------------------------
// Draft helpers
// ---------------------------------------------------------------------------

function resolveShapesDraft(
  draft: Draft<CharacterDoc>,
  ref: SlotRef,
): Draft<Shape>[] | null {
  switch (ref.kind) {
    case "part": {
      const part = draft.parts.find((p) => p.slot === ref.slot);
      return part ? (part.shapes as Draft<Shape>[]) : null;
    }
    case "face": {
      const face = draft.face[ref.slot];
      if (!face) return null;
      const variantName = ref.variant ?? "neutral";
      const shapes = face.shapes[variantName];
      return shapes ? (shapes as Draft<Shape>[]) : null;
    }
    case "hair": {
      const strand = draft.hair[ref.layer][ref.index];
      return strand ? (strand.shapes as Draft<Shape>[]) : null;
    }
    case "hand": {
      const hand = draft.hands[ref.name];
      return hand ? (hand.shapes as Draft<Shape>[]) : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function setName(
  store: DocStore<CharacterDoc>,
  name: string,
): void {
  store.dispatch("名前変更", (d) => { d.name = name; }, { mergeKey: "name" });
}

export function setPaletteColor(
  store: DocStore<CharacterDoc>,
  slot: string,
  color: string,
): void {
  store.dispatch(
    "パレット変更",
    (d) => { d.palette[slot] = color; },
    { mergeKey: `palette:${slot}` },
  );
}

export function addShape(
  store: DocStore<CharacterDoc>,
  ref: SlotRef,
  shape: Shape,
): void {
  store.dispatch("シェイプ追加", (d) => {
    const shapes = resolveShapesDraft(d, ref);
    if (shapes) shapes.push(shape as Draft<Shape>);
  });
}

export function removeShape(
  store: DocStore<CharacterDoc>,
  ref: SlotRef,
  index: number,
): void {
  store.dispatch("シェイプ削除", (d) => {
    const shapes = resolveShapesDraft(d, ref);
    if (shapes && index >= 0 && index < shapes.length) {
      shapes.splice(index, 1);
    }
  });
}

export function updateShape(
  store: DocStore<CharacterDoc>,
  ref: SlotRef,
  index: number,
  patch: Partial<Shape>,
  mergeKey?: string,
): void {
  const key = mergeKey ?? `shape:${refKey(ref)}:${index}`;
  store.dispatch(
    "シェイプ編集",
    (d) => {
      const shapes = resolveShapesDraft(d, ref);
      if (!shapes) return;
      const shape = shapes[index];
      if (!shape) return;
      Object.assign(shape, patch);
    },
    { mergeKey: key },
  );
}

export function movePin(
  store: DocStore<CharacterDoc>,
  ref: SlotRef,
  pinName: string,
  pos: Vec2,
): void {
  store.dispatch(
    "ピン移動",
    (d) => {
      switch (ref.kind) {
        case "part": {
          const part = d.parts.find((p) => p.slot === ref.slot);
          if (part) (part.pins as Record<string, Vec2>)[pinName] = [pos[0], pos[1]];
          break;
        }
        case "face": {
          const face = d.face[ref.slot];
          if (face && pinName === "anchor") {
            face.anchor = [pos[0], pos[1]];
          }
          break;
        }
        case "hair": {
          const strand = d.hair[ref.layer][ref.index];
          if (strand && pinName === "pin") {
            strand.pin = [pos[0], pos[1]];
          }
          break;
        }
        case "hand": {
          const hand = d.hands[ref.name];
          if (hand) (hand.pins as Record<string, Vec2>)[pinName] = [pos[0], pos[1]];
          break;
        }
      }
    },
    { mergeKey: `pin:${refKey(ref)}:${pinName}` },
  );
}

export function setPartZ(
  store: DocStore<CharacterDoc>,
  slot: string,
  z: number,
): void {
  store.dispatch("Z順変更", (d) => {
    const part = d.parts.find((p) => p.slot === slot);
    if (part) part.z = z;
  });
}

export function mirrorLR(
  store: DocStore<CharacterDoc>,
  fromRef: SlotRef,
): void {
  store.dispatch("ミラーコピー", (d) => {
    switch (fromRef.kind) {
      case "part": {
        const toSlot = mirrorPartSlot(fromRef.slot);
        if (!toSlot) return;
        const fromPart = d.parts.find((p) => p.slot === fromRef.slot);
        if (!fromPart) return;
        let toPart = d.parts.find((p) => p.slot === toSlot);
        const mirroredShapes = (fromPart.shapes as Shape[]).map(mirrorShape);
        const mirroredPins = mirrorPins(fromPart.pins as Record<string, Vec2>);
        if (toPart) {
          (toPart.shapes as Shape[]) = mirroredShapes;
          (toPart.pins as Record<string, Vec2>) = mirroredPins;
        } else {
          const newPart: PartDef = {
            slot: toSlot,
            z: fromPart.z,
            pins: mirroredPins,
            shapes: mirroredShapes,
          };
          d.parts.push(newPart as Draft<PartDef>);
        }
        break;
      }
      case "face": {
        const toSlot = mirrorFaceSlot(fromRef.slot);
        if (!toSlot) return;
        const fromFace = d.face[fromRef.slot];
        if (!fromFace) return;
        const variantName = fromRef.variant ?? "neutral";
        const srcShapes = fromFace.shapes[variantName] as Shape[] | undefined;
        const mirroredShapes = srcShapes?.map(mirrorShape) ?? [];
        const mirroredAnchor = mirrorPins({ anchor: fromFace.anchor as Vec2 });
        const toFace = d.face[toSlot];
        if (toFace) {
          toFace.shapes[variantName] = mirroredShapes;
          toFace.anchor = mirroredAnchor["anchor"] as Vec2;
        } else {
          d.face[toSlot] = {
            anchor: mirroredAnchor["anchor"] as Vec2,
            z: fromFace.z,
            shapes: { [variantName]: mirroredShapes },
          };
        }
        break;
      }
      case "hair": {
        if (fromRef.layer !== "mid") return;
        const toIndex = mirrorHairMidIndex(fromRef.index);
        if (toIndex === null) return;
        const fromStrand = d.hair.mid[fromRef.index];
        if (!fromStrand) return;
        const mirroredShapes = (fromStrand.shapes as Shape[]).map(mirrorShape);
        const mirroredPin = mirrorPins({ pin: fromStrand.pin as Vec2 });
        const toStrand = d.hair.mid[toIndex];
        if (toStrand) {
          (toStrand.shapes as Shape[]) = mirroredShapes;
          toStrand.pin = mirroredPin["pin"] as Vec2;
        }
        break;
      }
      case "hand":
        // 手は実行時ミラーなので編集ミラーは不要
        break;
    }
  });
}

export function addFaceVariant(
  store: DocStore<CharacterDoc>,
  slot: string,
  name: string,
  copyFromNeutral = true,
): void {
  store.dispatch("バリアント追加", (d) => {
    const face = d.face[slot];
    if (!face) return;
    if (face.shapes[name]) return; // 既存は上書きしない
    const src = copyFromNeutral ? (face.shapes["neutral"] as Shape[] | undefined) : undefined;
    // JSON往復でImmerドラフトから切り離したコピーを作る
    face.shapes[name] = src ? (JSON.parse(JSON.stringify(src)) as Draft<Shape>[]) : [];
  });
}

export function removeFaceVariant(
  store: DocStore<CharacterDoc>,
  slot: string,
  name: string,
): void {
  if (name === "neutral") return; // neutral は削除禁止
  store.dispatch("バリアント削除", (d) => {
    const face = d.face[slot];
    if (!face) return;
    delete face.shapes[name];
  });
}

export function updateStrandPhysics(
  store: DocStore<CharacterDoc>,
  ref: SlotRef,
  patch: Partial<import("./schema/character.js").StrandPhysics>,
  mergeKey?: string,
): void {
  if (ref.kind !== "hair") return;
  const key = mergeKey ?? `physics:${refKey(ref)}`;
  store.dispatch(
    "物理パラメータ変更",
    (d) => {
      const strand = d.hair[ref.layer][ref.index];
      if (!strand) return;
      Object.assign(strand.physics, patch);
    },
    { mergeKey: key },
  );
}
