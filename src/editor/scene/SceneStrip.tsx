import type { DocStore } from "../../core/doc-store.js";
import type { ProjectDoc } from "../../core/schema/project.js";
import {
  addScene,
  duplicateScene,
  moveScene,
  removeScene,
} from "../../core/commands-project.js";

interface Props {
  store: DocStore<ProjectDoc>;
  doc: ProjectDoc;
  selectedSceneId: string | null;
  playingSceneId: string | null;
  onSelect: (id: string) => void;
}

export function SceneStrip({ store, doc, selectedSceneId, playingSceneId, onSelect }: Props) {
  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        alignItems: "center",
        padding: "6px 8px",
        borderTop: "1px solid #ddd",
        overflowX: "auto",
      }}
    >
      {doc.scenes.map((scene, idx) => {
        const selected = scene.id === selectedSceneId;
        const playing = scene.id === playingSceneId;
        return (
          <div
            key={scene.id}
            onClick={() => onSelect(scene.id)}
            style={{
              minWidth: "92px",
              border: selected ? "2px solid #5B7DB1" : "1px solid #ccc",
              borderRadius: "4px",
              padding: "4px 6px",
              cursor: "pointer",
              background: playing ? "#eef4fc" : "#fff",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: 700 }}>
              シーン {idx + 1}
              {playing && <span style={{ color: "#5B7DB1" }}> ▶</span>}
            </div>
            <div style={{ fontSize: "10px", color: "#888" }}>
              {scene.duration.toFixed(1)}秒 / {scene.elements.length}要素
            </div>
            <div style={{ display: "flex", gap: "2px", marginTop: "2px" }}>
              <button
                title="左へ"
                style={miniBtn}
                onClick={(e) => { e.stopPropagation(); moveScene(store, scene.id, -1); }}
              >←</button>
              <button
                title="右へ"
                style={miniBtn}
                onClick={(e) => { e.stopPropagation(); moveScene(store, scene.id, 1); }}
              >→</button>
              <button
                title="複製"
                style={miniBtn}
                onClick={(e) => { e.stopPropagation(); duplicateScene(store, scene.id); }}
              >⧉</button>
              <button
                title="削除"
                style={miniBtn}
                onClick={(e) => { e.stopPropagation(); removeScene(store, scene.id); }}
              >×</button>
            </div>
          </div>
        );
      })}
      <button
        style={{ ...miniBtn, padding: "8px 12px", flexShrink: 0 }}
        onClick={() => addScene(store)}
      >
        +
      </button>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  fontSize: "11px",
  padding: "1px 4px",
  border: "1px solid #ccc",
  borderRadius: "3px",
  background: "#fafafa",
  cursor: "pointer",
};
