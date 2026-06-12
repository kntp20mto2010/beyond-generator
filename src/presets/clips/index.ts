import type { ClipDoc } from "../../core/schema/clip.js";
import { CLIP_IDLE } from "./idle.js";
import { CLIP_RUN } from "./run.js";
import { CLIP_WALK } from "./walk.js";

// プリセットクリップの登録簿。Phase 3b で talk1/talk2/point/wave/nod/headShake/jump を追加
export const CLIPS: Record<string, ClipDoc> = {
  idle: CLIP_IDLE,
  walk: CLIP_WALK,
  run: CLIP_RUN,
};

export const CLIP_ORDER: string[] = Object.keys(CLIPS);
