import type { CharacterDoc } from "../core/schema/character.js";
import type { Shape, Vec2 } from "../core/schema/geometry.js";
import type { FaceResolution } from "./expression.js";
import {
  type Mat2D,
  MIRROR_X,
  mul,
  rotationDeg,
  scaling,
  translation,
} from "./mat2d.js";
import {
  type BoneId,
  HAIR_Z,
  HAND_Z,
  HUMANOID_V1,
  SLOT_BONE,
} from "./skeleton.js";

// 回転はレストポーズ(描いたまま)からの差分。+deg = 画面上時計回り
export type PoseRotations = Partial<Record<BoneId, number>>;

export interface Pose {
  rotations?: PoseRotations;
  rootOffset?: Vec2;
}

export interface BoneState {
  world: Mat2D; // キャラ空間(レスト) → ポーズ適用後空間
  origin: Vec2; // レスト原点(キャラ空間)
}

export type BoneWorld = ReadonlyMap<BoneId, BoneState>;

// W_bone = W_parent ∘ T(origin - parentOrigin) ∘ R(θ)
export function computeBoneWorld(char: CharacterDoc, pose: Pose): BoneWorld {
  const rotations = pose.rotations ?? {};
  const result = new Map<BoneId, BoneState>();

  for (const bone of HUMANOID_V1) {
    let origin: Vec2;
    if (bone.originFrom === null) {
      origin = [0, 0];
    } else {
      const part = char.parts.find((p) => p.slot === bone.originFrom?.slot);
      const pin = part?.pins[bone.originFrom.pin];
      if (!pin) continue; // パーツ/ピン未完成のボーンは子ごとスキップ(編集途中を許容)
      origin = pin;
    }

    const theta = rotations[bone.id] ?? 0;
    let world: Mat2D;
    if (bone.parent === null) {
      const [ox, oy] = pose.rootOffset ?? [0, 0];
      world = mul(translation(ox, oy), rotationDeg(theta));
    } else {
      const parent = result.get(bone.parent);
      if (!parent) continue;
      const rel = translation(
        origin[0] - parent.origin[0],
        origin[1] - parent.origin[1],
      );
      world = mul(mul(parent.world, rel), rotationDeg(theta));
    }
    result.set(bone.id, { world, origin });
  }
  return result;
}

export interface RenderItem {
  key: string;
  z: number;
  shapes: readonly Shape[];
  // キャラ空間で作画された形状 → ポーズ適用後空間(W_bone ∘ T(-origin)、手のRは ∘ MIRROR_X)
  matrix: Mat2D;
}

function itemMatrix(state: BoneState, mirror = false): Mat2D {
  const toLocal = translation(-state.origin[0], -state.origin[1]);
  const m = mul(state.world, toLocal);
  return mirror ? mul(m, MIRROR_X) : m;
}

// 髪物理などの外部入力用: headのデカール行列(キャラ空間→ワールド)
export function headDecalMatrix(bones: BoneWorld): Mat2D | null {
  const head = bones.get("head");
  return head ? itemMatrix(head) : null;
}

export interface RenderListOptions {
  handShape?: string;
  face?: ReadonlyMap<string, FaceResolution>; // resolveFace の結果(省略時 neutral)
  hairDeform?: ReadonlyMap<string, Mat2D>; // HairSimulator.getDeforms の結果(キャラ空間)
}

export function buildRenderList(
  char: CharacterDoc,
  bones: BoneWorld,
  opts: RenderListOptions = {},
): RenderItem[] {
  const items: RenderItem[] = [];

  for (const part of char.parts) {
    const boneId = SLOT_BONE[part.slot];
    const state = boneId ? bones.get(boneId) : undefined;
    if (!state) continue;
    items.push({
      key: `part:${part.slot}`,
      z: part.z,
      shapes: part.shapes,
      matrix: itemMatrix(state),
    });
  }

  // 手: L側で作画された1セットを両手に適用(Rは実行時ミラー)
  const hand = char.hands[opts.handShape ?? "open"] ?? char.hands["open"];
  if (hand) {
    for (const side of ["handL", "handR"] as const) {
      const state = bones.get(side);
      if (!state) continue;
      items.push({
        key: `hand:${side}`,
        z: HAND_Z[side],
        shapes: hand.shapes,
        matrix: itemMatrix(state, side === "handR"),
      });
    }
  }

  const head = bones.get("head");
  if (head) {
    for (const [slot, face] of Object.entries(char.face)) {
      const res = opts.face?.get(slot);
      const shapeName = res?.shapeName ?? "neutral";
      const shapes =
        face.shapes[shapeName] ?? face.shapes["neutral"] ?? Object.values(face.shapes)[0];
      if (!shapes) continue;

      let m = itemMatrix(head);
      if (res) {
        if (res.offset[0] !== 0 || res.offset[1] !== 0) {
          m = mul(m, translation(res.offset[0], res.offset[1]));
        }
        if (res.squashY !== undefined) {
          const [ax, ay] = face.anchor;
          m = mul(
            m,
            mul(translation(ax, ay), mul(scaling(1, res.squashY), translation(-ax, -ay))),
          );
        }
      }
      items.push({ key: `face:${slot}`, z: face.z, shapes, matrix: m });
    }

    for (const layer of ["back", "mid", "front"] as const) {
      const strands = char.hair[layer];
      strands.forEach((strand, i) => {
        const key = `hair:${layer}:${i}`;
        const deform = opts.hairDeform?.get(key);
        const m = deform ? mul(itemMatrix(head), deform) : itemMatrix(head);
        items.push({
          key,
          z: HAIR_Z[layer] + i * 0.01,
          shapes: strand.shapes,
          matrix: m,
        });
      });
    }
  }

  items.sort((p, q) => p.z - q.z);
  return items;
}
