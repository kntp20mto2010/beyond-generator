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
  KIND_LABEL,
  PLACEMENT_LABEL,
  VIEW_LABEL,
  ALLOWED_ANGLES_BY_PLACEMENT,
  type ObjectDef,
  type ObjectVariant,
  type ObjectViewName,
  type ObjectKind,
  type ObjectPlacement,
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

export function ObjectPage({ onJumpToSource }: { onJumpToSource: (sourcePath: string) => void }) {
  // 各 def の各 view を1タイルとして並べる。家具によっては 1 view、2 view 両方を持つ。
  const allTiles: { def: ObjectDef; view: ObjectViewName; variant: ObjectVariant }[] = [];
  for (const def of OBJECT_CATALOG) {
    for (const view of Object.keys(def.views) as ObjectViewName[]) {
      const variant = def.views[view];
      if (variant) allTiles.push({ def, view, variant });
    }
  }
  // 利用可能な kind / placement(カタログに登場するものだけチップ表示)
  const kindsUsed = Array.from(
    new Set(OBJECT_CATALOG.map((d) => d.kind).filter((k): k is ObjectKind => !!k)),
  );
  const placementsUsed = Array.from(
    new Set(OBJECT_CATALOG.map((d) => d.placement).filter((p): p is ObjectPlacement => !!p)),
  );
  const anglesUsed = Array.from(
    new Set(allTiles.map((t) => t.view)),
  );
  // 抽出元 (moodboard から切り出した家具) が一つでもあればフィルタ行を出す
  const hasAnySource = OBJECT_CATALOG.some((d) => !!d.source);
  const [selectedKinds, setSelectedKinds] = useState<Set<ObjectKind>>(new Set());
  const [selectedPlacements, setSelectedPlacements] = useState<Set<ObjectPlacement>>(new Set());
  const [selectedAngles, setSelectedAngles] = useState<Set<ObjectViewName>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<"yes" | "no">>(new Set());
  // 透過状況: src -> { transparentPct, opaque }。/__object-alpha から取得。alphaVersion を上げると再取得。
  const [alphaMap, setAlphaMap] = useState<Record<string, { transparentPct: number; opaque: boolean }> | null>(null);
  const [alphaVersion, setAlphaVersion] = useState(0);
  const [selectedTrans, setSelectedTrans] = useState<Set<"done" | "todo">>(new Set());
  // 不足角度フィルタ (floor 家具で未生成の view を絞る)
  const [selectedMissing, setSelectedMissing] = useState<Set<ObjectViewName>>(new Set());
  const toggleKind = (k: ObjectKind) =>
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  const togglePlacement = (p: ObjectPlacement) =>
    setSelectedPlacements((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      // placement が変わったら、その配置で使えない角度を選択集合から自動除外
      // (壁掛け選択時の `selectedAngles=side` が見えない 0 件を残さない)
      setSelectedAngles((angles) => {
        if (next.size === 0 || angles.size === 0) return angles;
        const allowedNow = new Set<ObjectViewName>(
          [...next].flatMap((pp) => [...ALLOWED_ANGLES_BY_PLACEMENT[pp]]),
        );
        const pruned = new Set([...angles].filter((a) => allowedNow.has(a)));
        return pruned.size === angles.size ? angles : pruned;
      });
      return next;
    });
  const toggleAngle = (a: ObjectViewName) =>
    setSelectedAngles((prev) => {
      const next = new Set(prev);
      next.has(a) ? next.delete(a) : next.add(a);
      return next;
    });
  const toggleSource = (s: "yes" | "no") =>
    setSelectedSources((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  const toggleTrans = (t: "done" | "todo") =>
    setSelectedTrans((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  // 透過状況をサーバから取得 (alphaVersion で再取得)
  useEffect(() => {
    let live = true;
    fetch(`/__object-alpha`)
      .then((r) => r.json())
      .then((data: { files?: { src: string; transparentPct?: number; opaque?: boolean }[] }) => {
        if (!live) return;
        const map: Record<string, { transparentPct: number; opaque: boolean }> = {};
        for (const f of data.files ?? []) {
          if (typeof f.transparentPct === "number") {
            map[f.src] = { transparentPct: f.transparentPct, opaque: !!f.opaque };
          }
        }
        setAlphaMap(map);
      })
      .catch(() => { if (live) setAlphaMap({}); });
    return () => { live = false; };
  }, [alphaVersion]);

  // src の透過状態: done(透過済) / todo(要透過) / unknown(未取得)
  const transOf = (src: string): "done" | "todo" | "unknown" => {
    if (!alphaMap) return "unknown";
    const e = alphaMap[src];
    if (!e) return "unknown";
    return e.opaque ? "todo" : "done";
  };
  const opaqueCount = alphaMap ? allTiles.filter((t) => transOf(t.variant.src) === "todo").length : 0;

  // def が持てる角度のうち未生成のもの (floor 家具のみ対象。front 専用 placement は空)
  const missingAnglesOf = (def: ObjectDef): ObjectViewName[] => {
    if (!def.placement) return [];
    const allowed = ALLOWED_ANGLES_BY_PLACEMENT[def.placement];
    if (allowed.length <= 1) return [];
    return allowed.filter((a) => !def.views[a]);
  };
  const toggleMissing = (a: ObjectViewName) =>
    setSelectedMissing((prev) => {
      const next = new Set(prev);
      next.has(a) ? next.delete(a) : next.add(a);
      return next;
    });
  // 不足角度ごとの家具数 (def 単位)
  const missingCounts: Record<ObjectViewName, number> = { front: 0, "front-dimetric": 0, side: 0 };
  for (const def of OBJECT_CATALOG) {
    for (const a of missingAnglesOf(def)) missingCounts[a] += 1;
  }

  const tiles = allTiles.filter(({ def, view, variant }) => {
    if (selectedKinds.size > 0 && (!def.kind || !selectedKinds.has(def.kind))) return false;
    if (selectedPlacements.size > 0 && (!def.placement || !selectedPlacements.has(def.placement))) return false;
    if (selectedAngles.size > 0 && !selectedAngles.has(view)) return false;
    if (selectedSources.size > 0 && !selectedSources.has(def.source ? "yes" : "no")) return false;
    if (selectedTrans.size > 0 && alphaMap) {
      const st = transOf(variant.src);
      if (st === "unknown" || !selectedTrans.has(st)) return false;
    }
    if (selectedMissing.size > 0) {
      const miss = missingAnglesOf(def);
      if (![...selectedMissing].some((a) => miss.includes(a))) return false;
    }
    return true;
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "var(--bg-app)", color: "var(--text)" }}>
      <div style={{ fontWeight: 700, marginBottom: "12px", fontSize: "14px" }}>
        オブジェクト({OBJECT_CATALOG.length} 家具 / {allTiles.length} 視点バリアント
        {tiles.length !== allTiles.length ? ` ・ 表示中 ${tiles.length}` : ""}
        {opaqueCount > 0 ? <span style={{ color: "var(--err, #c44)" }}> ・ 要透過 {opaqueCount}</span> : ""})
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "12px" }}>
        カタログの全オブジェクト。各家具は front / side の 2 視点を持てる。
        Codex で逆向きに出てしまった場合は「水平反転して上書き」で直接 PNG を反転保存できる。
      </div>
      <FilterChipRow
        label="種類"
        items={kindsUsed.map((k) => ({ key: k, label: KIND_LABEL[k] }))}
        selected={selectedKinds as Set<string>}
        onToggle={(k) => toggleKind(k as ObjectKind)}
        onClear={() => setSelectedKinds(new Set())}
      />
      <FilterChipRow
        label="配置"
        items={placementsUsed.map((p) => ({ key: p, label: PLACEMENT_LABEL[p] }))}
        selected={selectedPlacements as Set<string>}
        onToggle={(p) => togglePlacement(p as ObjectPlacement)}
        onClear={() => setSelectedPlacements(new Set())}
      />
      <FilterChipRow
        label="角度"
        items={anglesUsed.map((a) => ({ key: a, label: VIEW_LABEL[a] }))}
        selected={selectedAngles as Set<string>}
        onToggle={(a) => toggleAngle(a as ObjectViewName)}
        onClear={() => setSelectedAngles(new Set())}
        disabledKeys={
          selectedPlacements.size === 0
            ? undefined
            : new Set(
                anglesUsed.filter(
                  (a) =>
                    ![...selectedPlacements].some((p) =>
                      ALLOWED_ANGLES_BY_PLACEMENT[p].includes(a),
                    ),
                ),
              )
        }
        disabledTitle="選択中の配置では使われない角度"
      />
      {hasAnySource && (
        <FilterChipRow
          label="抽出元"
          items={[
            { key: "yes", label: "あり" },
            { key: "no", label: "なし" },
          ]}
          selected={selectedSources as Set<string>}
          onToggle={(s) => toggleSource(s as "yes" | "no")}
          onClear={() => setSelectedSources(new Set())}
        />
      )}
      <FilterChipRow
        label="透過"
        items={[
          { key: "todo", label: "要透過" },
          { key: "done", label: "透過済" },
        ]}
        selected={selectedTrans as Set<string>}
        onToggle={(t) => toggleTrans(t as "done" | "todo")}
        onClear={() => setSelectedTrans(new Set())}
      />
      <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "10px" }}>
        「要透過」= 背景が透過されていない (alpha 全面不透明)。各タイルの「透過する」で
        chromakey(端から白系背景を flood-fill 除去)を in-place 実行する(寸法は維持)。
      </div>
      <FilterChipRow
        label="不足角度"
        items={(["front", "front-dimetric", "side"] as ObjectViewName[]).map((a) => ({
          key: a,
          label: `${VIEW_LABEL[a]}なし${missingCounts[a] ? ` (${missingCounts[a]})` : ""}`,
        }))}
        selected={selectedMissing as Set<string>}
        onToggle={(a) => toggleMissing(a as ObjectViewName)}
        onClear={() => setSelectedMissing(new Set())}
      />
      <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "10px" }}>
        floor 家具は <b>正面 / 立体 / 壁付</b> の 3 角度を持てる。各タイルの「角度:」行で充足
        (✓) / 不足 (—) を確認できる。moodboard は主に「立体」を供給するため、多くは「正面」が穴。
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "12px",
          marginTop: "12px",
        }}
      >
        {tiles.map(({ def, view, variant }) => (
          <ObjectTile
            key={`${def.id}|${view}`}
            def={def}
            view={view}
            variant={variant}
            trans={transOf(variant.src)}
            onAfterTransparent={() => setAlphaVersion((v) => v + 1)}
            onJumpToSource={onJumpToSource}
          />
        ))}
      </div>
      <GeneratedImportSection />
    </div>
  );
}

