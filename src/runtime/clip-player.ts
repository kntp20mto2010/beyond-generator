import type { ClipDoc, ClipKey } from "../core/schema/clip.js";
import type { Vec2 } from "../core/schema/geometry.js";
import { ease, type EasingName } from "./easing.js";
import type { Pose, PoseRotations } from "./pose.js";
import type { BoneId } from "./skeleton.js";

export interface ClipFrame {
  pose: Pose;
  handShape?: string;
  virtualVelocity: number;
}

function sampleKeys(keys: readonly ClipKey[], t: number): number {
  const first = keys[0];
  if (!first) return 0;
  if (t <= first[0]) return first[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (!a || !b) break;
    if (t >= a[0] && t <= b[0]) {
      const span = b[0] - a[0];
      if (span <= 0) return b[1];
      const k = ease(a[2] as EasingName | undefined, (t - a[0]) / span);
      return a[1] + (b[1] - a[1]) * k;
    }
  }
  const last = keys[keys.length - 1];
  return last ? last[1] : 0;
}

export function sampleClip(clip: ClipDoc, t: number): ClipFrame {
  let tt = clip.loop ? t % clip.duration : Math.min(t, clip.duration);
  if (tt < 0) tt = 0;

  const rotations: PoseRotations = {};
  for (const [bone, channels] of Object.entries(clip.tracks.bones)) {
    if (channels.rot) {
      rotations[bone as BoneId] = sampleKeys(channels.rot, tt);
    }
  }

  const rootOffset: Vec2 = [
    clip.tracks.root.x ? sampleKeys(clip.tracks.root.x, tt) : 0,
    clip.tracks.root.y ? sampleKeys(clip.tracks.root.y, tt) : 0,
  ];

  let handShape: string | undefined;
  for (const [time, name] of clip.tracks.handShape) {
    if (time <= tt) handShape = name;
    else break;
  }

  return {
    pose: { rotations, rootOffset },
    handShape,
    virtualVelocity: clip.virtualVelocity ?? 0,
  };
}

function smoothstep(k: number): number {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
}

function blendFrames(a: ClipFrame, b: ClipFrame, k: number): ClipFrame {
  const rotations: PoseRotations = {};
  const boneIds = new Set([
    ...Object.keys(a.pose.rotations ?? {}),
    ...Object.keys(b.pose.rotations ?? {}),
  ]) as Set<BoneId>;
  for (const id of boneIds) {
    const va = a.pose.rotations?.[id] ?? 0; // 欠けボーンはレスト(0)とブレンド
    const vb = b.pose.rotations?.[id] ?? 0;
    rotations[id] = va + (vb - va) * k;
  }
  const ra = a.pose.rootOffset ?? [0, 0];
  const rb = b.pose.rootOffset ?? [0, 0];
  return {
    pose: {
      rotations,
      rootOffset: [ra[0] + (rb[0] - ra[0]) * k, ra[1] + (rb[1] - ra[1]) * k],
    },
    handShape: k < 0.5 ? a.handShape : b.handShape,
    virtualVelocity: a.virtualVelocity + (b.virtualVelocity - a.virtualVelocity) * k,
  };
}

// クリップ再生+クロスフェード遷移の管理。時刻は呼び出し側の連続クロック(秒)
export class ClipPlayer {
  #cur: { clip: ClipDoc; startT: number } | null = null;
  #prev: { clip: ClipDoc; startT: number; switchT: number } | null = null;
  #transition = 0.22;

  get currentClipId(): string | null {
    return this.#cur?.clip.id ?? null;
  }

  play(clip: ClipDoc, now: number, transition = 0.22): void {
    if (this.#cur?.clip.id === clip.id) return;
    this.#prev = this.#cur ? { ...this.#cur, switchT: now } : null;
    this.#cur = { clip, startT: now };
    this.#transition = transition;
  }

  stop(): void {
    this.#cur = null;
    this.#prev = null;
  }

  evaluate(now: number): ClipFrame | null {
    if (!this.#cur) return null;
    const curFrame = sampleClip(this.#cur.clip, now - this.#cur.startT);
    if (this.#prev) {
      const elapsed = now - this.#prev.switchT;
      if (elapsed < this.#transition) {
        const prevFrame = sampleClip(this.#prev.clip, now - this.#prev.startT);
        return blendFrames(prevFrame, curFrame, smoothstep(elapsed / this.#transition));
      }
      this.#prev = null;
    }
    return curFrame;
  }
}
