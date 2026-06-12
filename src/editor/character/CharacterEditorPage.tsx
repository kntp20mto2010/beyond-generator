import { useEffect, useRef, useState } from "react";
import { DocStore } from "../../core/doc-store.js";
import type { CharacterDoc } from "../../core/schema/character.js";
import { validateCharacter } from "../../core/schema/character.js";
import type { Shape } from "../../core/schema/geometry.js";
import {
  addShape,
  mirrorLR,
  movePin,
  removeShape,
  setName,
  setPaletteColor,
  setPartZ,
  updateShape,
} from "../../core/commands-character.js";
import { mirrorPartSlot, mirrorFaceSlot } from "../../core/mirror.js";
import { TEMPLATE_A } from "../../presets/characters/template-a.js";
import { newId } from "../../core/id.js";
import { characterDocIO } from "../../io/serialize.js";
import { resolveFill } from "../../core/schema/geometry.js";
import {
  getShapes,
  getPins,
  getZ,
  listSlotRefs,
  refKey,
  refLabel,
} from "./slot-ref.js";
import type { SlotRef } from "./slot-ref.js";
import { EditCanvas } from "./EditCanvas.js";
import { PosePreview } from "./PosePreview.js";
import {
  FsAccessAdapter,
  isFsAccessSupported,
  type FileSystemAdapter,
} from "../../io/fs.js";
import { useUiStore } from "../ui-store.js";

type Tool = "select" | "rect" | "ellipse";

const PALETTE_SLOTS = ["skin", "hair", "primary", "secondary", "accent", "line"] as const;
const PALETTE_LABELS: Record<string, string> = {
  skin: "肌",
  hair: "髪",
  primary: "メイン色",
  secondary: "サブ色",
  accent: "アクセント",
  line: "ライン",
};

const charStore = new DocStore<CharacterDoc>(structuredClone(TEMPLATE_A));

interface Props {
  fs: FileSystemAdapter | null;
}

