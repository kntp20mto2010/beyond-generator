import { useState } from "react";
import { DocStore } from "./core/doc-store.js";
import { createEmptyProject } from "./core/schema/project.js";
import { ScenePage } from "./editor/scene/ScenePage.js";
import { CharacterEditorPage } from "./editor/character/CharacterEditorPage.js";
import { ContactSheetPage } from "./editor/character/ContactSheetPage.js";
import { ClipSheetPage } from "./editor/character/ClipSheetPage.js";
import { useUiStore } from "./editor/ui-store.js";

const store = new DocStore(createEmptyProject());

type Tab = "scene" | "character";

// ハッシュルートは初回判定のみ(リアクティブルーティング不要)
const IS_CONTACT_SHEET = location.hash === "#contact-sheet";
const IS_CLIP_SHEET = location.hash === "#clip-sheet";

function App() {
  const [tab, setTab] = useState<Tab>("character");
  const fs = useUiStore((s) => s.fs);

  if (IS_CONTACT_SHEET) {
    return <ContactSheetPage />;
  }

  if (IS_CLIP_SHEET) {
    return <ClipSheetPage />;
  }

  const tabStyle = (active: boolean) => ({
    padding: "6px 16px",
    border: "none",
    borderBottom: active ? "2px solid #5B7DB1" : "2px solid transparent",
    background: "none",
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <nav style={{ display: "flex", gap: "4px", borderBottom: "1px solid #ddd", padding: "0 8px", flexShrink: 0 }}>
        <button style={tabStyle(tab === "character")} onClick={() => setTab("character")}>
          キャラクター
        </button>
        <button style={tabStyle(tab === "scene")} onClick={() => setTab("scene")}>
          シーン編集
        </button>
      </nav>
      {tab === "character" ? (
        <CharacterEditorPage fs={fs} />
      ) : (
        <ScenePage store={store} />
      )}
    </div>
  );
}

export default App;
