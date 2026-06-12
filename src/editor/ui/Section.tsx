import { useState } from "react";

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Section({ title, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ui-section">
      <div className="ui-section__header" onClick={() => setOpen((o) => !o)}>
        {title}
        <span className={`ui-section__chevron ${open ? "ui-section__chevron--open" : "ui-section__chevron--closed"}`}>
          ▾
        </span>
      </div>
      {open && <div className="ui-section__body">{children}</div>}
    </div>
  );
}
