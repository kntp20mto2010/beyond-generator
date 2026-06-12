import { useMemo, useRef, useEffect } from "react";
import type { DocStore } from "../../core/doc-store.js";
import type { ProjectDoc, SceneDoc } from "../../core/schema/project.js";
import { setBalloonProps, setTextProps } from "../../core/commands-project.js";
import {
  buildScriptEvents,
  type ScriptEvent,
} from "./script-events.js";

// ---------------------------------------------------------------------------
// アイコン(インライン SVG — 台本タブ専用の小さな記号)
// ---------------------------------------------------------------------------

function IconEnter() {
  return (
    <svg viewBox="0 0 14 14" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7 L7 2 M2 7 L7 12 M2 7 L12 7" />
    </svg>
  );
}

function IconExit() {
  return (
    <svg viewBox="0 0 14 14" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 7 L7 2 M12 7 L7 12 M12 7 L2 7" />
    </svg>
  );
}

function IconAction() {
  return (
    <svg viewBox="0 0 14 14" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="4" r="2" />
      <path d="M4 14 C4 9 10 9 10 14" />
    </svg>
  );
}

function IconExpr() {
  return (
    <svg viewBox="0 0 14 14" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5" />
      <path d="M5 9 Q7 11 9 9" />
      <circle cx="5" cy="5.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="9" cy="5.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconDialogue() {
  return (
    <svg viewBox="0 0 14 14" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="7" cy="6" rx="5.5" ry="3.5" />
      <path d="M5 9.5 L4 13 L8 11" />
    </svg>
  );
}

function IconCam() {
  return (
    <svg viewBox="0 0 14 14" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3.5" width="12" height="8" rx="1" />
      <circle cx="7" cy="7.5" r="2.5" />
      <path d="M4.5 3.5 L5.2 1.8 L8.8 1.8 L9.5 3.5" />
    </svg>
  );
}

function IconTransAnim() {
  return (
    <svg viewBox="0 0 14 14" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="1" x2="7" y2="13" />
      <polyline points="10,4 13,7 10,10" />
      <polyline points="4,4 1,7 4,10" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

interface Props {
  store: DocStore<ProjectDoc>;
  project: ProjectDoc;
  scene: SceneDoc;
  nextScene: SceneDoc | null;
  currentT: number;
  selectedId: string | null;
  onJump: (event: ScriptEvent) => void;
}

// ---------------------------------------------------------------------------
// 個別行コンポーネント
// ---------------------------------------------------------------------------

interface RowProps {
  event: ScriptEvent;
  isActive: boolean;
  isSelected: boolean;
  store: DocStore<ProjectDoc>;
  sceneId: string;
  onJump: (event: ScriptEvent) => void;
}

function ScriptRow({ event, isActive, isSelected, store, sceneId, onJump }: RowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // ハイライトスタイル
  const rowClass = [
    "script-row",
    isActive ? "script-row--active" : "",
    isSelected ? "script-row--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleRowClick = () => {
    onJump(event);
  };

  // dialogue の場合だけインライン編集
  if (event.kind === "dialogue") {
    const handleTextChange = (v: string) => {
      // elementId を持つ要素を scene から探して balloon か text か判定
      const scene = store.doc.scenes.find((s) => s.id === sceneId);
      const el = scene?.elements.find((e) => e.id === event.elementId);
      if (!el) return;
      if (el.kind === "balloon") {
        setBalloonProps(store, sceneId, event.elementId, { text: v });
      } else if (el.kind === "text") {
        setTextProps(store, sceneId, event.elementId, { text: v });
      }
    };

    return (
      <div className={rowClass} onClick={handleRowClick}>
        <span className="script-row__t">{event.t.toFixed(1)}</span>
        <span className="script-row__icon" style={{ color: "var(--accent)" }}>
          <IconDialogue />
        </span>
        <input
          ref={inputRef}
          className="script-row__edit"
          defaultValue={event.text}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={(e) => handleTextChange(e.target.value)}
        />
      </div>
    );
  }

  // その他の行
  let icon: React.ReactNode = null;
  let content = "";

  switch (event.kind) {
    case "enter":
      icon = <IconEnter />;
      content = `${event.name} 登場(${event.effect})`;
      break;
    case "exit":
      icon = <IconExit />;
      content = `${event.name} 退場(${event.effect})`;
      break;
    case "action": {
      icon = <IconAction />;
      const mv = event.moveToX !== undefined ? ` → x${Math.round(event.moveToX)}` : "";
      content = `${event.name} ${event.clipLabel}${mv}`;
      break;
    }
    case "expression":
      icon = <IconExpr />;
      content = `${event.name} ${event.presetLabel}`;
      break;
    case "camera":
      icon = <IconCam />;
      content = `ズーム ${event.zoom.toFixed(1)}`;
      break;
    case "transition":
      icon = <IconTransAnim />;
      content = `次シーンへ: ${event.type} ${event.dur.toFixed(1)}s`;
      break;
  }

  return (
    <div className={rowClass} onClick={handleRowClick}>
      <span className="script-row__t">{event.t.toFixed(1)}</span>
      <span className="script-row__icon">{icon}</span>
      <span className="script-row__content">{content}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScriptPanel メイン
// ---------------------------------------------------------------------------

export function ScriptPanel({ store, project, scene, nextScene, currentT, selectedId, onJump }: Props) {
  const events = useMemo(
    () => buildScriptEvents(project, scene, nextScene),
    // シーン変化 + doc変化のどちらも追跡したいので scene 自体を dep に入れる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, nextScene, project],
  );

  // 現在地: currentT 以下で最後のイベントのインデックス
  const activeIdx = useMemo(() => {
    let found = -1;
    for (let i = 0; i < events.length; i++) {
      if ((events[i]?.t ?? Infinity) <= currentT + 1e-4) found = i;
    }
    return found;
  }, [events, currentT]);

  const listRef = useRef<HTMLDivElement>(null);

  // activeIdx が変化したら自動スクロール
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const rows = listRef.current.querySelectorAll<HTMLElement>(".script-row");
    const row = rows[activeIdx];
    if (row) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIdx]);

  if (events.length === 0) {
    return (
      <div style={{ padding: "16px", color: "var(--text-dim)", fontSize: "12px" }}>
        イベントがありません
      </div>
    );
  }

  return (
    <div ref={listRef} className="script-panel">
      {events.map((event, i) => {
        // selected: 要素選択と一致するか(camera/transitionは常にfalse)
        const isSelected =
          (event.kind !== "camera" && event.kind !== "transition") &&
          event.elementId === selectedId;
        return (
          <ScriptRow
            key={`${event.kind}-${event.t}-${i}`}
            event={event}
            isActive={i === activeIdx}
            isSelected={isSelected}
            store={store}
            sceneId={scene.id}
            onJump={onJump}
          />
        );
      })}
    </div>
  );
}
