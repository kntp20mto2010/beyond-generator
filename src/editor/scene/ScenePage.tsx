import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DocStore } from "../../core/doc-store.js";
import {
  createEmptyProject,
  type BalloonElement,
  type CharacterElement,
  type ProjectDoc,
  type SceneElement,
  type TextElement,
} from "../../core/schema/project.js";
import { newId } from "../../core/id.js";
import { setTitle } from "../../core/commands.js";
import {
  addElement,
  duplicateElement,
  removeElement,
  replaceElementRef,
  reorderElement,
  setElementLocked,
  setSceneBackground,
  setSceneBackgroundImage,
  unlockAllElements,
  updateElementTransform,
  type ReorderOp,
} from "../../core/commands-project.js";
import { toJson, parseProject } from "../../io/serialize.js";
import { FsAccessAdapter, PROJECT_FILE, isFsAccessSupported } from "../../io/fs.js";
import type { FileSystemAdapter } from "../../io/fs.js";
import { AssetResolver } from "../../io/asset-resolver.js";
import { useUiStore } from "../ui-store.js";
import { ThumbnailService } from "../thumbs/thumbnail-service.js";
import { StageCanvas, type PlayMode, type StageApi } from "./StageCanvas.js";
import { AddPanel } from "./AddPanel.js";
import { PropertyPanel } from "./PropertyPanel.js";
import { SceneStrip } from "./SceneStrip.js";
import { Timeline } from "./Timeline.js";
import {
  ContextMenu,
  type AlignOp,
  type ContextMenuInfo,
  type ReplaceCandidate,
} from "./ContextMenu.js";
import { copyElement, hasClipboard, readClipboard } from "./clipboard.js";
import { IconFolder, IconSave, IconUndo, IconRedo, IconPlay, IconPlayAll, IconStop, IconGrid } from "../ui/icons.js";

interface Props {
  store: DocStore<ProjectDoc>;
}

function ensureFsSupport(): boolean {
  if (isFsAccessSupported) return true;
  alert("このブラウザはフォルダ保存に非対応です。Chrome または Edge で開いてください。");
  return false;
}

// 新規追加時の初期z = 既存zの最大 + 1(最前面)
function nextZ(elements: readonly SceneElement[]): number {
  return elements.reduce((m, e) => Math.max(m, e.z), -1) + 1;
}

