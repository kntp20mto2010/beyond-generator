import { CLIP_IDLE } from "../../presets/clips/idle.js";
import { CLIP_WALK_GIRL } from "./walk-girl.js";
import { CLIP_WAVE_RELAX } from "./wave-relax.js";
import { CLIP_POINT_FWD } from "./point-fwd.js";
import { CLIP_TALK_RELAX } from "./talk-relax.js";
import { CLIP_SIT } from "./sit.js";
import { CLIP_SIT_TALK } from "./sit-talk.js";

// スプライト(新キャラ)で使えるクリップの一覧。アクション選択UIの並び・表示ラベルの
// 単一ソース。id は sprite-rig の SPRITE_CLIPS が解決する名前と一致させること。
export interface SpriteClipDef {
  id: string;
  label: string;
}

export const SPRITE_CLIP_CATALOG: SpriteClipDef[] = [
  { id: "idle", label: CLIP_IDLE.label },
  { id: "walk-girl", label: CLIP_WALK_GIRL.label },
  { id: "wave", label: CLIP_WAVE_RELAX.label },
  { id: "point", label: CLIP_POINT_FWD.label },
  { id: "talk", label: CLIP_TALK_RELAX.label },
  { id: "sit", label: CLIP_SIT.label },
  { id: "sit-talk", label: CLIP_SIT_TALK.label },
];

// id → 表示ラベル(未知idはid自身)。
export function spriteClipLabel(id: string): string {
  return SPRITE_CLIP_CATALOG.find((c) => c.id === id)?.label ?? id;
}
