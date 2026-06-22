import { useState } from "react";
import { DocStore } from "./core/doc-store.js";
import { createEmptyProject } from "./core/schema/project.js";
import { ScenePage } from "./editor/scene/ScenePage.js";
import { CharacterEditorPage } from "./editor/character/CharacterEditorPage.js";
import { ContactSheetPage } from "./editor/character/ContactSheetPage.js";
import { ClipSheetPage } from "./editor/character/ClipSheetPage.js";
import { SpriteRigPage } from "./editor/newchar/SpriteRigPage.js";
import { ObjectPage } from "./editor/object/ObjectPage.js";
import { SourcePage } from "./editor/source/SourcePage.js";
import { useUiStore } from "./editor/ui-store.js";

const store = new DocStore(createEmptyProject());

// DEV専用: ヘッドレス検証で store.doc を読むためのフック(本番ビルドでは無効)
if (import.meta.env.DEV) {
  (globalThis as unknown as { __byondStore?: unknown }).__byondStore = store;
}

type Tab = "scene" | "character" | "newchar" | "object" | "source";

// ハッシュルートは初回判定のみ(リアクティブルーティング不要)
const IS_CONTACT_SHEET = location.hash === "#contact-sheet";
const IS_CLIP_SHEET = location.hash === "#clip-sheet";

// アクティブタブはリロードで保持(localStorage)
const TAB_KEY = "byond.activeTab";
function loadTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === "scene" || v === "character" || v === "newchar" || v === "object" || v === "source") return v;
  } catch {
    /* localStorage 不可環境は既定へ */
  }
  return "character";
}

function App() {
  const [tab, setTabState] = useState<Tab>(loadTab);
  // 抽出元タブへジャンプする際、スクロール先の moodboard パスを一時保持する
  const [jumpToSource, setJumpToSource] = useState<string | null>(null);
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* 保存不可でも遷移は続行 */
    }
  };
  // オブジェクトの「抽出元あり ⤴」から呼ばれる: 抽出元タブへ遷移し、該当 moodboard へスクロール
  const goToSource = (sourcePath: string) => {
    setJumpToSource(sourcePath);
    setTab("source");
  };
  const fs = useUiStore((s) => s.fs);

  if (IS_CONTACT_SHEET) {
    return <ContactSheetPage />;
  }

  if (IS_CLIP_SHEET) {
    return <ClipSheetPage />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--bg-app)", color: "var(--text)" }}>
      <nav style={{ display: "flex", gap: "0", borderBottom: "1px solid var(--border)", padding: "0 8px", flexShrink: 0, background: "var(--bg-panel)" }}>
        <button
          className={`app-tab${tab === "character" ? " app-tab--active" : ""}`}
          onClick={() => setTab("character")}
        >
          キャラクター
        </button>
        <button
          className={`app-tab${tab === "scene" ? " app-tab--active" : ""}`}
          onClick={() => setTab("scene")}
        >
          シーン編集
        </button>
        <button
          className={`app-tab${tab === "newchar" ? " app-tab--active" : ""}`}
          onClick={() => setTab("newchar")}
        >
          新キャラクター
        </button>
        <button
          className={`app-tab${tab === "object" ? " app-tab--active" : ""}`}
          onClick={() => setTab("object")}
        >
          オブジェクト
        </button>
        <button
          className={`app-tab${tab === "source" ? " app-tab--active" : ""}`}
          onClick={() => setTab("source")}
        >
          抽出元
        </button>
      </nav>
      {tab === "character" ? (
        <CharacterEditorPage fs={fs} />
      ) : tab === "scene" ? (
        <ScenePage store={store} />
      ) : tab === "newchar" ? (
        <SpriteRigPage />
      ) : tab === "object" ? (
        <ObjectPage onJumpToSource={goToSource} />
      ) : (
        <SourcePage jumpTarget={jumpToSource} onJumpHandled={() => setJumpToSource(null)} />
      )}
    </div>
  );
}

export default App;
