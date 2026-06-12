import { useEffect, useRef, useState } from "react";
import type { SceneElement } from "../../core/schema/project.js";
import type { ReorderOp } from "../../core/commands-project.js";

export interface ReplaceCandidate {
  ref: string;
  label: string;
}

export type AlignOp = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

export interface ContextMenuInfo {
  clientX: number;
  clientY: number;
  // 対象要素(空白右クリックは null)
  element: SceneElement | null;
}

interface Props {
  info: ContextMenuInfo;
  canPaste: boolean;
  replaceCandidates: ReplaceCandidate[];
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onFlip: () => void;
  onReorder: (op: ReorderOp) => void;
  onAlign: (op: AlignOp) => void;
  onToggleLock: () => void;
  onReplace: (ref: string) => void;
  onDelete: () => void;
  onUnlockAll: () => void;
}

const MENU_W = 168;
const ITEM_H = 28;

const menuStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 1000,
  minWidth: MENU_W,
  background: "#fff",
  border: "1px solid #ccc",
  borderRadius: "6px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
  padding: "4px 0",
  fontSize: "13px",
  userSelect: "none",
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: ITEM_H,
  padding: "0 12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const sepStyle: React.CSSProperties = {
  height: "1px",
  background: "#eee",
  margin: "4px 0",
};

function Item({
  label,
  onClick,
  disabled,
  children,
  hasSubmenu,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  hasSubmenu?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        ...itemStyle,
        position: "relative",
        color: disabled ? "#bbb" : "#222",
        cursor: disabled ? "default" : "pointer",
        background: hover && !disabled ? "#eef4fc" : "transparent",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={
        disabled
          ? undefined
          : (e) => {
              e.stopPropagation();
              onClick?.();
            }
      }
    >
      <span>{label}</span>
      {hasSubmenu && <span style={{ marginLeft: "8px", color: "#999" }}>▸</span>}
      {hasSubmenu && hover && (
        <div
          style={{
            ...menuStyle,
            position: "absolute",
            top: -4,
            left: MENU_W - 4,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function ContextMenu(props: Props) {
  const { info, canPaste, replaceCandidates, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);

  // 外側mousedown / Esc で閉じる
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

  // 画面端でクランプ
  const left = Math.min(info.clientX, window.innerWidth - MENU_W - 8);
  const top = Math.min(info.clientY, window.innerHeight - 260);

  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const el = info.element;

  return (
    <div ref={ref} style={{ ...menuStyle, left, top }}>
      {el ? (
        <>
          <Item label="コピー" onClick={close(props.onCopy)} />
          <Item label="ペースト" onClick={close(props.onPaste)} disabled={!canPaste} />
          <Item label="複製" onClick={close(props.onDuplicate)} />
          {el.kind === "character" && <Item label="反転" onClick={close(props.onFlip)} />}
          <div style={sepStyle} />
          <Item label="順序" hasSubmenu>
            <Item label="最前面へ" onClick={close(() => props.onReorder("front"))} />
            <Item label="前面へ" onClick={close(() => props.onReorder("forward"))} />
            <Item label="背面へ" onClick={close(() => props.onReorder("backward"))} />
            <Item label="最背面へ" onClick={close(() => props.onReorder("back"))} />
          </Item>
          <Item label="整列" hasSubmenu>
            <Item label="左" onClick={close(() => props.onAlign("left"))} />
            <Item label="中央(横)" onClick={close(() => props.onAlign("hcenter"))} />
            <Item label="右" onClick={close(() => props.onAlign("right"))} />
            <div style={sepStyle} />
            <Item label="上" onClick={close(() => props.onAlign("top"))} />
            <Item label="中央(縦)" onClick={close(() => props.onAlign("vcenter"))} />
            <Item label="下" onClick={close(() => props.onAlign("bottom"))} />
          </Item>
          <div style={sepStyle} />
          <Item
            label={el.locked ? "ロック解除" : "ロック"}
            onClick={close(props.onToggleLock)}
          />
          {el.kind === "character" && (
            <Item label="差し替え" hasSubmenu>
              {replaceCandidates.map((c) => (
                <Item key={c.ref} label={c.label} onClick={close(() => props.onReplace(c.ref))} />
              ))}
            </Item>
          )}
          <div style={sepStyle} />
          <Item label="削除" onClick={close(props.onDelete)} />
        </>
      ) : (
        <>
          <Item label="ペースト" onClick={close(props.onPaste)} disabled={!canPaste} />
          <Item label="全ロック解除" onClick={close(props.onUnlockAll)} />
        </>
      )}
    </div>
  );
}
