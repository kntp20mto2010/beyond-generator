// オブジェクト管理タブ: OBJECT_CATALOG をタイル grid 表示し、メタ情報を見せる。
// 各タイルに「水平反転して上書き」ボタン。Vite middleware の /__object-flip 経由で
// assets/objects/ 配下の PNG を直接上書きする。
import { useEffect, useState } from "react";
import {
  OBJECT_CATALOG,
  objectDefaultCells,
  objectScale,
  type ObjectDef,
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
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "var(--bg-app)", color: "var(--text)" }}>
      <div style={{ fontWeight: 700, marginBottom: "12px", fontSize: "14px" }}>
        オブジェクト({OBJECT_CATALOG.length})
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "16px" }}>
        カタログの全オブジェクトと現在の画像。Codex で逆向きに出てしまった場合は
        「水平反転して上書き」で直接 PNG を反転保存できる。
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        {OBJECT_CATALOG.map((def) => (
          <ObjectTile key={def.id} def={def} />
        ))}
      </div>
    </div>
  );
}

function ObjectTile({ def }: { def: ObjectDef }) {
  const cells = objectDefaultCells(def);
  const scale = objectScale(def);
  const [version, setVersion] = useState(0);
  const [url, setUrl] = useState<string | undefined>();
  const [flip, setFlip] = useState<FlipState>({ status: "idle" });

  useEffect(() => {
    let live = true;
    let prev = url;
    fetchAsObjectUrl(def.src, version)
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
  }, [def.src, version]);

  const handleFlip = async () => {
    if (!url) return;
    setFlip({ status: "running" });
    try {
      const dataUrl = await flipImageHorizontally(url);
      const res = await fetch("/__object-flip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src: def.src, dataUrl }),
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
            alt={def.label}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>読込中</span>
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: "13px" }}>{def.label}</div>
      <div style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--text-dim)", lineHeight: 1.5 }}>
        <div>id: {def.id}</div>
        <div>native: {def.nativeW} × {def.nativeH}</div>
        <div>cells: {cells.w} × {cells.h} (scale {scale.toFixed(3)})</div>
        {def.seat && (
          <div>
            seat: dx={def.seat.dx}, dy={def.seat.dy}
          </div>
        )}
      </div>
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
