interface Option<V extends string> {
  value: V;
  icon?: React.ReactNode;
  label?: string;
  title?: string;
}

interface Props<V extends string> {
  value: V;
  options: Option<V>[];
  onChange: (v: V) => void;
}

export function SegmentedButtons<V extends string>({ value, options, onChange }: Props<V>) {
  return (
    <div className="ui-seg">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`ui-seg__btn${value === opt.value ? " ui-seg__btn--active" : ""}`}
          title={opt.title ?? opt.label}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          {opt.label && <span>{opt.label}</span>}
        </button>
      ))}
    </div>
  );
}