export function CharacterEditorPage({ fs }: Props) {
  const [doc, setDoc] = useState(charStore.doc);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selectedRef, setSelectedRef] = useState<SlotRef | null>(null);
  const [selectedShapeIndex, setSelectedShapeIndex] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [savedRevision, setSavedRevision] = useState(charStore.revision);
  const [charFiles, setCharFiles] = useState<string[]>([]);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const loadBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return charStore.subscribe(() => {
      setDoc(charStore.doc);
      setCanUndo(charStore.canUndo());
      setCanRedo(charStore.canRedo());
      // ガード: selectedShapeIndex が範囲外になったら解除
      if (selectedRef !== null && selectedShapeIndex !== null) {
        const shapes = getShapes(charStore.doc, selectedRef) ?? [];
        if (selectedShapeIndex >= shapes.length) {
          setSelectedShapeIndex(null);
        }
      }
    });
  }, [selectedRef, selectedShapeIndex]);

  const isDirty = charStore.revision !== savedRevision;

  const handleNew = () => {
    const newDoc: CharacterDoc = {
      ...structuredClone(TEMPLATE_A),
      id: newId(),
      name: "新しいキャラクター",
    };
    charStore.reset(newDoc);
    setSelectedRef(null);
    setSelectedShapeIndex(null);
    setSavedRevision(charStore.revision);
  };

  const setFs = useUiStore((s) => s.setFs);

  // fs未設定ならこのタブから直接フォルダを選ばせる
  const ensureFs = async (): Promise<FileSystemAdapter | null> => {
    if (fs) return fs;
    if (!isFsAccessSupported) {
      window.alert(
        "このブラウザはフォルダ保存に非対応です。Chrome または Edge で開いてください。",
      );
      return null;
    }
    const adapter = new FsAccessAdapter();
    const ok = await adapter.pickProjectFolder();
    if (!ok) return null;
    setFs(adapter);
    return adapter;
  };

  const handleSave = async () => {
    const issues = validateCharacter(doc);
    if (issues.length > 0) {
      const ok = window.confirm(
        `検証の警告:\n${issues.join("\n")}\n\n保存しますか？`,
      );
      if (!ok) return;
    }
    const adapter = await ensureFs();
    if (!adapter) return;
    const json = characterDocIO.toJson(doc);
    await adapter.writeTextFile(`characters/${doc.id}.byc.json`, json);
    setSavedRevision(charStore.revision);
  };

  const handleLoadMenuOpen = async () => {
    const adapter = await ensureFs();
    if (!adapter) { setCharFiles([]); return; }
    const files = await adapter.listFiles("characters");
    setCharFiles(files.filter((f) => f.endsWith(".byc.json")));
    setShowLoadMenu(true);
  };

  const handleLoadFile = async (filename: string) => {
    setShowLoadMenu(false);
    if (!fs) return;
    const json = await fs.readTextFile(`characters/${filename}`);
    if (!json) { window.alert("ファイルが読み込めませんでした"); return; }
    try {
      const loaded = characterDocIO.parse(json);
      charStore.reset(loaded);
      setSelectedRef(null);
      setSelectedShapeIndex(null);
      setSavedRevision(charStore.revision);
    } catch (e) {
      window.alert(`読込エラー: ${String(e)}`);
    }
  };

  const selectedShapes = selectedRef ? (getShapes(doc, selectedRef) ?? []) : [];
  const selectedShape = selectedShapeIndex !== null ? selectedShapes[selectedShapeIndex] ?? null : null;
  const pins = selectedRef ? getPins(doc, selectedRef) : {};

  const canMirror = selectedRef !== null && (() => {
    if (selectedRef.kind === "part") return mirrorPartSlot(selectedRef.slot) !== null;
    if (selectedRef.kind === "face") return mirrorFaceSlot(selectedRef.slot) !== null;
    if (selectedRef.kind === "hair") return selectedRef.layer === "mid" && (selectedRef.index === 0 || selectedRef.index === 1);
    return false;
  })();

  const allRefs = listSlotRefs(doc);

  const toolBtn = (t: Tool, label: string) => (
    <button
      onClick={() => setTool(t)}
      style={{
        padding: "3px 8px",
        fontSize: "12px",
        background: tool === t ? "#5B7DB1" : "#eee",
        color: tool === t ? "#fff" : "#333",
        border: "1px solid #bbb",
        borderRadius: "3px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 40px)", overflow: "hidden" }}>
      {/* toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "6px", padding: "4px 8px",
        borderBottom: "1px solid #ddd", background: "#f8f8f8", flexShrink: 0,
      }}>
        <button
          onClick={handleNew}
          style={{ padding: "3px 10px", fontSize: "12px", border: "1px solid #bbb", borderRadius: "3px", cursor: "pointer", background: "#fff" }}
        >
          新規(テンプレ複製)
        </button>

        <div style={{ position: "relative" }}>
          <button
            ref={loadBtnRef}
            onClick={handleLoadMenuOpen}
            style={{ padding: "3px 10px", fontSize: "12px", border: "1px solid #bbb", borderRadius: "3px", cursor: "pointer", background: "#fff" }}
          >
            読込▼
          </button>
          {showLoadMenu && (
            <div style={{
              position: "absolute", top: "100%", left: 0, zIndex: 100,
              background: "#fff", border: "1px solid #ccc", borderRadius: "4px",
              minWidth: "180px", boxShadow: "0 2px 8px rgba(0,0,0,.15)",
            }}>
              {charFiles.length === 0 ? (
                <div style={{ padding: "6px 12px", color: "#888", fontSize: "12px" }}>
                  ファイルなし
                </div>
              ) : charFiles.map((f) => (
                <button
                  key={f}
                  onClick={() => handleLoadFile(f)}
                  style={{
                    display: "block", width: "100%", padding: "5px 12px",
                    textAlign: "left", border: "none", background: "none",
                    fontSize: "12px", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#eef"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                >
                  {f}
                </button>
              ))}
              <button
                onClick={() => setShowLoadMenu(false)}
                style={{
                  display: "block", width: "100%", padding: "4px 12px",
                  textAlign: "left", border: "none", borderTop: "1px solid #eee",
                  background: "none", fontSize: "11px", color: "#888", cursor: "pointer",
                }}
              >
                閉じる
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          style={{ padding: "3px 10px", fontSize: "12px", border: "1px solid #bbb", borderRadius: "3px", cursor: "pointer", background: "#fff" }}
        >
          保存
        </button>

        <span style={{ fontSize: "12px" }}>名前:</span>
        <input
          value={doc.name}
          onChange={(e) => setName(charStore, e.target.value)}
          style={{ fontSize: "12px", padding: "2px 6px", border: "1px solid #ccc", borderRadius: "3px", width: "120px" }}
        />

        <button
          onClick={() => charStore.undo()}
          disabled={!canUndo}
          title="元に戻す (Ctrl+Z)"
          style={{ padding: "3px 8px", fontSize: "12px", border: "1px solid #bbb", borderRadius: "3px", cursor: canUndo ? "pointer" : "default", background: "#fff", opacity: canUndo ? 1 : 0.4 }}
        >
          ↩戻す
        </button>
        <button
          onClick={() => charStore.redo()}
          disabled={!canRedo}
          title="やり直す (Shift+Ctrl+Z)"
          style={{ padding: "3px 8px", fontSize: "12px", border: "1px solid #bbb", borderRadius: "3px", cursor: canRedo ? "pointer" : "default", background: "#fff", opacity: canRedo ? 1 : 0.4 }}
        >
          ↪やり直す
        </button>
        {isDirty && <span style={{ fontSize: "11px", color: "#e07030" }}>●未保存</span>}
      </div>

      {/* main area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* slot list */}
        <div style={{
          width: "120px", flexShrink: 0, overflowY: "auto",
          borderRight: "1px solid #ddd", background: "#fafafa", padding: "4px 0",
        }}>
          <div style={{ fontSize: "11px", color: "#888", padding: "2px 8px" }}>スロット一覧</div>
          {allRefs.map((ref) => {
            const key = refKey(ref);
            const isSelected = selectedRef !== null && refKey(selectedRef) === key;
            const shapes = getShapes(doc, ref) ?? [];
            return (
              <button
                key={key}
                onClick={() => {
                  setSelectedRef(ref);
                  setSelectedShapeIndex(null);
                }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "4px 8px", border: "none",
                  background: isSelected ? "#dde8f7" : "none",
                  fontSize: "12px", cursor: "pointer",
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {refLabel(ref)}
                <span style={{ fontSize: "10px", color: "#aaa", marginLeft: "4px" }}>({shapes.length})</span>
              </button>
            );
          })}
        </div>

        {/* canvas */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          {/* canvas toolbar */}
          <div style={{
            display: "flex", gap: "4px", padding: "4px 8px",
            borderBottom: "1px solid #eee", background: "#f5f5f5", flexShrink: 0,
          }}>
            {toolBtn("select", "選択")}
            {toolBtn("rect", "矩形")}
            {toolBtn("ellipse", "楕円")}
            {canMirror && selectedRef && (
              <button
                onClick={() => mirrorLR(charStore, selectedRef)}
                style={{ padding: "3px 8px", fontSize: "12px", border: "1px solid #bbb", borderRadius: "3px", cursor: "pointer", background: "#fff", marginLeft: "8px" }}
              >
                L→Rミラーコピー
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <EditCanvas
              charStore={charStore}
              selectedRef={selectedRef}
              selectedShapeIndex={selectedShapeIndex}
              tool={tool}
              onSelectShape={(idx) => {
                setSelectedShapeIndex(idx);
                if (tool !== "select") setTool("select");
              }}
              onShapeCountChange={() => setTool("select")}
            />
          </div>
        </div>

        {/* right panel */}
        <div style={{
          width: "220px", flexShrink: 0, overflowY: "auto",
          borderLeft: "1px solid #ddd", background: "#fafafa", padding: "6px 8px",
        }}>
          {/* palette */}
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>パレット</div>
          {PALETTE_SLOTS.map((slot) => (
            <div key={slot} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
              <span style={{ fontSize: "11px", width: "60px" }}>{PALETTE_LABELS[slot] ?? slot}</span>
              <input
                type="color"
                value={doc.palette[slot] ?? "#888888"}
                onChange={(e) => setPaletteColor(charStore, slot, e.target.value)}
                style={{ width: "36px", height: "20px", cursor: "pointer", border: "1px solid #ccc" }}
              />
              <span style={{ fontSize: "10px", color: "#888" }}>{doc.palette[slot] ?? ""}</span>
            </div>
          ))}

          {/* selected slot shapes */}
          {selectedRef && (
            <>
              <div style={{ fontSize: "11px", color: "#888", marginTop: "8px", marginBottom: "4px" }}>
                {refLabel(selectedRef)} シェイプ
              </div>
              {selectedShapes.map((shape, i) => (
                <ShapeRow
                  key={i}
                  shape={shape}
                  index={i}
                  selected={selectedShapeIndex === i}
                  palette={doc.palette}
                  onSelect={() => setSelectedShapeIndex(i)}
                  onRemove={() => {
                    removeShape(charStore, selectedRef, i);
                    if (selectedShapeIndex === i) setSelectedShapeIndex(null);
                  }}
                />
              ))}
              <button
                onClick={() => {
                  addShape(charStore, selectedRef, { kind: "rect", x: -20, y: -20, w: 40, h: 40, r: 0, fill: "@primary" });
                  setSelectedShapeIndex(selectedShapes.length);
                }}
                style={{ fontSize: "11px", padding: "2px 8px", marginTop: "4px", border: "1px solid #bbb", borderRadius: "3px", cursor: "pointer", background: "#fff" }}
              >
                ＋追加
              </button>

              {/* selected shape properties */}
              {selectedShape && (
                <ShapeProps
                  shape={selectedShape}
                  onChange={(patch) => {
                    if (selectedShapeIndex !== null) {
                      updateShape(charStore, selectedRef, selectedShapeIndex, patch, `shape:${refKey(selectedRef)}:${selectedShapeIndex}`);
                    }
                  }}
                />
              )}

              {/* z order for part */}
              {selectedRef.kind === "part" && (() => {
                const z = getZ(doc, selectedRef) ?? 0;
                return (
                  <div style={{ marginTop: "8px" }}>
                    <span style={{ fontSize: "11px", color: "#888" }}>Z順: </span>
                    <input
                      type="number"
                      value={z}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!isNaN(v)) setPartZ(charStore, selectedRef.slot, v);
                      }}
                      style={{ width: "60px", fontSize: "12px", padding: "1px 4px" }}
                    />
                  </div>
                );
              })()}

              {/* pins */}
              <div style={{ fontSize: "11px", color: "#888", marginTop: "8px", marginBottom: "2px" }}>ピン</div>
              {Object.entries(pins).map(([name, pos]) => {
                const capturedRef = selectedRef;
                return (
                  <PinRow
                    key={name}
                    name={name}
                    pos={pos}
                    onChange={(newPos) => {
                      if (capturedRef) {
                        movePin(charStore, capturedRef, name, newPos);
                      }
                    }}
                  />
                );
              })}
            </>
          )}

          {/* pose preview */}
          <div style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "8px" }}>
            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>ポーズプレビュー</div>
            <PosePreview charStore={charStore} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- sub-components ----

