import { useEffect, useRef, useState } from "react";
import type { CharacterDoc } from "../../core/schema/character.js";
import { CLIPS, CLIP_ORDER } from "../../presets/clips/index.js";
import { SPRITE_CLIP_CATALOG } from "../newchar/sprite-clips.js";
import type { ThumbnailService } from "../thumbs/thumbnail-service.js";
import { Thumb } from "./Thumb.js";

interface Props {
  char: CharacterDoc | null;
  value: string;
  onPick: (clipId: string) => void;
  thumbs: ThumbnailService | null;
  // 新キャラ(スプライト)はベクター用サムネが使えないため、専用クリップをラベルで列挙する
  isSprite?: boolean;
}

export function ClipPicker({ char, value, onPick, thumbs, isSprite }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [rev, setRev] = useState(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (isSprite || !char || !thumbs || loadedRef.current) return;
    loadedRef.current = true;

    const unsub = thumbs.subscribe(() => setRev((r) => r + 1));

    for (const clipId of CLIP_ORDER) {
      void thumbs.renderCharacter(char, { clip: clipId, phase: 0.4, w: 72, h: 72 })
        .then((url) => setUrls((prev) => ({ ...prev, [clipId]: url })));
    }

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, thumbs]);

  void rev;

  // 新キャラ: サムネ無しのラベルボタンで列挙(sit / sit-talk 等のスプライト専用クリップ)
  if (isSprite) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 96px)", gap: "4px", padding: "4px" }}>
        {SPRITE_CLIP_CATALOG.map((c) => (
          <button
            key={c.id}
            className={`ui-btn${value === c.id ? " ui-btn--active" : ""}`}
            style={{ justifyContent: "center", height: "40px" }}
            onClick={() => onPick(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: "4px", padding: "4px" }}>
      {CLIP_ORDER.map((clipId) => {
        const def = CLIPS[clipId];
        if (!def) return null;
        return (
          <Thumb
            key={clipId}
            src={urls[clipId]}
            label={def.label}
            selected={value === clipId}
            width={72}
            height={72}
            onClick={() => onPick(clipId)}
          >
            {!urls[clipId] && <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>{def.label}</span>}
          </Thumb>
        );
      })}
    </div>
  );
}
