// オブジェクト管理タブ: OBJECT_CATALOG をタイル grid 表示し、メタ情報を見せる。
// 各タイルに「水平反転して上書き」ボタン。Vite middleware の /__object-flip 経由で
// assets/objects/ 配下の PNG を直接上書きする。
// 上部に「Codex 生成物の取り込み」セクションを置き、assets/generated/*.png を
// chroma-key + bbox-crop で透過 PNG 化して assets/objects/ に保存できる。
import { useCallback, useEffect, useState } from "react";
import {
  OBJECT_CATALOG,
  variantCells,
  containScale,
  PROJECTION_PRESETS,
  type ObjectDef,
  type ObjectVariant,
  type ObjectViewName,
} from "../scene/objects-catalog.js";

interface FlipState {
  status: "idle" | "running" | "ok" | "error";
  message?: string;
}

// path を fetch して objectURL を返す。version で cache を bust。
function fetchAsObjectUrl(path: string, version: number): Promise<string> {
  const cacheBuster = version > 0 ? `?v=${version}` : "";
  return fetch(`/${path}${cacheBuster}`)
    .then((r) => {
      if (!r.ok) throw new Error(`fetch ${path} failed: ${r.status}`);
      return r.blob();
    })
    .then((blob) => URL.createObjectURL(blob));
}

// Image を水平反転してデータURLを得る。
async function flipImageHorizontally(url: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("image load failed"));
    im.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export function ObjectPage() {
  // 各 def の各 view を1タイルとして並べる。家具によっては 1 view、2 view 両方を持つ。
  const tiles: { def: ObjectDef; view: ObjectViewName; variant: ObjectVariant }[] = [];
  for (const def of OBJECT_CATALOG) {
    for (const view of Object.keys(def.views) as ObjectViewName[]) {
      const variant = def.views[view];
      if (variant) tiles.push({ def, view, variant });
    }
  }
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "var(--bg-app)", color: "var(--text)" }}>
      <GeneratedImportSection />
      <div style={{ fontWeight: 700, marginBottom: "12px", marginTop: "24px", fontSize: "14px" }}>
        オブジェクト({OBJECT_CATALOG.length} 家具 / {tiles.length} 視点バリアント)
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "16px" }}>
        カタログの全オブジェクト。各家具は front / side の 2 視点を持てる。
        Codex で逆向きに出てしまった場合は「水平反転して上書き」で直接 PNG を反転保存できる。
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        {tiles.map(({ def, view, variant }) => (
          <ObjectTile key={`${def.id}|${view}`} def={def} view={view} variant={variant} />
        ))}
      </div>
    </div>
  );
}

// ─── 取り込みセクション ──────────────────────────────

interface GenEntry {
  src: string;            // "assets/generated/foo.png"
  basename: string;       // "foo.png"
  size: number;
  mtime: number;
  importedAs: string | null;
}

interface ImportState {
  status: "idle" | "running" | "ok" | "error";
  message?: string;
}