function ShapeRow({
  shape,
  index,
  selected,
  palette,
  onSelect,
  onRemove,
}: {
  shape: Shape;
  index: number;
  selected: boolean;
  palette: Record<string, string>;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const fillColor = shape.fill ? resolveFill(shape.fill, palette) : "none";
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "4px",
        padding: "2px 4px", background: selected ? "#dde8f7" : "none",
        borderRadius: "3px", cursor: "pointer",
      }}
      onClick={onSelect}
    >
      <div style={{ width: "14px", height: "14px", background: fillColor, border: "1px solid #ccc", borderRadius: "2px", flexShrink: 0 }} />
      <span style={{ fontSize: "11px", flex: 1 }}>{shape.kind}[{index}]</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{ fontSize: "10px", padding: "0 4px", border: "1px solid #ddd", borderRadius: "2px", cursor: "pointer", background: "#fff", color: "#a33" }}
      >
        ×
      </button>
    </div>
  );
}

function ShapeProps({
  shape,
  onChange,
}: {
  shape: Shape;
  palette?: Record<string, string>;
  onChange: (patch: Partial<Shape>) => void;
}) {
  const fillVal = shape.fill ?? "@primary";

  return (
    <div style={{ marginTop: "6px", fontSize: "11px" }}>
      <div style={{ marginBottom: "3px" }}>
        <span style={{ color: "#888" }}>fill: </span>
        {fillVal.startsWith("@") ? (
          <select
            value={fillVal}
            onChange={(e) => onChange({ fill: e.target.value } as Partial<Shape>)}
            style={{ fontSize: "11px" }}
          >
            {PALETTE_SLOTS.map((s) => (
              <option key={s} value={`@${s}`}>@{s}</option>
            ))}
            <option value={fillVal.startsWith("@") ? "#888888" : fillVal}>固定色</option>
          </select>
        ) : (
          <input
            type="color"
            value={fillVal.startsWith("#") ? fillVal : "#888888"}
            onChange={(e) => onChange({ fill: e.target.value } as Partial<Shape>)}
            style={{ width: "36px", height: "18px" }}
          />
        )}
      </div>

      {shape.kind === "rect" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px" }}>
          <NumField label="x" value={shape.x} onChange={(v) => onChange({ x: v } as Partial<Shape>)} />
          <NumField label="y" value={shape.y} onChange={(v) => onChange({ y: v } as Partial<Shape>)} />
          <NumField label="w" value={shape.w} onChange={(v) => onChange({ w: Math.max(1, v) } as Partial<Shape>)} />
          <NumField label="h" value={shape.h} onChange={(v) => onChange({ h: Math.max(1, v) } as Partial<Shape>)} />
          <NumField label="r" value={shape.r ?? 0} onChange={(v) => onChange({ r: Math.max(0, v) } as Partial<Shape>)} />
        </div>
      )}
      {shape.kind === "ellipse" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px" }}>
          <NumField label="cx" value={shape.cx} onChange={(v) => onChange({ cx: v } as Partial<Shape>)} />
          <NumField label="cy" value={shape.cy} onChange={(v) => onChange({ cy: v } as Partial<Shape>)} />
          <NumField label="rx" value={shape.rx} onChange={(v) => onChange({ rx: Math.max(0.5, v) } as Partial<Shape>)} />
          <NumField label="ry" value={shape.ry} onChange={(v) => onChange({ ry: Math.max(0.5, v) } as Partial<Shape>)} />
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      <span style={{ color: "#888", width: "14px" }}>{label}</span>
      <input
        type="number"
        step="1"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        style={{ width: "52px", fontSize: "11px", padding: "1px 3px" }}
      />
    </div>
  );
}

function PinRow({
  name,
  pos,
  onChange,
}: {
  name: string;
  pos: [number, number];
  onChange: (newPos: [number, number]) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }}>
      <span style={{ fontSize: "11px", color: "#f80", width: "44px", flexShrink: 0 }}>{name}</span>
      <NumInput
        value={pos[0]}
        onChange={(v) => onChange([v, pos[1]])}
      />
      <NumInput
        value={pos[1]}
        onChange={(v) => onChange([pos[0], v])}
      />
    </div>
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      step="1"
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      style={{ width: "52px", fontSize: "11px", padding: "1px 3px" }}
    />
  );
}
