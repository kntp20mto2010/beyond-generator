import { useEffect, useRef, useState } from "react";
import type { CharacterDoc } from "../../core/schema/character.js";
import { EXPRESSION_PRESETS } from "../../runtime/expression.js";
import type { ThumbnailService } from "../thumbs/thumbnail-service.js";
import { Thumb } from "./Thumb.js";

interface Props {
  char: CharacterDoc | null;
  value: string;
  onPick: (preset: string) => void;
  thumbs: ThumbnailService | null;
}

export function ExpressionPicker({ char, value, onPick, thumbs }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [rev, setRev] = useState(0);
  const loadedRef = useRef(false);

  // Popoverを開いたタイミング(マウント時)に一括ロード
  useEffect(() => {
    if (!char || !thumbs || loadedRef.current) return;
    loadedRef.current = true;

    const unsub = thumbs.subscribe(() => setRev((r) => r + 1));

    // 全表情をキュー登録
    const keys = Object.keys(EXPRESSION_PRESETS);
    for (const key of keys) {
      void thumbs.renderCharacter(char, { expression: key, face: true, w: 56, h: 56 })
        .then((url) => setUrls((prev) => ({ ...prev, [key]: url })));
    }

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, thumbs]);

  // urlsのrevision変化に応じて再描画
  void rev;

  const keys = Object.keys(EXPRESSION_PRESETS);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 56px)", gap: "4px", padding: "4px" }}>
      {keys.map((key) => {
        const def = EXPRESSION_PRESETS[key];
        if (!def) return null;
        return (
          <Thumb
            key={key}
            src={urls[key]}
            label={def.label}
            selected={value === key}
            width={56}
            height={56}
            onClick={() => onPick(key)}
          >
            {!urls[key] && <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>{def.label}</span>}
          </Thumb>
        );
      })}
    </div>
  );
}
