import { useEffect, useRef } from "react";

interface Props {
  anchorEl: HTMLElement | null; // ポップオーバーの基準要素
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  placement?: "below" | "above";
}

export function Popover({ anchorEl, open, onClose, children, placement = "below" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          anchorEl && !anchorEl.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorEl]);

  if (!open || !anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();
  const top = placement === "below" ? rect.bottom + 4 : rect.top - 4;

  return (
    <div
      ref={ref}
      className="ui-popover"
      style={{
        top: placement === "below" ? top : undefined,
        bottom: placement === "above" ? window.innerHeight - top : undefined,
        left: rect.left,
        maxWidth: "calc(100vw - 16px)",
      }}
    >
      {children}
    </div>
  );
}
