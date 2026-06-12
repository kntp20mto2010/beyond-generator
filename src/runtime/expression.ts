import type { CharacterDoc } from "../core/schema/character.js";
import type { Vec2 } from "../core/schema/geometry.js";

// 顔の動的状態(タイムラインや手動操作から与えられる)
export interface FacePose {
  preset?: string; // EXPRESSION_PRESETS のキー
  blink?: number; // 0=開 .. 1=閉
  gaze?: Vec2; // 視線 -1..1(x: 左右, y: 上下)
  mouthOverride?: string; // 音声リップフラップ等で口シェイプを最後に上書き(blinkとは独立)
}

export interface FaceResolution {
  shapeName: string;
  offset: Vec2; // キャラ空間の平行移動
  squashY?: number; // anchor周りのYスケール(まばたきフォールバック)
}

export interface ExpressionDef {
  label: string;
  slots: Record<string, string>; // faceスロット名 → シェイプ名
  browOffsetY?: number;
}

// 04仕様の標準10種
export const EXPRESSION_PRESETS: Record<string, ExpressionDef> = {
  neutral: { label: "通常", slots: {} },
  smile: { label: "笑顔", slots: { mouth: "smile" } },
  laugh: {
    label: "大笑い",
    slots: { browL: "up", browR: "up", eyeL: "happy", eyeR: "happy", mouth: "openSmile" },
  },
  sad: {
    label: "悲しい",
    slots: { browL: "sadOut", browR: "sadOut", eyeL: "half", eyeR: "half", mouth: "frown" },
  },
  cry: {
    label: "泣く",
    slots: { browL: "sadOut", browR: "sadOut", eyeL: "closed", eyeR: "closed", mouth: "sadOpen" },
  },
  angry: {
    label: "怒り",
    slots: { browL: "angryIn", browR: "angryIn", mouth: "frown" },
  },
  surprised: {
    label: "驚き",
    slots: { browL: "up", browR: "up", eyeL: "wide", eyeR: "wide", mouth: "open" },
    browOffsetY: -3,
  },
  worried: {
    label: "心配",
    slots: { browL: "worried", browR: "worried", mouth: "flat" },
  },
  smug: {
    label: "ドヤ",
    slots: { browL: "angryIn", browR: "up", eyeL: "half", eyeR: "half", mouth: "smile" },
  },
  tired: {
    label: "疲れ",
    slots: { browL: "sadOut", browR: "sadOut", eyeL: "half", eyeR: "half", mouth: "flat" },
  },
};

const BROW_SLOTS = new Set(["browL", "browR"]);
const EYE_SLOTS = new Set(["eyeL", "eyeR"]);
const PUPIL_SLOTS = new Set(["pupilL", "pupilR"]);

function pickShape(
  available: Record<string, unknown>,
  want: string,
): string {
  if (available[want]) return want;
  if (available["neutral"]) return "neutral";
  const first = Object.keys(available)[0];
  return first ?? "neutral";
}

// FacePose → 各faceスロットの解決(シェイプ名・オフセット・squash)
export function resolveFace(
  char: CharacterDoc,
  fp: FacePose,
): Map<string, FaceResolution> {
  const def = EXPRESSION_PRESETS[fp.preset ?? "neutral"] ?? EXPRESSION_PRESETS["neutral"]!;
  const blink = fp.blink ?? 0;
  const gaze = fp.gaze ?? [0, 0];
  const hasPupils = Object.keys(char.face).some((s) => PUPIL_SLOTS.has(s));

  const out = new Map<string, FaceResolution>();
  for (const [slot, faceSlot] of Object.entries(char.face)) {
    let want = def.slots[slot] ?? "neutral";
    const res: FaceResolution = { shapeName: "neutral", offset: [0, 0] };

    if (EYE_SLOTS.has(slot) && blink >= 0.5) {
      if (faceSlot.shapes["closed"]) {
        want = "closed";
      } else {
        res.squashY = Math.max(0.08, 1 - blink);
      }
    }
    if (PUPIL_SLOTS.has(slot) && blink >= 0.5) {
      res.squashY = Math.max(0.08, 1 - blink);
    }

    res.shapeName = pickShape(faceSlot.shapes, want);

    if (BROW_SLOTS.has(slot) && def.browOffsetY) {
      res.offset = [res.offset[0], res.offset[1] + def.browOffsetY];
    }

    // 視線: pupilがあればpupilへ、無ければeyeへ控えめに
    if (gaze[0] !== 0 || gaze[1] !== 0) {
      const raw = faceSlot as { gazeBounds?: [number, number] };
      if (PUPIL_SLOTS.has(slot)) {
        const b = raw.gazeBounds ?? [6, 4];
        res.offset = [res.offset[0] + gaze[0] * b[0], res.offset[1] + gaze[1] * b[1]];
      } else if (EYE_SLOTS.has(slot) && !hasPupils) {
        const b = raw.gazeBounds ?? [5, 3];
        res.offset = [res.offset[0] + gaze[0] * b[0] * 0.6, res.offset[1] + gaze[1] * b[1] * 0.6];
      }
    }

    out.set(slot, res);
  }

  // リップフラップ: 表情合成の最後に mouth スロットだけ上書き(blink=目には不干渉)
  if (fp.mouthOverride) {
    const mouthSlot = char.face["mouth"];
    const cur = out.get("mouth");
    if (mouthSlot && cur) {
      cur.shapeName = pickShape(mouthSlot.shapes, fp.mouthOverride);
    }
  }
  return out;
}

// スロットが EXPRESSION_PRESETS の中で参照されているシェイプ名の一覧
export function referencedShapeNames(slot: string): string[] {
  const names = new Set<string>();
  for (const def of Object.values(EXPRESSION_PRESETS)) {
    const name = def.slots[slot];
    if (name) names.add(name);
  }
  return Array.from(names);
}

// まばたきスケジューラ(決定論: seedベース)
export function blinkAt(t: number, rng: () => number, schedule: number[]): number {
  // schedule は開始時刻の昇順配列。足りなければ伸ばす(呼び出し側が配列を保持)
  while ((schedule[schedule.length - 1] ?? 0) < t + 1) {
    const last = schedule[schedule.length - 1] ?? 0.8;
    schedule.push(last + 1.8 + rng() * 3.4);
  }
  const DUR = 0.14;
  for (const t0 of schedule) {
    if (t >= t0 && t <= t0 + DUR) {
      const ph = (t - t0) / DUR; // 0..1
      return 1 - Math.abs(2 * ph - 1); // 三角波 0→1→0
    }
    if (t0 > t) break;
  }
  return 0;
}