function FilterChipRow({
  label, items, selected, onToggle, onClear, disabledKeys, disabledTitle,
}: {
  label: string;
  items: { key: string; label: string }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  disabledKeys?: Set<string>;
  disabledTitle?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
      <span style={{ fontSize: "11px", color: "var(--text-dim)", minWidth: "36px" }}>{label}</span>
      <button
        type="button"
        onClick={onClear}
        style={{
          padding: "2px 8px",
          fontSize: "11px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: selected.size === 0 ? "var(--accent, #3b82f6)" : "var(--bg-elev)",
          color: selected.size === 0 ? "white" : "var(--text-dim)",
          cursor: "pointer",
          fontWeight: selected.size === 0 ? 600 : 400,
        }}
      >
        全て
      </button>
      {items.map((it) => {
        const on = selected.has(it.key);
        const off = (disabledKeys?.has(it.key) ?? false) && !on;
        return (
          <button
            key={it.key}
            type="button"
            onClick={off ? undefined : () => onToggle(it.key)}
            aria-disabled={off}
            aria-pressed={on}
            title={off ? disabledTitle : undefined}
            style={{
              padding: "2px 8px",
              fontSize: "11px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: on ? "var(--accent, #3b82f6)" : "var(--bg-elev)",
              color: on ? "white" : "var(--text)",
              cursor: off ? "not-allowed" : "pointer",
              fontWeight: on ? 600 : 400,
              opacity: off ? 0.35 : 1,
              textDecoration: off ? "line-through" : undefined,
            }}
          >
            {it.label}
          </button>
        );
      })}
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

function ObjectTile({
  def,
  view,
  variant,
  trans,
  onAfterTransparent,
  onJumpToSource,
}: {
  def: ObjectDef;
  view: ObjectViewName;
  variant: ObjectVariant;
  trans: "done" | "todo" | "unknown";
  onAfterTransparent: () => void;
  onJumpToSource: (sourcePath: string) => void;
}) {
  const cells = variantCells(variant);
  const scale = containScale(variant.nativeW, variant.nativeH, cells);
  const [version, setVersion] = useState(0);
  const [url, setUrl] = useState<string | undefined>();
  const [flip, setFlip] = useState<FlipState>({ status: "idle" });
  const [transp, setTransp] = useState<FlipState>({ status: "idle" });
  const isDefault = def.defaultView === view;

  const handleMakeTransparent = async () => {
    setTransp({ status: "running" });
    try {
      const res = await fetch("/__object-make-transparent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src: variant.src }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || data.stderr || `server ${res.status}`);
      const pct = data.result?.transparentPct;
      setTransp({ status: "ok", message: `透過化済み${typeof pct === "number" ? ` (${pct.toFixed(1)}% 透過)` : ""}` });
      setVersion((v) => v + 1); // 画像再読込
      onAfterTransparent(); // 親の透過マップ再取得
    } catch (e) {
      setTransp({ status: "error", message: String((e as Error)?.message ?? e) });
    }
  };

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
            background: "var(--accent, #3b82f6)",
            color: "white",
            fontWeight: 600,
          }}
          title={`角度: ${view}`}
        >
          {VIEW_LABEL[view]}
        </span>
        {isDefault && (
          <span style={{ fontSize: "9px", color: "var(--text-dim)", fontWeight: 400 }}>(default)</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {trans !== "unknown" && (
          <span
            style={{
              fontSize: "10px",
              padding: "1px 6px",
              borderRadius: 10,
              background: trans === "done" ? "var(--ok, #3a6)" : "var(--err, #c44)",
              color: "white",
              border: "1px solid var(--border)",
              fontWeight: 600,
            }}
            title={trans === "done" ? "背景が透過済み" : "背景が透過されていない (alpha 全面不透明)"}
          >
            {trans === "done" ? "透過済" : "要透過"}
          </span>
        )}
        {trans === "unknown" && (
          <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: 10, background: "var(--bg-elev)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>
            透過 判定中…
          </span>
        )}
        {(def.kind || def.placement || def.source) && (
          <>
          {def.kind && (
            <span
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: 10,
                background: "var(--bg-elev)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
              title="種類"
            >
              {KIND_LABEL[def.kind]}
            </span>
          )}
          {def.placement && (
            <span
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: 10,
                background: "var(--bg-elev)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
              title="配置"
            >
              {PLACEMENT_LABEL[def.placement]}
            </span>
          )}
          {def.source && (
            <button
              type="button"
              onClick={() => onJumpToSource(def.source!)}
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: 10,
                background: "var(--ok, #3a6)",
                color: "white",
                border: "1px solid var(--border)",
                cursor: "pointer",
                fontWeight: 600,
              }}
              title={`抽出元タブへジャンプ: ${def.source}`}
            >
              抽出元あり ⤴
            </button>
          )}
          </>
        )}
      </div>
      {def.placement === "floor" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "10px" }}>
          <span style={{ color: "var(--text-dim)" }}>角度:</span>
          {(["front", "front-dimetric", "side"] as ObjectViewName[]).map((a) => {
            const has = !!def.views[a];
            return (
              <span
                key={a}
                style={{
                  color: has ? "var(--ok, #3a6)" : "var(--text-dim)",
                  fontWeight: has ? 600 : 400,
                  opacity: has ? 1 : 0.7,
                }}
                title={has ? `${VIEW_LABEL[a]} あり` : `${VIEW_LABEL[a]} なし (要生成)`}
              >
                {VIEW_LABEL[a]}{has ? "✓" : "—"}
              </span>
            );
          })}
        </div>
      )}
      <div style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--text-dim)", lineHeight: 1.5 }}>
        <div>id: {def.id}</div>
        <div>src: {variant.src.replace(/^assets\/objects\//, "")}</div>
        <div>native: {variant.nativeW} × {variant.nativeH}</div>
        <div>cells: {cells.w} × {cells.h} (scale {scale.toFixed(3)})</div>
        {def.source && (
          <div title={def.source}>抽出元: {def.source.replace(/^assets\/generated\//, "")}</div>
        )}
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
        onClick={handleMakeTransparent}
        disabled={transp.status === "running"}
        title="chromakey(端から白系背景を flood-fill 除去)を in-place 実行して背景を透過します。寸法は維持。"
        style={{
          marginTop: "auto",
          fontSize: "11px",
          ...(trans === "todo"
            ? { background: "var(--err, #c44)", color: "white", fontWeight: 600 }
            : {}),
        }}
      >
        {transp.status === "running" ? "透過中..." : trans === "todo" ? "透過する (要透過)" : "透過する"}
      </button>
      {transp.message && (
        <div
          style={{
            fontSize: "10px",
            color: transp.status === "error" ? "var(--err, #c44)" : "var(--ok, #3a6)",
            wordBreak: "break-all",
          }}
        >
          {transp.message}
        </div>
      )}
      <button
        className="ui-btn"
        onClick={handleFlip}
        disabled={!url || flip.status === "running"}
        title="画像を左右反転して assets/objects/ の同じファイルに上書きします"
        style={{ fontSize: "11px" }}
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
