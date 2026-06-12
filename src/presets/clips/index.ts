import type { ClipDoc } from "../../core/schema/clip.js";
import { CLIP_IDLE } from "./idle.js";
import { CLIP_WALK } from "./walk.js";
import { CLIP_RUN } from "./run.js";
import { CLIP_TALK1 } from "./talk1.js";
import { CLIP_TALK2 } from "./talk2.js";
import { CLIP_POINT } from "./point.js";
import { CLIP_WAVE } from "./wave.js";
import { CLIP_NOD } from "./nod.js";
import { CLIP_HEAD_SHAKE } from "./headShake.js";
import { CLIP_JUMP } from "./jump.js";

export const CLIPS: Record<string, ClipDoc> = {
  idle: CLIP_IDLE,
  walk: CLIP_WALK,
  run: CLIP_RUN,
  talk1: CLIP_TALK1,
  talk2: CLIP_TALK2,
  point: CLIP_POINT,
  wave: CLIP_WAVE,
  nod: CLIP_NOD,
  headShake: CLIP_HEAD_SHAKE,
  jump: CLIP_JUMP,
};

export const CLIP_ORDER: string[] = Object.keys(CLIPS);
