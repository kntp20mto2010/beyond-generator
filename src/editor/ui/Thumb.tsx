interface Props {
  src?: string;        // dataURL または objectURL
  label?: string;
  selected?: boolean;
  width?: number;
  height?: number;
  onClick?: () => void;
  children?: React.ReactNode; // src未指定時のフォールバックコンテンツ
}

export function Thumb({ src, label, selected, width = 72, height = 72, onClick, children }: Props) {
  return (
    <div
      className={`ui-thumb${selected ? " ui-thumb--selected" : ""}`}
      style={{ width, cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      {src ? (
        <img
          src={src}
          width={width}
          height={height}
          style={{ display: "block", objectFit: "contain", background: "transparent" }}
          alt={label ?? ""}
        />
      ) : children ? (
        <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
          {children}
        </div>
      ) : (
        <div style={{ width, height, background: "var(--bg-panel)" }} />
      )}
      {label && <div className="ui-thumb__label">{label}</div>}
    </div>
  );
}