export function ScenePage({ store }: Props) {
  const doc = useSyncExternalStore((cb) => store.subscribe(cb), () => store.doc);
  const revision = useSyncExternalStore((cb) => store.subscribe(cb), () => store.revision);
  const canUndo = useSyncExternalStore((cb) => store.subscribe(cb), () => store.canUndo());
  const canRedo = useSyncExternalStore((cb) => store.subscribe(cb), () => store.canRedo());

  const { fs, savedRevision, setFs, setSavedRevision } = useUiStore();
  const isDirty = revision !== savedRevision;

  const resolver = useMemo(() => new AssetResolver(), []);
  const thumbs = useMemo(() => new ThumbnailService(), []);
  const [resolverRev, setResolverRev] = useState(0);
  useEffect(() => resolver.subscribe(() => setResolverRev((r) => r + 1)), [resolver]);

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 保存済キャラ一覧(AddPanel と 右クリック差し替えで共有)
  const [savedCharacters, setSavedCharacters] = useState<string[]>([]);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playMode, setPlayMode] = useState<PlayMode | null>(null);
  const [seekNonce, setSeekNonce] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  // 右クリックメニュー(対象elementId と メニュー位置のstage座標を保持)
  const [ctxMenu, setCtxMenu] = useState<
    { clientX: number; clientY: number; elementId: string | null; stageX: number; stageY: number } | null
  >(null);
  const stageApiRef = useRef<StageApi | null>(null);

  // 選択シーンの自動補正
  const sceneId =
    selectedSceneId && doc.scenes.some((s) => s.id === selectedSceneId)
      ? selectedSceneId
      : (doc.scenes[0]?.id ?? null);
  const scene = doc.scenes.find((s) => s.id === sceneId) ?? null;
  const selectedEl = scene?.elements.find((e) => e.id === selectedId) ?? null;

  // 参照キャラ・背景画像のロード
  useEffect(() => {
    // シーン内キャラ + 保存済キャラ + 内蔵キャラを全てロード(AddPanelのサムネ用)
    const refs = [
      "builtin:template-a",
      ...doc.scenes
        .flatMap((s) => s.elements)
        .filter((e): e is CharacterElement => e.kind === "character")
        .map((e) => e.ref),
      ...savedCharacters.map((f) => `characters/${f}`),
    ];
    void resolver.ensureLoaded(refs, fs);

    const images = doc.scenes
      .map((s) => s.background?.image)
      .filter((img): img is string => !!img);
    if (images.length > 0) void resolver.ensureImagesLoaded(images, fs);
  }, [doc, fs, resolver, savedCharacters]);

  // 保存済キャラ(characters/*.byc.json)を一覧化
  useEffect(() => {
    let live = true;
    (async () => {
      if (!fs) {
        setSavedCharacters([]);
        return;
      }
      const files = await fs.listFiles("characters");
      if (live) setSavedCharacters(files.filter((f) => f.endsWith(".byc.json")));
    })();
    return () => {
      live = false;
    };
  }, [fs]);

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
      z: nextZ(scene.elements),
      locked: false,
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
      z: nextZ(scene.elements),
      locked: false,
      enter: { type: "cut", delay: 0, dur: 0.4 },
      exit: { type: "cut", at: null, dur: 0.4 },
    };
    addElement(store, scene.id, el);
    setSelectedId(el.id);
  };
  const addBalloon = (shape: BalloonElement["shape"]) => {
    if (!scene) return;
    const el: BalloonElement = {
      id: newId(),
      kind: "balloon",
      shape,
      text: "セリフ",
      size: 40,
      w: 420,
      h: 240,
      fill: "#ffffff",
      textColor: "#2E2A33",
      lineColor: "#2E2A33",
      lineWidth: 4,
      tail: { x: -60, y: 220 },
      transform: { x: 620, y: 300, scale: 1, flipX: false },
      z: nextZ(scene.elements),
      locked: false,
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
  const setBackgroundImage = (image: string | null) => {
    if (!scene) return;
    setSceneBackgroundImage(store, scene.id, image);
  };

  const deleteSelected = useCallback(() => {
    if (!scene || !selectedId) return;
    removeElement(store, scene.id, selectedId);
    setSelectedId(null);
  }, [scene, selectedId, store]);

  // === コピー / ペースト / 複製 ===
  const copySelected = useCallback(() => {
    const el = scene?.elements.find((e) => e.id === selectedId);
    if (el) copyElement(el);
  }, [scene, selectedId]);

  // at 指定時はその stage 座標へ、無指定は +24 オフセット
  const pasteClipboard = useCallback(
    (at?: { x: number; y: number }) => {
      if (!scene) return;
      const src = readClipboard();
      if (!src) return;
      src.id = newId();
      if (at) {
        src.transform.x = at.x;
        src.transform.y = at.y;
      } else {
        src.transform.x += 24;
        src.transform.y += 24;
      }
      src.z = nextZ(scene.elements);
      addElement(store, scene.id, src);
      setSelectedId(src.id);
      if (src.kind === "character" && fs) void resolver.ensureLoaded([src.ref], fs);
      bumpSeek();
    },
    [scene, store, fs, resolver, bumpSeek],
  );

  const duplicateSelected = useCallback(() => {
    if (!scene || !selectedId) return;
    duplicateElement(store, scene.id, selectedId);
    bumpSeek();
  }, [scene, selectedId, store, bumpSeek]);

  const reorderSelected = useCallback(
    (op: ReorderOp) => {
      if (!scene || !selectedId) return;
      reorderElement(store, scene.id, selectedId, op);
    },
    [scene, selectedId, store],
  );

  const toggleLockSelected = useCallback(() => {
    const el = scene?.elements.find((e) => e.id === selectedId);
    if (!scene || !el) return;
    setElementLocked(store, scene.id, el.id, !el.locked);
  }, [scene, selectedId, store]);

  // 整列: Pixi bounds(ステージ座標)から必要シフトを計算し transform を更新
  const alignElement = useCallback(
    (elementId: string, op: AlignOp) => {
      if (!scene) return;
      const el = scene.elements.find((e) => e.id === elementId);
      if (!el || el.locked) return;
      const edges = stageApiRef.current?.getStageEdges(elementId);
      if (!edges) return;
      let dx = 0;
      let dy = 0;
      switch (op) {
        case "left":
          dx = 0 - edges.l;
          break;
        case "hcenter":
          dx = 960 - edges.cx;
          break;
        case "right":
          dx = 1920 - edges.r;
          break;
        case "top":
          dy = 0 - edges.t;
          break;
        case "vcenter":
          dy = 540 - edges.cy;
          break;
        case "bottom":
          dy = 1080 - edges.b;
          break;
      }
      updateElementTransform(store, scene.id, elementId, {
        x: el.transform.x + dx,
        y: el.transform.y + dy,
      });
    },
    [scene, store],
  );

  // 選択要素を矢印でナッジ(locked時は無効)
  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!scene) return;
      // 連続keydownでも失われないよう、最新のstore.docから読む(再レンダリング前のスナップショット参照を避ける)
      const liveScene = store.doc.scenes.find((s) => s.id === scene.id);
      const el = liveScene?.elements.find((e) => e.id === selectedId);
      if (!liveScene || !el || el.locked) return;
      updateElementTransform(store, liveScene.id, el.id, {
        x: el.transform.x + dx,
        y: el.transform.y + dy,
      });
    },
    [scene, selectedId, store],
  );

  // 右クリックメニュー要求(StageCanvas から clientX/Y + stage座標 + elementId)
  const onContextMenu = useCallback(
    (info: {
      clientX: number;
      clientY: number;
      stageX: number;
      stageY: number;
      elementId: string | null;
    }) => {
      setCtxMenu(info);
    },
    [],
  );

  // 差し替え候補: ハル(内蔵) + 保存済キャラ
  const replaceCandidates: ReplaceCandidate[] = useMemo(
    () => [
      { ref: "builtin:template-a", label: "ハル(内蔵)" },
      ...savedCharacters.map((f) => ({
        ref: `characters/${f}`,
        label: f.replace(/\.byc\.json$/, ""),
      })),
    ],
    [savedCharacters],
  );

  const doReplace = useCallback(
    (elementId: string, ref: string) => {
      if (!scene) return;
      replaceElementRef(store, scene.id, elementId, ref);
      if (fs) void resolver.ensureLoaded([ref], fs);
      bumpSeek();
    },
    [scene, store, fs, resolver, bumpSeek],
  );

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

      // Ctrl/Cmd 系ショートカット
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "c") {
          copySelected();
          return;
        }
        if (k === "v") {
          pasteClipboard();
          return;
        }
        if (k === "d") {
          e.preventDefault(); // ブックマーク防止
          duplicateSelected();
          return;
        }
        if (k === "l") {
          e.preventDefault(); // アドレスバー防止
          toggleLockSelected();
          return;
        }
        return;
      }

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
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        nudgeSelected(dx, dy);
      } else if (e.key === "[") {
        e.preventDefault();
        reorderSelected("backward");
      } else if (e.key === "]") {
        e.preventDefault();
        reorderSelected("forward");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    store,
    deleteSelected,
    bumpSeek,
    scene,
    setTime,
    copySelected,
    pasteClipboard,
    duplicateSelected,
    toggleLockSelected,
    nudgeSelected,
    reorderSelected,
  ]);

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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-app)", color: "var(--text)" }}>
      {/* ツールバー */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 8px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", background: "var(--bg-panel)" }}>
        <button className="ui-btn" onClick={handleOpenFolder}>
          <IconFolder /> フォルダを開く
        </button>
        <button className="ui-btn" onClick={handleSave}>
          <IconSave /> 保存
        </button>
        <input
          className="ui-input"
          value={doc.title}
          onChange={(e) => setTitle(store, e.target.value)}
          style={{ width: "160px" }}
        />
        <div className="ui-sep" />
        <button className="ui-icon-btn" onClick={() => { store.undo(); bumpSeek(); }} disabled={!canUndo} title="元に戻す">
          <IconUndo />
        </button>
        <button className="ui-icon-btn" onClick={() => { store.redo(); bumpSeek(); }} disabled={!canRedo} title="やり直す">
          <IconRedo />
        </button>
        <div className="ui-sep" />
        <button className="ui-btn" onClick={playScene} disabled={!scene} title="シーン再生">
          <IconPlay />
        </button>
        <button className="ui-btn" onClick={playAll} disabled={doc.scenes.length === 0} title="通し再生">
          <IconPlayAll />
        </button>
        <button className="ui-btn" onClick={stop} disabled={!playMode} title="停止">
          <IconStop />
        </button>
        <div className="ui-sep" />
        <button
          className={`ui-icon-btn${showGrid ? " ui-icon-btn--active" : ""}`}
          onClick={() => setShowGrid((g) => !g)}
          title="グリッド"
        >
          <IconGrid />
        </button>
        {isDirty && <span style={{ color: "var(--warn)", fontSize: "11px", marginLeft: "2px" }}>● 未保存</span>}
      </div>

      {/* 3カラム */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div className="ui-panel" style={{ width: "188px", flexShrink: 0, overflowY: "auto" }}>
          <AddPanel
            fs={fs}
            disabled={!scene}
            savedCharacters={savedCharacters}
            resolver={resolver}
            thumbs={thumbs}
            onAddCharacter={addCharacter}
            onAddText={addText}
            onAddBalloon={addBalloon}
            onAddBackground={addBackground}
            onSetBackgroundImage={setBackgroundImage}
          />
        </div>
        <div className="stage-frame">
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
              showGrid={showGrid}
              onContextMenu={onContextMenu}
              apiRef={stageApiRef}
            />
          ) : (
            <div style={{ color: "var(--text-dim)", marginTop: "40px", fontSize: "13px" }}>
              シーンを追加してください(下の + ボタン)
            </div>
          )}
        </div>
        <div className="ui-panel--right" style={{ width: "268px", flexShrink: 0, overflowY: "auto" }}>
          {scene && (
            <PropertyPanel
              store={store}
              sceneId={scene.id}
              scene={scene}
              element={selectedEl}
              t={t}
              resolver={resolver}
              thumbs={thumbs}
            />
          )}
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
          resolver={resolver}
          thumbs={thumbs}
        />
      )}

      {/* 右クリックメニュー */}
      {ctxMenu &&
        scene &&
        (() => {
          const targetEl = ctxMenu.elementId
            ? scene.elements.find((e) => e.id === ctxMenu.elementId) ?? null
            : null;
          const menuInfo: ContextMenuInfo = {
            clientX: ctxMenu.clientX,
            clientY: ctxMenu.clientY,
            element: targetEl,
          };
          const tid = targetEl?.id ?? null;
          return (
            <ContextMenu
              info={menuInfo}
              canPaste={hasClipboard()}
              replaceCandidates={replaceCandidates}
              onClose={() => setCtxMenu(null)}
              onCopy={() => {
                if (tid) copyElement(scene.elements.find((e) => e.id === tid)!);
              }}
              onPaste={() => pasteClipboard({ x: ctxMenu.stageX, y: ctxMenu.stageY })}
              onDuplicate={() => {
                if (tid) {
                  duplicateElement(store, scene.id, tid);
                  bumpSeek();
                }
              }}
              onFlip={() => {
                if (tid) {
                  const el = scene.elements.find((e) => e.id === tid);
                  if (el && el.kind === "character" && !el.locked) {
                    updateElementTransform(store, scene.id, tid, { flipX: !el.transform.flipX });
                  }
                }
              }}
              onReorder={(op) => {
                if (tid) reorderElement(store, scene.id, tid, op);
              }}
              onAlign={(op) => {
                if (tid) alignElement(tid, op);
              }}
              onToggleLock={() => {
                if (tid) {
                  const el = scene.elements.find((e) => e.id === tid);
                  if (el) setElementLocked(store, scene.id, tid, !el.locked);
                }
              }}
              onReplace={(ref) => {
                if (tid) doReplace(tid, ref);
              }}
              onDelete={() => {
                if (tid) {
                  removeElement(store, scene.id, tid);
                  setSelectedId(null);
                }
              }}
              onUnlockAll={() => unlockAllElements(store, scene.id)}
            />
          );
        })()}
    </div>
  );
}
