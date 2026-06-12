import { useState } from "react";
import { DocStore } from "./core/doc-store.js";
import { createEmptyProject } from "./core/schema/project.js";
import { AppShell } from "./editor/shell/AppShell.js";
import { CharacterPage } from "./editor/character/CharacterPage.js";

const store = new DocStore(createEmptyProject());

type Tab = "scene" | "character";

function App() {
  const [tab, setTab] = useState<Tab>("character");

  const tabStyle = (active: boolean) => ({
    padding: "6px 16px",
    border: "none",
    borderBottom: active ? "2px solid #5B7DB1" : "2px solid transparent",
    background: "none",
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
  });

  return (
    <div>
      <nav style={{ display: "flex", gap: "4px", borderBottom: "1px solid #ddd", padding: "0 8px" }}>
        <button style={tabStyle(tab === "character")} onClick={() => setTab("character")}>
          キャラクター
        </button>
        <button style={tabStyle(tab === "scene")} onClick={() => setTab("scene")}>
          シーン編集
        </button>
      </nav>
      {tab === "character" ? <CharacterPage /> : <AppShell store={store} />}
    </div>
  );
}

export default App;
