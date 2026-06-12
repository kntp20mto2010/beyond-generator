import { useEffect, useState } from "react";
import type { FileSystemAdapter } from "../../io/fs.js";

interface Props {
  fs: FileSystemAdapter | null;
  disabled: boolean;
  onAddCharacter: (ref: string) => void;
  onAddText: () => void;
  onAddBackground: (color: string) => void;
  onSetBackgroundImage: (image: string | null) => void;
}

const panelBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "6px 8px",
  margin: "2px 0",
  border: "1px solid #ccc",
  borderRadius: "4px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "13px",
};

export function AddPanel({ fs, disabled, onAddCharacter, onAddText, onAddBackground, onSetBackgroundImage }: Props) {
  const [saved, setSaved] = useState<string[]>([]);
  const [bgColor, setBgColor] = useState("#cfe3f7");
  const [bgImage, setBgImage] = useState("assets/generated/bg-school-001.png");

  useEffect(() => {
    let live = true;
    (async () => {
      if (!fs) {
        setSaved([]);
        return;
      }
      const files = await fs.listFiles("characters");
      if (live) setSaved(files.filter((f) => f.endsWith(".byc.json")));
    })();
    return () => {
      live = false;
    };
  }, [fs]);

  return (
    <div style={{ padding: "8px", fontSize: "13px" }}>
      <div style={{ fontWeight: 700, marginBottom: "4px" }}>キャラ</div>
      <button
        style={panelBtn}
        disabled={disabled}
        onClick={() => onAddCharacter("builtin:template-a")}
      >
        ハル(内蔵)
      </button>
      {saved.map((f) => (
        <button
          key={f}
          style={panelBtn}
          disabled={disabled}
          onClick={() => onAddCharacter(`characters/${f}`)}
        >
          {f.replace(/\.byc\.json$/, "")}
        </button>
      ))}
      {!fs && (
        <div style={{ color: "#999", fontSize: "11px", margin: "2px 0" }}>
          保存済キャラはフォルダを開くと表示
        </div>
      )}

      <div style={{ fontWeight: 700, margin: "10px 0 4px" }}>テキスト</div>
      <button style={panelBtn} disabled={disabled} onClick={onAddText}>
        テキストを追加
      </button>

      <div style={{ fontWeight: 700, margin: "10px 0 4px" }}>背景色</div>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <input
          type="color"
          value={bgColor}
          onChange={(e) => setBgColor(e.target.value)}
        />
        <button
          style={{ ...panelBtn, width: "auto", margin: 0 }}
          disabled={disabled}
          onClick={() => onAddBackground(bgColor)}
        >
          適用
        </button>
      </div>

      <div style={{ fontWeight: 700, margin: "10px 0 4px" }}>背景画像</div>
      <input
        value={bgImage}
        onChange={(e) => setBgImage(e.target.value)}
        placeholder="assets/generated/..."
        style={{ width: "100%", fontSize: "11px", padding: "3px 4px", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: "4px", marginTop: "3px" }}>
        <button
          style={{ ...panelBtn, width: "auto", margin: 0 }}
          disabled={disabled || bgImage.trim() === ""}
          onClick={() => onSetBackgroundImage(bgImage.trim())}
        >
          適用
        </button>
        <button
          style={{ ...panelBtn, width: "auto", margin: 0 }}
          disabled={disabled}
          onClick={() => onSetBackgroundImage(null)}
        >
          クリア
        </button>
      </div>
    </div>
  );
}
