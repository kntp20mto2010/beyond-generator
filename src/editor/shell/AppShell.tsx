import { useSyncExternalStore } from "react";
import type { DocStore } from "../../core/doc-store.js";
import type { ProjectDoc } from "../../core/schema/project.js";
import {
  addScene,
  removeScene,
  setSceneDuration,
  setTitle,
} from "../../core/commands.js";
import { toJson, parseProject } from "../../io/serialize.js";
import {
  FsAccessAdapter,
  PROJECT_FILE,
  isFsAccessSupported,
} from "../../io/fs.js";

function ensureFsSupport(): boolean {
  if (isFsAccessSupported) return true;
  alert(
    "このブラウザはフォルダ保存に非対応です。Chrome または Edge で開いてください。",
  );
  return false;
}
import { createEmptyProject } from "../../core/schema/project.js";
import { useUiStore } from "../ui-store.js";

interface Props {
  store: DocStore<ProjectDoc>;
}

export function AppShell({ store }: Props) {
  const doc = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.doc,
  );
  const revision = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.revision,
  );
  const canUndo = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.canUndo(),
  );
  const canRedo = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.canRedo(),
  );

  const { fs, savedRevision, setFs, setSavedRevision } = useUiStore();
  const isDirty = revision !== savedRevision;

  async function handleOpenFolder() {
    if (!ensureFsSupport()) return;
    const adapter = new FsAccessAdapter();
    const ok = await adapter.pickProjectFolder();
    if (!ok) return;
    setFs(adapter);
    const existing = await adapter.readTextFile(PROJECT_FILE);
    if (existing) {
      try {
        const loaded = parseProject(existing);
        store.dispatch("プロジェクト読込", (d) => {
          Object.assign(d, loaded);
        });
        setSavedRevision(store.revision);
      } catch (e) {
        alert(`読込エラー: ${String(e)}`);
      }
    } else {
      const empty = createEmptyProject();
      store.dispatch("新規プロジェクト", (d) => {
        Object.assign(d, empty);
      });
      setSavedRevision(store.revision);
    }
  }

  async function handleSave() {
    if (!ensureFsSupport()) return;
    let adapter = fs;
    if (!adapter) {
      const newAdapter = new FsAccessAdapter();
      const ok = await newAdapter.pickProjectFolder();
      if (!ok) return;
      setFs(newAdapter);
      adapter = newAdapter;
    }
    try {
      await adapter.writeTextFile(PROJECT_FILE, toJson(doc));
      setSavedRevision(revision);
    } catch (e) {
      alert(`保存エラー: ${String(e)}`);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "12px",
          borderBottom: "1px solid #ccc",
          paddingBottom: "8px",
        }}
      >
        <button onClick={handleOpenFolder}>フォルダを開く</button>
        <button onClick={handleSave}>保存</button>
        <button onClick={() => store.undo()} disabled={!canUndo}>
          ↩ 戻す
        </button>
        <button onClick={() => store.redo()} disabled={!canRedo}>
          ↪ やり直す
        </button>
        <span>タイトル:</span>
        <input
          value={doc.title}
          onChange={(e) => setTitle(store, e.target.value)}
          style={{ width: "200px" }}
        />
        {isDirty && <span style={{ color: "#e55" }}>● 未保存</span>}
      </div>

      <div>
        <strong>シーン一覧:</strong>
        {doc.scenes.length === 0 && (
          <p style={{ color: "#888" }}>シーンがありません</p>
        )}
        {doc.scenes.map((scene, idx) => (
          <div
            key={scene.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              margin: "4px 0",
            }}
          >
            <span>{idx + 1}. {scene.id}</span>
            <span>duration:</span>
            <input
              type="number"
              value={scene.duration}
              step="0.5"
              min="0.5"
              style={{ width: "60px" }}
              onChange={(e) =>
                setSceneDuration(store, scene.id, Number(e.target.value))
              }
            />
            <span>秒</span>
            <button onClick={() => removeScene(store, scene.id)}>削除</button>
          </div>
        ))}
        <button
          style={{ marginTop: "8px" }}
          onClick={() => addScene(store)}
        >
          + シーン追加
        </button>
      </div>
    </div>
  );
}
