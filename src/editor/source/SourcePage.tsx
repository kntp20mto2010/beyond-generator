// 抽出元タブ: 部屋全体の moodboard ごとに、置かれている家具リストと抽出進捗を一覧する。
// 各家具が「抽出済 / 作成済(別生成) / 未作成」のどれかを catalog から導出して表示する。
import { useEffect, useMemo, useState } from "react";
import {
  MOODBOARD_SOURCES,
  STATUS_LABEL,
  itemStatus,
  type ItemStatus,
  type MoodboardItem,
  type MoodboardSource,
  viewExtractionCell,
  type ViewExtractionCell,
} from "./moodboard-manifest.js";
import { OBJECT_CATALOG, VIEW_LABEL, type ObjectVariant, type ObjectViewName } from "../scene/objects-catalog.js";
import { findBboxForVariant, type MaskBbox } from "./mask-match.js";

const STATUS_COLOR: Record<ItemStatus, string> = {
  extracted: "var(--ok, #3a6)",
  made: "var(--warn, #c98a2b)",
  todo: "var(--bg-elev)",
};
const STATUS_TEXT_COLOR: Record<ItemStatus, string> = {
  extracted: "white",
  made: "white",
  todo: "var(--text-dim)",
};
const STATUS_MARK: Record<ItemStatus, string> = {
  extracted: "✓",
  made: "◐",
  todo: "□",
};
const STATUS_ORDER: ItemStatus[] = ["extracted", "made", "todo"];

