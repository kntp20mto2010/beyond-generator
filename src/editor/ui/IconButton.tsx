interface Props {
  children: React.ReactNode;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export function IconButton({ children, title, active, disabled, onClick, className }: Props) {
  return (
    <button
      className={`ui-icon-btn${active ? " ui-icon-btn--active" : ""}${className ? " " + className : ""}`}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
