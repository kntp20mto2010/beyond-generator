import { useEffect, useRef, useState } from "react";
import type { CharacterDoc } from "../../core/schema/character.js";
import type { ThumbnailService } from "../thumbs/thumbnail-service.js";
import { ClipPicker } from "../ui/ClipPicker.js";
import { ExpressionPicker } from "../ui/ExpressionPicker.js";

interface Props {
  clientX: number;
  clientY: number;
  char: CharacterDoc | null;
  thumbs: ThumbnailService;
  onPickClip: (clip: string) => void;
  onPickExpression: (preset: string) => void;
  onClose: () => void;
}

const PANEL_W = 248;

// キャラのダブルクリックで開く「アクション|表情」2タブのクイックアクションPopover。
// 中身は既存 ClipPicker / ExpressionPicker のグリッドを流用。
export function QuickActionPopover({
  clientX,
  clientY,
  char,
  thumbs,
  onPickClip,
  onPickExpression,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"action" | "expr">("action");

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left = Math.min(clientX, window.innerWidth - PANEL_W - 8);
  const top = Math.min(clientY, window.innerHeight - 300);

  return (
    <div ref={ref} className="ui-popover" style={{ left, top, width: PANEL_W }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
        <button
          className={`ui-seg__btn${tab === "action" ? " ui-seg__btn--active" : ""}`}
          style={{ flex: 1, borderRadius: "4px", border: "1px solid var(--border)" }}
          onClick={() => setTab("action")}
        >
          アクション
        </button>
        <button
          className={`ui-seg__btn${tab === "expr" ? " ui-seg__btn--active" : ""}`}
          style={{ flex: 1, borderRadius: "4px", border: "1px solid var(--border)" }}
          onClick={() => setTab("expr")}
        >
          表情
        </button>
      </div>
      <div style={{ maxHeight: "240px", overflowY: "auto" }}>
        {tab === "action" ? (
          <ClipPicker char={char} value="" thumbs={thumbs} onPick={onPickClip} />
        ) : (
          <ExpressionPicker char={char} value="" thumbs={thumbs} onPick={onPickExpression} />
        )}
      </div>
    </div>
  );
}