export function SourcePage({
  jumpTarget,
  onJumpHandled,
}: {
  jumpTarget?: string | null;
  onJumpHandled?: () => void;
}) {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [masks, setMasks] = useState<MaskBbox[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    fetch("/__moodboard-positions")
      .then((r) => r.json())
      .then((data: { masks?: MaskBbox[] }) => {
        if (live && data.masks) setMasks(data.masks);
      })
      .catch(() => {});
    fetch("/__catalog-hidden")
      .then((r) => r.json())
      .then((data: { hidden?: string[] }) => {
        if (live && data.hidden) setHiddenIds(new Set(data.hidden));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // オブジェクトタブの「抽出元あり ⤴」から jumpTarget(moodboard パス)が来たら、
  // 該当カードへスクロール + ハイライト点灯。jumpTarget は消費後すぐ null に戻されるため、
  // 消灯タイマーは別 effect(highlightId 依存)に分離する(ここで持つと null 復帰の再実行でタイマーが消える)。
  useEffect(() => {
    if (!jumpTarget) return;
    const target = MOODBOARD_SOURCES.find((s) => s.imagePaths.some((im) => im.path === jumpTarget));
    onJumpHandled?.();
    if (!target) return;
    setHighlightId(target.id);
    document.getElementById(`source-card-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    // onJumpHandled は安定参照前提で依存に含めない(含めると App 再描画毎に再実行)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTarget]);

  // ハイライトは一定時間で自動消灯 (jumpTarget の変化とは独立)
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 2200);
    return () => clearTimeout(t);
  }, [highlightId]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "var(--bg-app)", color: "var(--text)" }}>
      <div style={{ fontWeight: 700, marginBottom: "4px", fontSize: "14px" }}>抽出元 moodboard と家具チェックリスト</div>
      <div style={{ color: "var(--text-dim)", fontSize: "11px", marginBottom: "16px" }}>
        部屋全体の理想レイアウト画から、どの家具を単体オブジェクト化したかを追う。
        <span style={{ color: "var(--ok, #3a6)", marginLeft: 8 }}>✓ 抽出済</span>= この moodboard を source に抽出済み /
        <span style={{ color: "var(--warn, #c98a2b)", marginLeft: 6 }}>◐ 作成済</span>= catalog にあるが別生成(source 未設定) /
        <span style={{ marginLeft: 6 }}>□ 未作成</span>= catalog 未登録。
      </div>
      {MOODBOARD_SOURCES.map((src) => (
        <SourceCard key={src.id} src={src} highlight={highlightId === src.id} masks={masks} hiddenIds={hiddenIds} />
      ))}
    </div>
  );
}

function SourceCard({ src, highlight, masks, hiddenIds }: { src: MoodboardSource; highlight?: boolean; masks: MaskBbox[]; hiddenIds: Set<string> }) {
  const paths = useMemo(() => src.imagePaths.map((im) => im.path), [src]);
  const counts = useMemo(() => {
    const c: Record<ItemStatus, number> = { extracted: 0, made: 0, todo: 0 };
    for (const it of src.items) c[itemStatus(it, paths, hiddenIds)] += 1;
    return c;
  }, [src, paths, hiddenIds]);
  const total = src.items.length;

  // group 見出しごとにまとめる(出現順を保持)
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, MoodboardItem[]>();
    for (const it of src.items) {
      if (!map.has(it.group)) {
        map.set(it.group, []);
        order.push(it.group);
      }
      map.get(it.group)!.push(it);
    }
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, [src]);

  return (
    <div
      id={`source-card-${src.id}`}
      style={{
        border: highlight ? "2px solid var(--ok, #3a6)" : "1px solid var(--border)",
        borderRadius: "8px",
        background: "var(--bg-panel)",
        padding: "12px",
        marginBottom: "16px",
        boxShadow: highlight ? "0 0 0 3px color-mix(in srgb, var(--ok, #3a6) 35%, transparent)" : "none",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "2px" }}>
        {src.labelJa}
        <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 400, marginLeft: 6 }}>
          ({src.imagePaths.length} 画像)
        </span>
      </div>

      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 左: moodboard 画像 (複数枚を縦に並べる) */}
        <div style={{ flex: "1 1 360px", minWidth: "280px", maxWidth: "560px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {src.imagePaths.map((im, idx) => (
            <div key={im.path}>
              {im.labelJa && (
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text)", marginBottom: "2px" }}>
                  {idx + 1}. {im.labelJa}
                </div>
              )}
              {im.contributes && (
                <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "4px", fontStyle: "italic" }}>
                  {im.contributes}
                </div>
              )}
              <img
                src={`/${im.path}`}
                alt={im.labelJa ?? im.path}
                style={{ width: "100%", borderRadius: "6px", border: "1px solid var(--border)", display: "block" }}
              />
              <div style={{ fontFamily: "monospace", fontSize: "9.5px", color: "var(--text-dim)", marginTop: "2px" }}>
                {im.path}
              </div>
              <QCLayout sourceImagePath={im.path} masks={masks} hiddenIds={hiddenIds} />
            </div>
          ))}
        </div>

        {/* 右: サマリ + チェックリスト */}
        <div style={{ flex: "2 1 420px", minWidth: "320px" }}>
          <ProgressSummary counts={counts} total={total} />
          <div style={{ marginTop: "10px" }}>
            {groups.map(({ group, items }) => (
              <div key={group} style={{ marginBottom: "10px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--text-dim)",
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: "3px",
                    marginBottom: "4px",
                  }}
                >
                  {group}
                </div>
                <FurnitureTable items={items} paths={paths} hiddenIds={hiddenIds} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* QC ストリップ: この source 配下で抽出済の家具を全部サムネで並べてスタイル一貫性を目視判定 */}
      <QCStrip paths={paths} hiddenIds={hiddenIds} />
    </div>
  );
}

// QC プレビュー Step2: 空背景 + 抽出済家具を moodboard 元配置で並べる。
// 各 variant の bbox を mask スキャン結果から引いて、空背景の上に絶対座標で配置する。
const EMPTY_BG = "/assets/backgrounds/sakura-room-empty.png";
const MOODBOARD_W = 1920;
const MOODBOARD_H = 1080;

function QCLayout({ sourceImagePath, masks, hiddenIds }: { sourceImagePath: string; masks: MaskBbox[]; hiddenIds: Set<string> }) {
  // この source 画像と一致する catalog variant + その bbox を集める (hidden は除外)
  const placements = useMemo(() => {
    const out: { defLabel: string; view: ObjectViewName; src: string; bbox: MaskBbox["bbox"] }[] = [];
    for (const def of OBJECT_CATALOG) {
      if (hiddenIds.has(def.id)) continue;
      for (const [view, variant] of Object.entries(def.views) as [ObjectViewName, ObjectVariant | undefined][]) {
        if (!variant) continue;
        if (hiddenIds.has(`${def.id}|${view}`)) continue;
        const path = variant.source ?? def.source;
        if (path !== sourceImagePath) continue;
        const mask = findBboxForVariant(variant, MOODBOARD_W, MOODBOARD_H, masks);
        if (!mask) continue;
        out.push({ defLabel: def.label, view, src: variant.src, bbox: mask.bbox });
      }
    }
    return out;
  }, [sourceImagePath, masks, hiddenIds]);

  if (placements.length === 0) {
    return (
      <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--text-dim)", fontStyle: "italic" }}>
        QC レイアウト: この画像に紐付く mask が見つからず自動配置できません
      </div>
    );
  }

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "2px" }}>
        ↓ QC レイアウト ({placements.length} 家具を空背景に moodboard 元配置で重ねたもの)
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${MOODBOARD_W} / ${MOODBOARD_H}`,
          borderRadius: "6px",
          border: "1px solid var(--border)",
          overflow: "hidden",
          backgroundImage: `url(${EMPTY_BG})`,
          backgroundSize: "100% 100%",
        }}
      >
        {placements.map((p) => (
          <img
            key={p.src}
            src={`/${p.src}`}
            alt={`${p.defLabel}/${p.view}`}
            title={`${p.defLabel} (${VIEW_LABEL[p.view]})`}
            style={{
              position: "absolute",
              left: `${(p.bbox.x / MOODBOARD_W) * 100}%`,
              top: `${(p.bbox.y / MOODBOARD_H) * 100}%`,
              width: `${(p.bbox.w / MOODBOARD_W) * 100}%`,
              height: `${(p.bbox.h / MOODBOARD_H) * 100}%`,
              objectFit: "contain",
              objectPosition: "center",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// QC プレビュー Step1: この source の抽出済 variant を catalog からピックアップしてサムネ並べる。
// moodboard 原画とスタイルが合ってるか目視で確認できる (配置自動化は Step2 で予定)。
function QCStrip({ paths, hiddenIds }: { paths: string[]; hiddenIds: Set<string> }) {
  const pathSet = useMemo(() => new Set(paths), [paths]);
  const tiles = useMemo(() => {
    const out: { defId: string; defLabel: string; view: ObjectViewName; src: string; imageIdx: number }[] = [];
    for (const def of OBJECT_CATALOG) {
      if (hiddenIds.has(def.id)) continue;
      for (const [view, variant] of Object.entries(def.views) as [ObjectViewName, NonNullable<(typeof def.views)[ObjectViewName]>][]) {
        if (!variant) continue;
        if (hiddenIds.has(`${def.id}|${view}`)) continue;
        const sourcePath = variant.source ?? def.source;
        if (!sourcePath || !pathSet.has(sourcePath)) continue;
        const imageIdx = paths.indexOf(sourcePath) + 1;
        out.push({ defId: def.id, defLabel: def.label, view, src: variant.src, imageIdx });
      }
    }
    return out;
  }, [paths, pathSet, hiddenIds]);

  if (tiles.length === 0) return null;
  return (
    <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
        QC プレビュー
        <span style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: "10px", marginLeft: "6px" }}>
          ({tiles.length} variants) — moodboard と画風・色トーン・スケールが揃っているか目視確認
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "8px",
        }}
      >
        {tiles.map((t) => (
          <div
            key={`${t.defId}|${t.view}`}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "var(--bg-panel)",
              padding: "6px",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100px",
                background: "var(--bg-app)",
                borderRadius: "3px",
                backgroundImage:
                  "linear-gradient(45deg, var(--border) 25%, transparent 25%), linear-gradient(-45deg, var(--border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--border) 75%), linear-gradient(-45deg, transparent 75%, var(--border) 75%)",
                backgroundSize: "10px 10px",
                backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                marginBottom: "4px",
              }}
            >
              <img
                src={`/${t.src}`}
                alt={`${t.defLabel}/${t.view}`}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
            <div style={{ fontSize: "10px", fontWeight: 600 }}>
              {t.defLabel}
              <span
                style={{
                  fontSize: "9px",
                  marginLeft: "4px",
                  padding: "0 4px",
                  borderRadius: 6,
                  background: "var(--accent, #3b82f6)",
                  color: "white",
                  fontWeight: 600,
                }}
              >
                {VIEW_LABEL[t.view]}
              </span>
              <span
                style={{
                  fontSize: "9px",
                  marginLeft: "3px",
                  padding: "0 4px",
                  borderRadius: 6,
                  background: "var(--ok, #3a6)",
                  color: "white",
                  fontWeight: 600,
                }}
                title={paths[t.imageIdx - 1]?.split("/").pop()}
              >
                {t.imageIdx}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressSummary({ counts, total }: { counts: Record<ItemStatus, number>; total: number }) {
  const done = counts.extracted;
  return (
    <div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "11px", marginBottom: "6px" }}>
        {STATUS_ORDER.map((s) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <StatusBadge status={s} />
            <span style={{ color: "var(--text-dim)" }}>{counts[s]}</span>
          </span>
        ))}
        <span style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
          抽出 {done}/{total}
        </span>
      </div>
      {/* 進捗バー: 抽出済(緑) + 作成済(琥珀) を積む */}
      <div style={{ height: "6px", borderRadius: "3px", background: "var(--bg-elev)", overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${(counts.extracted / total) * 100}%`, background: "var(--ok, #3a6)" }} />
        <div style={{ width: `${(counts.made / total) * 100}%`, background: "var(--warn, #c98a2b)" }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span
      style={{
        fontSize: "10px",
        padding: "1px 6px",
        borderRadius: 10,
        background: STATUS_COLOR[status],
        color: STATUS_TEXT_COLOR[status],
        border: "1px solid var(--border)",
        whiteSpace: "nowrap",
        fontWeight: 600,
      }}
    >
      {STATUS_MARK[status]} {STATUS_LABEL[status]}
    </span>
  );
}

// 家具テーブル: 1 行 = 1 家具、列 = 正面 / 立体 / 壁付。セル値は何番目の画像から抽出したかの index (1-based)。
function FurnitureTable({ items, paths, hiddenIds }: { items: MoodboardItem[]; paths: string[]; hiddenIds: Set<string> }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <th style={{ textAlign: "left", padding: "3px 4px", color: "var(--text-dim)", fontWeight: 600 }}>家具</th>
          <th style={{ width: "40px", padding: "3px 4px", color: "var(--text-dim)", fontWeight: 600 }}>正面</th>
          <th style={{ width: "40px", padding: "3px 4px", color: "var(--text-dim)", fontWeight: 600 }}>立体</th>
          <th style={{ width: "40px", padding: "3px 4px", color: "var(--text-dim)", fontWeight: 600 }}>壁付</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const status = itemStatus(it, paths, hiddenIds);
          const front = viewExtractionCell(it, "front", paths, hiddenIds);
          const dimetric = viewExtractionCell(it, "front-dimetric", paths, hiddenIds);
          const side = viewExtractionCell(it, "side", paths, hiddenIds);
          return (
            <tr key={it.labelJa} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "4px", verticalAlign: "top" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <StatusBadge status={status} />
                  <span style={{ color: status === "todo" ? "var(--text-dim)" : "var(--text)", fontWeight: 500 }}>
                    {it.labelJa}
                  </span>
                </div>
                <div style={{ fontSize: "9.5px", color: "var(--text-dim)", marginTop: 2, marginLeft: 2 }}>
                  · {it.location}
                  {it.catalogId && <span style={{ fontFamily: "monospace", marginLeft: 6 }}>id: {it.catalogId}</span>}
                  {!it.catalogId && <span style={{ marginLeft: 6 }}>(catalog 未登録)</span>}
                </div>
                {it.note && (
                  <div style={{ fontSize: "9.5px", color: "var(--text-dim)", fontStyle: "italic", marginLeft: 2 }}>{it.note}</div>
                )}
              </td>
              <CellTd cell={front} paths={paths} />
              <CellTd cell={dimetric} paths={paths} />
              <CellTd cell={side} paths={paths} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CellTd({ cell, paths }: { cell: ViewExtractionCell; paths: string[] }) {
  if (cell === "—") {
    return (
      <td style={{ textAlign: "center", padding: "4px", color: "var(--text-dim)", verticalAlign: "top" }}>
        —
      </td>
    );
  }
  if (cell === "?") {
    return (
      <td style={{ textAlign: "center", padding: "4px", color: "var(--warn, #c98a2b)", verticalAlign: "top" }} title="catalog にあるが source 未設定 / 別 source 由来">
        ?
      </td>
    );
  }
  // number: image index (1-based)
  return (
    <td
      style={{
        textAlign: "center",
        padding: "4px",
        color: "white",
        background: "var(--ok, #3a6)",
        fontWeight: 700,
        verticalAlign: "top",
        borderRadius: 3,
      }}
      title={paths[cell - 1]?.split("/").pop() ?? `画像 ${cell}`}
    >
      {cell}
    </td>
  );
}

function ChecklistRow({ item, status }: { item: MoodboardItem; status: ItemStatus }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "8px",
        padding: "3px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <StatusBadge status={status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12px", color: status === "todo" ? "var(--text-dim)" : "var(--text)" }}>
          {item.labelJa}
          <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "6px" }}>· {item.location}</span>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: "9.5px", color: "var(--text-dim)" }}>
          {item.catalogId ? `id: ${item.catalogId}` : "(catalog 未登録)"}
        </div>
        {item.note && (
          <div style={{ fontSize: "9.5px", color: "var(--text-dim)", fontStyle: "italic" }}>{item.note}</div>
        )}
      </div>
    </div>
  );
}
