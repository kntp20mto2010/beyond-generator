import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DocStore } from "../../core/doc-store.js";
import {
  createEmptyProject,
  type CharacterElement,
  type ProjectDoc,
  type TextElement,
} from "../../core/schema/project.js";
import { newId } from "../../core/id.js";
import { setTitle } from "../../core/commands.js";
import { addElement, removeElement, setSceneBackground } from "../../core/commands-project.js";
import { toJson, parseProject } from "../../io/serialize.js";
import { FsAccessAdapter, PROJECT_FILE, isFsAccessSupported } from "../../io/fs.js";
import type { FileSystemAdapter } from "../../io/fs.js";
import { AssetResolver } from "../../io/asset-resolver.js";
import { useUiStore } from "../ui-store.js";
import { StageCanvas, type PlayMode } from "./StageCanvas.js";
import { AddPanel } from "./AddPanel.js";
import { PropertyPanel } from "./PropertyPanel.js";
import { SceneStrip } from "./SceneStrip.js";
import { Timeline } from "./Timeline.js";

interface Props {
  store: DocStore<ProjectDoc>;
}

function ensureFsSupport(): boolean {
  if (isFsAccessSupported) return true;
  alert("このブラウザはフォルダ保存に非対応です。Chrome または Edge で開いてください。");
  return false;
}

