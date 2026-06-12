/* SVGアイコンセット — 16×16 viewBox, stroke=currentColor, fill=none */

const PROPS = {
  viewBox: "0 0 16 16",
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconPlay() {
  return <svg {...PROPS}><polygon points="4,2 14,8 4,14" fill="currentColor" stroke="none" /></svg>;
}

export function IconPlayAll() {
  return (
    <svg {...PROPS}>
      <polygon points="1,3 8,8 1,13" fill="currentColor" stroke="none" />
      <polygon points="7,3 14,8 7,13" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconStop() {
  return <svg {...PROPS}><rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" stroke="none" /></svg>;
}

export function IconUndo() {
  return (
    <svg {...PROPS}>
      <path d="M3 7 C3 4 5 2 8 2 C11 2 13 4 13 7 C13 10 11 12 8 12" />
      <polyline points="3,4 3,7 6,7" />
    </svg>
  );
}

export function IconRedo() {
  return (
    <svg {...PROPS}>
      <path d="M13 7 C13 4 11 2 8 2 C5 2 3 4 3 7 C3 10 5 12 8 12" />
      <polyline points="13,4 13,7 10,7" />
    </svg>
  );
}

export function IconFolder() {
  return (
    <svg {...PROPS}>
      <path d="M1 4 L1 13 L15 13 L15 5 L7 5 L5.5 3 L1 3 Z" />
    </svg>
  );
}

export function IconSave() {
  return (
    <svg {...PROPS}>
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <rect x="5" y="2" width="6" height="4" />
      <rect x="4" y="8" width="8" height="5" />
    </svg>
  );
}

export function IconGrid() {
  return (
    <svg {...PROPS}>
      <line x1="5" y1="1" x2="5" y2="15" />
      <line x1="11" y1="1" x2="11" y2="15" />
      <line x1="1" y1="5" x2="15" y2="5" />
      <line x1="1" y1="11" x2="15" y2="11" />
    </svg>
  );
}

export function IconCamera() {
  return (
    <svg {...PROPS}>
      <rect x="1" y="4" width="14" height="10" rx="1" />
      <circle cx="8" cy="9" r="3" />
      <path d="M5 4 L6 2 L10 2 L11 4" />
    </svg>
  );
}

export function IconCharacter() {
  return (
    <svg {...PROPS}>
      <circle cx="8" cy="5" r="2.5" />
      <path d="M3 14 C3 10 5 8 8 8 C11 8 13 10 13 14" />
    </svg>
  );
}

export function IconText() {
  return (
    <svg {...PROPS}>
      <line x1="3" y1="3" x2="13" y2="3" />
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="5" y1="13" x2="11" y2="13" />
    </svg>
  );
}

export function IconBalloon() {
  return (
    <svg {...PROPS}>
      <ellipse cx="8" cy="7" rx="6" ry="4" />
      <path d="M5 11 L4 14 L8 12" />
    </svg>
  );
}

export function IconBackground() {
  return (
    <svg {...PROPS}>
      <rect x="1" y="2" width="14" height="12" rx="1" />
      <path d="M1 10 L5 7 L8 9 L11 5 L15 10" />
      <circle cx="11" cy="5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg {...PROPS}>
      <rect x="3" y="8" width="10" height="7" rx="1" />
      <path d="M5 8 L5 5 C5 3 11 3 11 5 L11 8" />
    </svg>
  );
}

export function IconUnlock() {
  return (
    <svg {...PROPS}>
      <rect x="3" y="8" width="10" height="7" rx="1" />
      <path d="M5 8 L5 5 C5 3 11 3 11 5" />
    </svg>
  );
}

export function IconDuplicate() {
  return (
    <svg {...PROPS}>
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M5 5 L5 3 C5 2 14 2 14 3 L14 5" strokeWidth={1.2} />
      <path d="M2 11 L2 3 C2 2 5 2 5 2" strokeWidth={1.2} />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg {...PROPS}>
      <polyline points="2,4 14,4" />
      <path d="M5 4 L5 2 L11 2 L11 4" />
      <path d="M4 4 L4.5 14 L11.5 14 L12 4" />
      <line x1="6" y1="7" x2="6.3" y2="11" />
      <line x1="10" y1="7" x2="9.7" y2="11" />
    </svg>
  );
}

export function IconFlip() {
  return (
    <svg {...PROPS}>
      <line x1="8" y1="1" x2="8" y2="15" strokeDasharray="2,1.5" />
      <path d="M8 4 L3 8 L8 12" />
      <path d="M8 4 L13 8 L8 12" />
    </svg>
  );
}

export function IconFront() {
  return (
    <svg {...PROPS}>
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <rect x="2" y="2" width="9" height="9" rx="1" />
      <line x1="8" y1="5" x2="8" y2="8" />
      <line x1="6.5" y1="6.5" x2="8" y2="5" />
      <line x1="9.5" y1="6.5" x2="8" y2="5" />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg {...PROPS}>
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <rect x="2" y="2" width="9" height="9" rx="1" />
      <line x1="8" y1="5" x2="8" y2="8" />
      <line x1="6.5" y1="6.5" x2="8" y2="5" />
      <line x1="9.5" y1="6.5" x2="8" y2="5" />
    </svg>
  );
}

export function IconTransition() {
  return (
    <svg {...PROPS}>
      <line x1="1" y1="8" x2="15" y2="8" />
      <polyline points="10,5 13,8 10,11" />
      <polyline points="6,5 3,8 6,11" />
    </svg>
  );
}

export function IconKeyDiamond() {
  return (
    <svg {...PROPS}>
      <polygon points="8,2 14,8 8,14 2,8" fill="currentColor" stroke="none" />
    </svg>
  );
}
