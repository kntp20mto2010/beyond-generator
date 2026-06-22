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
} from "./moodboard-manifest.js";

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

  // オブジェクトタブの「抽出元あり ⤴」から jumpTarget(moodboard パス)が来たら、
  // 該当カードへスクロール + ハイライト点灯。jumpTarget は消費後すぐ null に戻されるため、
  // 消灯タイマーは別 effect(highlightId 依存)に分離する(ここで持つと null 復帰の再実行でタイマーが消える)。
  useEffect(() => {
    if (!jumpTarget) return;
    const target = MOODBOARD_SOURCES.find((s) => s.imagePath === jumpTarget);
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
        <SourceCard key={src.id} src={src} highlight={highlightId === src.id} />
      ))}
    </div>
  );
}

function SourceCard({ src, highlight }: { src: MoodboardSource; highlight?: boolean }) {
  const counts = useMemo(() => {
    const c: Record<ItemStatus, number> = { extracted: 0, made: 0, todo: 0 };
    for (const it of src.items) c[itemStatus(it, src.imagePath)] += 1;
    return c;
  }, [src]);
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
      <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "2px" }}>{src.labelJa}</div>
      <div style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--text-dim)", marginBottom: "10px" }}>
        {src.imagePath}
      </div>

      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 左: moodboard 画像 */}
        <div style={{ flex: "1 1 360px", minWidth: "280px", maxWidth: "560px" }}>
          <img
            src={`/${src.imagePath}`}
            alt={src.labelJa}
            style={{ width: "100%", borderRadius: "6px", border: "1px solid var(--border)", display: "block" }}
          />
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
                {items.map((it) => (
                  <ChecklistRow key={it.labelJa} item={it} status={itemStatus(it, src.imagePath)} />
                ))}
              </div>
            ))}
          </div>
        </div>
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