export function ScenePage({ store }: Props) {
  const doc = useSyncExternalStore((cb) => store.subscribe(cb), () => store.doc);
  const revision = useSyncExternalStore((cb) => store.subscribe(cb), () => store.revision);
  const canUndo = useSyncExternalStore((cb) => store.subscribe(cb), () => store.canUndo());
  const canRedo = useSyncExternalStore((cb) => store.subscribe(cb), () => store.canRedo());

  const { fs, savedRevision, setFs, setSavedRevision } = useUiStore();
  const isDirty = revision !== savedRevision;

  const resolver = useMemo(() => new AssetResolver(), []);
  const [resolverRev, setResolverRev] = useState(0);
  useEffect(() => resolver.subscribe(() => setResolverRev((r) => r + 1)), [resolver]);

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playMode, setPlayMode] = useState<PlayMode | null>(null);
  const [seekNonce, setSeekNonce] = useState(0);

  // 選択シーンの自動補正
  const sceneId =
    selectedSceneId && doc.scenes.some((s) => s.id === selectedSceneId)
      ? selectedSceneId
      : (doc.scenes[0]?.id ?? null);
  const scene = doc.scenes.find((s) => s.id === sceneId) ?? null;
  const selectedEl = scene?.elements.find((e) => e.id === selectedId) ?? null;

  // 参照キャラのロード
  useEffect(() => {
    const refs = doc.scenes
      .flatMap((s) => s.elements)
      .filter((e): e is CharacterElement => e.kind === "character")
      .map((e) => e.ref);
    if (refs.length > 0) void resolver.ensureLoaded(refs, fs);
  }, [doc, fs, resolver]);

  const bumpSeek = useCallback(() => setSeekNonce((n) => n + 1), []);

  const setTime = useCallback((next: number) => {
    tRef.current = next;
    setT(next);
  }, []);

  // シーン切替: 時刻リセット + 物理再構築
  const selectScene = useCallback(
    (id: string) => {
      setSelectedSceneId(id);
      setSelectedId(null);
      setPlayMode(null);
      setTime(0);
      bumpSeek();
    },
    [setTime, bumpSeek],
  );

  // === 再生制御 ===
  const playScene = () => {
    if (!scene) return;
    if (tRef.current >= scene.duration - 1e-3) setTime(0);
    bumpSeek();
    setPlayMode("scene");
  };
  const playAll = () => {
    if (doc.scenes.length === 0) return;
    const first = doc.scenes[0]!;
    setSelectedSceneId(first.id);
    setTime(0);
    bumpSeek();
    setPlayMode("all");
  };
  const stop = () => {
    setPlayMode(null);
  };

  const onReachEnd = useCallback(
    (mode: PlayMode) => {
      if (mode === "scene") {
        setPlayMode(null);
        setT(tRef.current);
        return;
      }
      // all: 次のシーンへカット切替、無ければ停止
      const idx = doc.scenes.findIndex((s) => s.id === (selectedSceneId ?? doc.scenes[0]?.id));
      const next = doc.scenes[idx + 1];
      if (next) {
        setSelectedSceneId(next.id);
        setTime(0);
        bumpSeek();
      } else {
        setPlayMode(null);
        setT(tRef.current);
      }
    },
    [doc.scenes, selectedSceneId, setTime, bumpSeek],
  );

  // スクラブ
  const onScrub = useCallback((next: number) => {
    setPlayMode(null);
    tRef.current = next;
    setT(next);
  }, []);
  const onScrubCommit = useCallback(() => bumpSeek(), [bumpSeek]);

  // === 要素追加 ===
  const addCharacter = (ref: string) => {
    if (!scene) return;
    const el: CharacterElement = {
      id: newId(),
      kind: "character",
      ref,
      transform: { x: 960, y: 700, scale: 0.9, flipX: false },
      z: scene.elements.length,
      enter: { type: "cut", delay: 0, dur: 0.4 },
      exit: { type: "cut", at: null, dur: 0.4 },
      actions: [],
      expressions: [],
    };
    addElement(store, scene.id, el);
    setSelectedId(el.id);
    if (fs) void resolver.ensureLoaded([ref], fs);
    bumpSeek();
  };
  const addText = () => {
    if (!scene) return;
    const el: TextElement = {
      id: newId(),
      kind: "text",
      text: "テキスト",
      size: 64,
      color: "#2E2A33",
      strokeColor: "#ffffff",
      strokeWidth: 8,
      transform: { x: 960, y: 200, scale: 1, flipX: false },
      z: 100 + scene.elements.length,
      enter: { type: "cut", delay: 0, dur: 0.4 },
      exit: { type: "cut", at: null, dur: 0.4 },
    };
    addElement(store, scene.id, el);
    setSelectedId(el.id);
  };
  const addBackground = (color: string) => {
    if (!scene) return;
    setSceneBackground(store, scene.id, color);
  };

  const deleteSelected = useCallback(() => {
    if (!scene || !selectedId) return;
    removeElement(store, scene.id, selectedId);
    setSelectedId(null);
  }, [scene, selectedId, store]);

  // キーボード: Delete / undo・redo / Space
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        bumpSeek();
        return;
      }
      if (typing) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === " ") {
        e.preventDefault();
        setPlayMode((m) => {
          if (m) return null;
          if (scene && tRef.current >= scene.duration - 1e-3) setTime(0);
          bumpSeek();
          return "scene";
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, deleteSelected, bumpSeek, scene, setTime]);

  // === ファイル ===
  async function handleOpenFolder() {
    if (!ensureFsSupport()) return;
    const adapter: FileSystemAdapter = new FsAccessAdapter();
    const ok = await adapter.pickProjectFolder();
    if (!ok) return;
    setFs(adapter);
    resolver.invalidate();
    const existing = await adapter.readTextFile(PROJECT_FILE);
    if (existing) {
      try {
        store.reset(parseProject(existing));
        setSavedRevision(store.revision);
        setSelectedSceneId(store.doc.scenes[0]?.id ?? null);
        setSelectedId(null);
        setTime(0);
        bumpSeek();
      } catch (err) {
        alert(`読込エラー: ${String(err)}`);
      }
    } else {
      store.reset(createEmptyProject());
      setSavedRevision(store.revision);
    }
  }

  async function handleSave() {
    if (!ensureFsSupport()) return;
    let adapter = fs;
    if (!adapter) {
      const created = new FsAccessAdapter();
      const ok = await created.pickProjectFolder();
      if (!ok) return;
      setFs(created);
      adapter = created;
    }
    try {
      await adapter.writeTextFile(PROJECT_FILE, toJson(store.doc));
      setSavedRevision(store.revision);
    } catch (err) {
      alert(`保存エラー: ${String(err)}`);
    }
  }

  const playingSceneId = playMode ? sceneId : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "system-ui, sans-serif" }}>
      {/* ツールバー */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 8px", borderBottom: "1px solid #ddd", flexWrap: "wrap" }}>
        <button onClick={handleOpenFolder}>フォルダを開く</button>
        <button onClick={handleSave}>保存</button>
        <input
          value={doc.title}
          onChange={(e) => setTitle(store, e.target.value)}
          style={{ width: "160px" }}
        />
        <span style={{ width: "1px", height: "20px", background: "#ddd" }} />
        <button onClick={() => { store.undo(); bumpSeek(); }} disabled={!canUndo}>↩</button>
        <button onClick={() => { store.redo(); bumpSeek(); }} disabled={!canRedo}>↪</button>
        <span style={{ width: "1px", height: "20px", background: "#ddd" }} />
        <button onClick={playScene} disabled={!scene}>▶ シーン再生</button>
        <button onClick={playAll} disabled={doc.scenes.length === 0}>▶ 通し再生</button>
        <button onClick={stop} disabled={!playMode}>⏹</button>
        {isDirty && <span style={{ color: "#e55" }}>● 未保存</span>}
      </div>

      {/* 3カラム */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: "180px", flexShrink: 0, borderRight: "1px solid #ddd", overflowY: "auto" }}>
          <AddPanel
            fs={fs}
            disabled={!scene}
            onAddCharacter={addCharacter}
            onAddText={addText}
            onAddBackground={addBackground}
          />
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "12px", overflow: "auto", background: "#e9e7e2" }}>
          {scene ? (
            <StageCanvas
              store={store}
              resolver={resolver}
              sceneId={sceneId}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={deleteSelected}
              tRef={tRef}
              playMode={playMode}
              onTime={setT}
              onReachEnd={onReachEnd}
              seekNonce={seekNonce}
              revision={revision}
              resolverRev={resolverRev}
            />
          ) : (
            <div style={{ color: "#888", marginTop: "40px" }}>
              シーンを追加してください(下の + ボタン)
            </div>
          )}
        </div>
        <div style={{ width: "260px", flexShrink: 0, borderLeft: "1px solid #ddd", overflowY: "auto" }}>
          {scene && <PropertyPanel store={store} sceneId={scene.id} element={selectedEl} />}
        </div>
      </div>

      {/* シーン帯 */}
      <SceneStrip
        store={store}
        doc={doc}
        selectedSceneId={sceneId}
        playingSceneId={playingSceneId}
        onSelect={selectScene}
      />

      {/* タイムライン */}
      {scene && (
        <Timeline
          store={store}
          scene={scene}
          t={t}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onScrub={onScrub}
          onScrubCommit={onScrubCommit}
        />
      )}
    </div>
  );
}