// Codex 生成物リスト + 取り込みフォーム。1 件ずつ outputName/閾値を指定して
// /__object-import を叩く。
function GeneratedImportSection() {
  const [entries, setEntries] = useState<GenEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(40);
  const [reloadVersion, setReloadVersion] = useState(0);

  const reload = useCallback(() => setReloadVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    if (filter) q.set("filter", filter);
    fetch(`/__generated-list?${q}`)
      .then((r) => r.json())
      .then((data: { entries: GenEntry[]; total: number }) => {
        if (!live) return;
        setEntries(data.entries);
        setTotal(data.total);
      })
      .catch(() => {
        if (live) setEntries([]);
      });
    return () => { live = false; };
  }, [filter, limit, reloadVersion]);

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <div style={{ fontWeight: 700, fontSize: "14px" }}>
          Codex 生成物の取り込み
          {entries && (
            <span style={{ color: "var(--text-dim)", fontWeight: 400, marginLeft: "8px", fontSize: "11px" }}>
              ({entries.length} / 全{total} 件)
            </span>
          )}
        </div>
        <button className="ui-btn" onClick={reload} style={{ fontSize: "11px" }}>再読込</button>
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "8px" }}>
        assets/generated/*.png を chroma-key(端から flood-fill で白系背景除去)+
        最大連結成分 isolate + bbox-crop で透過 PNG 化し、assets/objects/&lt;名前&gt;.png に保存。
        保存後はカタログに手動でエントリ追加してください。
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
        <label style={{ fontSize: "11px", color: "var(--text-dim)" }}>絞り込み:</label>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="basename 部分一致 (例: sakura, bouquet)"
          style={{ flex: 1, fontSize: "11px", padding: "4px 6px", background: "var(--bg-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "3px" }}
        />
        <label style={{ fontSize: "11px", color: "var(--text-dim)" }}>表示数:</label>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 40)))}
          min={1}
          max={200}
          style={{ width: "60px", fontSize: "11px", padding: "4px 6px", background: "var(--bg-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "3px" }}
        />
      </div>
      {entries === null ? (
        <div style={{ color: "var(--text-dim)", fontSize: "11px" }}>読込中...</div>
      ) : entries.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "11px" }}>該当ファイルなし</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "10px",
          }}
        >
          {entries.map((e) => (
            <ImportTile key={e.src} entry={e} onAfterImport={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// outputName の初回提案: "<basename>-20260618.png" → "<basename>"。先頭の日付や末尾の
// "-rN" 等のサフィックスを残してもよいが、ここでは拡張子を取るだけにする(編集可能)。
function suggestOutputName(basename: string): string {
  return basename.replace(/\.png$/i, "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatMtime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ImportTile({ entry, onAfterImport }: { entry: GenEntry; onAfterImport: () => void }) {
  const [outputName, setOutputName] = useState(() => suggestOutputName(entry.basename));
  const [bright, setBright] = useState(235);
  const [sat, setSat] = useState(10);
  const [largestOnly, setLargestOnly] = useState(true);
  const [noCrop, setNoCrop] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [state, setState] = useState<ImportState>({ status: "idle" });

  const handleImport = async () => {
    if (!/^[a-zA-Z0-9_-]+$/.test(outputName)) {
      setState({ status: "error", message: "出力名は英数 + _ - のみ" });
      return;
    }
    setState({ status: "running" });
    try {
      const res = await fetch("/__object-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          src: entry.src,
          outputName,
          brightThresh: bright,
          satThresh: sat,
          largestOnly,
          noCrop,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || data.stderr || `server ${res.status}`);
      }
      const r = data.result as { width: number; height: number; transparentPct: number } | null;
      const detail = r ? ` (${r.width}×${r.height}, ${r.transparentPct.toFixed(1)}% 透過)` : "";
      setState({ status: "ok", message: `${data.output} 保存${detail}` });
      onAfterImport();
    } catch (e) {
      setState({ status: "error", message: String((e as Error)?.message ?? e) });
    }
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "6px",
        background: "var(--bg-panel)",
        padding: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "120px",
          background: "var(--bg-app)",
          borderRadius: "4px",
          backgroundImage:
            "linear-gradient(45deg, var(--border) 25%, transparent 25%), linear-gradient(-45deg, var(--border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--border) 75%), linear-gradient(-45deg, transparent 75%, var(--border) 75%)",
          backgroundSize: "12px 12px",
          backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <img
          src={`/${entry.src}`}
          alt={entry.basename}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </div>
      <div style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--text-dim)", wordBreak: "break-all" }}>
        {entry.basename}
        <div>{formatBytes(entry.size)} · {formatMtime(entry.mtime)}</div>
        {entry.importedAs && (
          <div style={{ color: "var(--ok, #3a6)", marginTop: "2px" }}>取込済: {entry.importedAs}</div>
        )}
      </div>
      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: "var(--text-dim)", flexShrink: 0 }}>名前:</span>
        <input
          type="text"
          value={outputName}
          onChange={(e) => setOutputName(e.target.value)}
          style={{ flex: 1, fontSize: "11px", padding: "3px 6px", background: "var(--bg-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "3px", fontFamily: "monospace" }}
        />
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "10px", color: "var(--text-dim)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
          <input type="checkbox" checked={largestOnly} onChange={(e) => setLargestOnly(e.target.checked)} />
          最大成分のみ
        </label>
        <button
          onClick={() => setAdvanced((v) => !v)}
          style={{ fontSize: "10px", padding: "2px 6px", background: "transparent", color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: "3px", cursor: "pointer" }}
        >
          詳細 {advanced ? "▲" : "▼"}
        </button>
      </div>
      {advanced && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "10px", color: "var(--text-dim)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            明度閾値 (BG&ge;):
            <input type="number" value={bright} min={0} max={255} onChange={(e) => setBright(Number(e.target.value) || 235)}
              style={{ width: "60px", fontSize: "10px", padding: "2px 4px", background: "var(--bg-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "3px" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            彩度閾値 (sat&le;):
            <input type="number" value={sat} min={0} max={255} onChange={(e) => setSat(Number(e.target.value) || 10)}
              style={{ width: "60px", fontSize: "10px", padding: "2px 4px", background: "var(--bg-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "3px" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
            <input type="checkbox" checked={noCrop} onChange={(e) => setNoCrop(e.target.checked)} />
            クロップしない(透過化のみ)
          </label>
        </div>
      )}
      <button
        className="ui-btn"
        onClick={handleImport}
        disabled={state.status === "running"}
        title="chroma-key + bbox-crop で assets/objects/ に保存"
        style={{ marginTop: "auto", fontSize: "11px" }}
      >
        {state.status === "running" ? "取り込み中..." : entry.importedAs ? "上書き取り込み" : "取り込み"}
      </button>
      {state.message && (
        <div
          style={{
            fontSize: "10px",
            color: state.status === "error" ? "var(--err, #c44)" : "var(--ok, #3a6)",
            wordBreak: "break-all",
          }}
        >
          {state.message}
        </div>
      )}
    </div>
  );
}

// ─── 投影メタ + プロンプト表示 ──────────────────────────

function ProjectionPromptSection({ variant }: { variant: ObjectVariant }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [promptErr, setPromptErr] = useState<string | null>(null);
  const preset = variant.projection ? PROJECTION_PRESETS[variant.projection] : undefined;

  useEffect(() => {
    if (!showPrompt || promptText !== null || !variant.promptFile) return;
    fetch(`/assets/objects/prompts/${variant.promptFile}.md`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((t) => setPromptText(t))
      .catch((e) => setPromptErr(String((e as Error)?.message ?? e)));
  }, [showPrompt, promptText, variant.promptFile]);

  if (!preset && !variant.promptFile) {
    return (
      <div style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--text-dim)" }}>
        <div style={{ fontStyle: "italic", opacity: 0.6 }}>投影/プロンプト 記録なし</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--text-dim)", lineHeight: 1.5 }}>
      {preset && (
        <>
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>{preset.type}</span>
          </div>
          {preset.eyeLevelCm !== undefined && (
            <div>eye: {preset.eyeLevelCm === "sitting" ? "sitting" : `${preset.eyeLevelCm}cm`}</div>
          )}
          {preset.rotationDeg !== undefined && <div>rotation: {preset.rotationDeg}°</div>}
          {preset.cameraTiltDeg !== undefined && <div>tilt (pitch): {preset.cameraTiltDeg}°</div>}
          {preset.lateralAxisTiltDeg !== undefined && (
            <div>lateral axis: {preset.lateralAxisTiltDeg}°</div>
          )}
          {preset.depthAxisTiltDeg !== undefined && <div>depth axis: {preset.depthAxisTiltDeg}°</div>}
          {preset.ratioWDH && <div>W:D:H: {preset.ratioWDH}</div>}
        </>
      )}
      {variant.promptFile && (
        <>
          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            style={{
              marginTop: 4,
              padding: "2px 6px",
              fontSize: "10px",
              fontFamily: "monospace",
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            {showPrompt ? "▾ prompt" : "▸ prompt"} {variant.promptFile}
          </button>
          {showPrompt && (
            <pre
              style={{
                marginTop: 4,
                padding: "6px 8px",
                background: "var(--bg-app)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                fontSize: "9.5px",
                lineHeight: 1.35,
                color: "var(--text-dim)",
                maxHeight: "200px",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {promptErr ? `(エラー: ${promptErr})` : promptText ?? "読込中…"}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

// ─── 既存カタログタイル ──────────────────────────────

function ObjectTile({ def, view, variant }: { def: ObjectDef; view: ObjectViewName; variant: ObjectVariant }) {
  const cells = variantCells(variant);
  const scale = containScale(variant.nativeW, variant.nativeH, cells);
  const [version, setVersion] = useState(0);
  const [url, setUrl] = useState<string | undefined>();
  const [flip, setFlip] = useState<FlipState>({ status: "idle" });
  const isDefault = def.defaultView === view;

  useEffect(() => {
    let live = true;
    let prev = url;
    fetchAsObjectUrl(variant.src, version)
      .then((u) => {
        if (!live) {
          URL.revokeObjectURL(u);
          return;
        }
        setUrl(u);
        if (prev) URL.revokeObjectURL(prev);
      })
      .catch(() => {
        if (live) setFlip({ status: "error", message: "画像の読み込みに失敗" });
      });
    return () => {
      live = false;
    };
    // url を依存に入れると revoke ループになるため除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant.src, version]);

  const handleFlip = async () => {
    if (!url) return;
    setFlip({ status: "running" });
    try {
      const dataUrl = await flipImageHorizontally(url);
      const res = await fetch("/__object-flip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src: variant.src, dataUrl }),
      });
      if (!res.ok) throw new Error(`server: ${res.status}`);
      setFlip({ status: "ok", message: "反転して上書き済み" });
      setVersion((v) => v + 1); // 再読み込み
      // ※ seat.dx が 0 でない場合は反転後に符号を反転する必要がある。
      // 現状カタログは全て dx=0 のため何もしない。新規家具で dx!=0 を入れる場合は要対応。
    } catch (e) {
      setFlip({ status: "error", message: String((e as Error)?.message ?? e) });
    }
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "6px",
        background: "var(--bg-panel)",
        padding: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "140px",
          background: "var(--bg-app)",
          borderRadius: "4px",
          backgroundImage:
            "linear-gradient(45deg, var(--border) 25%, transparent 25%), linear-gradient(-45deg, var(--border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--border) 75%), linear-gradient(-45deg, transparent 75%, var(--border) 75%)",
          backgroundSize: "12px 12px",
          backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {url ? (
          <img
            src={url}
            alt={`${def.label}/${view}`}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>読込中</span>
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", gap: 6 }}>
        {def.label}
        <span
          style={{
            fontSize: "10px",
            padding: "1px 6px",
            borderRadius: "3px",
            background: view === "front" ? "var(--accent, #3b82f6)" : "var(--bg-elev)",
            color: view === "front" ? "white" : "var(--text-dim)",
            fontWeight: 600,
          }}
        >
          {view}
        </span>
        {isDefault && (
          <span style={{ fontSize: "9px", color: "var(--text-dim)", fontWeight: 400 }}>(default)</span>
        )}
      </div>
      <div style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--text-dim)", lineHeight: 1.5 }}>
        <div>id: {def.id}</div>
        <div>src: {variant.src.replace(/^assets\/objects\//, "")}</div>
        <div>native: {variant.nativeW} × {variant.nativeH}</div>
        <div>cells: {cells.w} × {cells.h} (scale {scale.toFixed(3)})</div>
        {variant.seat && (
          <div>
            seat: dx={variant.seat.dx}, dy={variant.seat.dy}
          </div>
        )}
        {variant.shadowSrc && <div>shadow: ✓</div>}
      </div>
      <ProjectionPromptSection variant={variant} />

      <button
        className="ui-btn"
        onClick={handleFlip}
        disabled={!url || flip.status === "running"}
        title="画像を左右反転して assets/objects/ の同じファイルに上書きします"
        style={{ marginTop: "auto", fontSize: "11px" }}
      >
        {flip.status === "running" ? "反転中..." : "水平反転して上書き"}
      </button>
      {flip.message && (
        <div
          style={{
            fontSize: "10px",
            color: flip.status === "error" ? "var(--err, #c44)" : "var(--ok, #3a6)",
          }}
        >
          {flip.message}
        </div>
      )}
    </div>
  );
}
