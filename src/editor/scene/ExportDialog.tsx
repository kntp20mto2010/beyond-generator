import { useState } from "react";
import type { ProjectDoc } from "../../core/schema/project.js";
import type { ExportProgress, ExportSettings } from "../../export/mp4-exporter.js";

interface Props {
  project: ProjectDoc;
  // 実行中の進捗。null = 設定画面、それ以外 = 進捗バー表示
  progress: ExportProgress | null;
  error: string | null;
  onStart: (settings: ExportSettings) => void;
  onCancel: () => void;
  onClose: () => void;
}

type ResKey = "1080" | "720";
const RES: Record<ResKey, { width: 1920 | 1280; height: 1080 | 720; label: string }> = {
  "1080": { width: 1920, height: 1080, label: "1920 × 1080 (1080p)" },
  "720": { width: 1280, height: 720, label: "1280 × 720 (720p)" },
};

function totalDuration(project: ProjectDoc): number {
  return project.scenes.reduce((s, sc) => s + sc.duration, 0);
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
};

const panelStyle: React.CSSProperties = {
  width: 360,
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "16px 18px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  color: "var(--text)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--text-dim)",
  marginBottom: 4,
};

const rowStyle: React.CSSProperties = { marginBottom: 12 };

export function ExportDialog({ project, progress, error, onStart, onCancel, onClose }: Props) {
  const [res, setRes] = useState<ResKey>("1080");
  const [fps, setFps] = useState<30 | 24>(30);

  const running = progress !== null;
  const dur = totalDuration(project);
  const pct =
    progress && progress.totalFrames > 0
      ? Math.min(100, Math.round((progress.frame / progress.totalFrames) * 100))
      : 0;

  const phaseLabel = progress
    ? progress.phase === "audio"
      ? "音声を準備中…"
      : progress.phase === "mux"
        ? "ファイルを書き出し中…"
        : "フレームを描画中…"
    : "";

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>動画を書き出し</div>

        {error && (
          <div
            style={{
              background: "var(--bg-elev)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius)",
              color: "var(--danger)",
              padding: "8px 10px",
              fontSize: 12,
              marginBottom: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            書き出しに失敗しました: {error}
          </div>
        )}

        {!running ? (
          <>
            <div style={rowStyle}>
              <label style={labelStyle}>解像度</label>
              <select
                className="ui-input"
                style={{ width: "100%" }}
                value={res}
                onChange={(e) => setRes(e.target.value as ResKey)}
              >
                <option value="1080">{RES["1080"].label}</option>
                <option value="720">{RES["720"].label}</option>
              </select>
            </div>

            <div style={rowStyle}>
              <label style={labelStyle}>フレームレート</label>
              <select
                className="ui-input"
                style={{ width: "100%" }}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value) as 30 | 24)}
              >
                <option value={30}>30 fps</option>
                <option value={24}>24 fps</option>
              </select>
            </div>

            <div style={{ ...rowStyle, fontSize: 12, color: "var(--text-dim)" }}>
              合計時間: {dur.toFixed(1)} 秒 / {project.scenes.length} シーン
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="ui-btn" onClick={onClose}>
                閉じる
              </button>
              <button
                className="ui-btn ui-btn--active"
                disabled={project.scenes.length === 0}
                onClick={() => {
                  const r = RES[res];
                  onStart({ width: r.width, height: r.height, fps });
                }}
              >
                書き出す
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, marginBottom: 8 }}>{phaseLabel}</div>
            <div
              style={{
                width: "100%",
                height: 10,
                background: "var(--bg-elev)",
                borderRadius: 5,
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "var(--accent)",
                  transition: "width 0.1s linear",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
              {progress?.frame ?? 0} / {progress?.totalFrames ?? 0} フレーム ({pct}%)
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="ui-btn ui-btn--danger" onClick={onCancel}>
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
