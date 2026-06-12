import { useRef } from "react";
import type { DocStore } from "../../core/doc-store.js";
import type { ProjectDoc, SceneDoc } from "../../core/schema/project.js";
import { CLIPS } from "../../presets/clips/index.js";
import { setSceneDuration } from "../../core/commands-project.js";

interface Props {
  store: DocStore<ProjectDoc>;
  scene: SceneDoc;
  t: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onScrub: (t: number) => void; // live(tRef + ラベル)
  onScrubCommit: () => void; // pointerup(物理reseek)
}

const LANE_H = 26;
const NAME_W = 110;

export function Timeline({ store, scene, t, selectedId, onSelect, onScrub, onScrubCommit }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dur = scene.duration;

  const xToTime = (clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(dur, ratio * dur));
  };

  const startScrub = (e: React.PointerEvent) => {
    e.preventDefault();
    onScrub(xToTime(e.clientX));
    const onMove = (me: PointerEvent) => onScrub(xToTime(me.clientX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onScrubCommit();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const pct = (time: number) => `${(Math.max(0, Math.min(dur, time)) / dur) * 100}%`;

  // ルーラー目盛り(1秒刻み)
  const ticks: number[] = [];
  for (let s = 0; s <= Math.floor(dur); s++) ticks.push(s);

  return (
    <div style={{ borderTop: "1px solid #ddd", padding: "6px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700 }}>タイムライン</span>
        <span style={{ fontSize: "12px", color: "#5B7DB1" }}>t = {t.toFixed(2)}s</span>
        <span style={{ marginLeft: "auto", fontSize: "12px" }}>シーン長</span>
        <input
          type="number"
          step="0.5"
          min="0.5"
          style={{ width: "60px" }}
          value={dur}
          onChange={(e) => setSceneDuration(store, scene.id, Number(e.target.value))}
        />
        <span style={{ fontSize: "12px" }}>秒</span>
      </div>

      <div style={{ display: "flex" }}>
        <div style={{ width: NAME_W, flexShrink: 0 }} />
        {/* ルーラー + 再生ヘッド領域 */}
        <div
          ref={trackRef}
          onPointerDown={startScrub}
          style={{
            position: "relative",
            flex: 1,
            height: "20px",
            background: "#f0f0f0",
            borderRadius: "3px",
            cursor: "pointer",
            touchAction: "none",
          }}
        >
          {ticks.map((s) => (
            <div
              key={s}
              style={{
                position: "absolute",
                left: pct(s),
                top: 0,
                bottom: 0,
                borderLeft: "1px solid #ccc",
                fontSize: "9px",
                color: "#999",
                paddingLeft: "2px",
              }}
            >
              {s}
            </div>
          ))}
          {/* playhead */}
          <div
            style={{
              position: "absolute",
              left: pct(t),
              top: "-2px",
              bottom: "-2px",
              width: "2px",
              background: "#e0533b",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* 要素レーン */}
      <div style={{ marginTop: "4px" }}>
        {scene.elements.length === 0 && (
          <div style={{ fontSize: "11px", color: "#999", paddingLeft: NAME_W }}>
            要素がありません
          </div>
        )}
        {scene.elements.map((el) => {
          const selected = el.id === selectedId;
          const exitAt = el.exit.at;
          return (
            <div
              key={el.id}
              onClick={() => onSelect(el.id)}
              style={{ display: "flex", alignItems: "center", height: LANE_H, cursor: "pointer" }}
            >
              <div
                style={{
                  width: NAME_W,
                  flexShrink: 0,
                  fontSize: "11px",
                  fontWeight: selected ? 700 : 400,
                  color: selected ? "#5B7DB1" : "#444",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {el.kind === "character" ? "🙂 " : "🅣 "}
                {el.kind === "text" ? el.text : el.ref.replace(/^.*\//, "").replace(/\.byc\.json$/, "").replace("builtin:", "")}
              </div>
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  height: "18px",
                  background: selected ? "#eef4fc" : "#f7f7f7",
                  borderRadius: "3px",
                }}
              >
                {/* enter マーカー */}
                <div
                  title={`登場 ${el.enter.type}`}
                  style={{
                    position: "absolute",
                    left: pct(el.enter.delay),
                    top: 0,
                    bottom: 0,
                    width: "3px",
                    background: "#5aa469",
                  }}
                />
                {/* exit マーカー */}
                {exitAt !== null && (
                  <div
                    title={`退場 ${el.exit.type}`}
                    style={{
                      position: "absolute",
                      left: pct(exitAt),
                      top: 0,
                      bottom: 0,
                      width: "3px",
                      background: "#c2603f",
                    }}
                  />
                )}
                {/* action チップ */}
                {el.kind === "character" &&
                  el.actions.map((a, i) => (
                    <div
                      key={i}
                      title={`${a.t}s ${CLIPS[a.clip]?.label ?? a.clip}`}
                      style={{
                        position: "absolute",
                        left: pct(a.t),
                        top: "2px",
                        height: "14px",
                        padding: "0 4px",
                        background: "#5B7DB1",
                        color: "#fff",
                        fontSize: "9px",
                        lineHeight: "14px",
                        borderRadius: "2px",
                        transform: "translateX(0)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {CLIPS[a.clip]?.label ?? a.clip}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
