import { useEffect, useState } from "react";
import type { FileSystemAdapter } from "../../io/fs.js";
import type { BalloonElement } from "../../core/schema/project.js";

interface Props {
  fs: FileSystemAdapter | null;
  disabled: boolean;
  savedCharacters: string[];
  onAddCharacter: (ref: string) => void;
  onAddText: () => void;
  onAddBalloon: (shape: BalloonElement["shape"]) => void;
  onAddBackground: (color: string) => void;
  onSetBackgroundImage: (image: string | null) => void;
}

const BALLOON_SHAPES: { shape: BalloonElement["shape"]; label: string }[] = [
  { shape: "round", label: "角丸" },
  { shape: "cloud", label: "雲" },
  { shape: "spike", label: "トゲ" },
];

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

const IMG_EXT = /\.(png|jpe?g|webp)$/i;

export function AddPanel({ fs, disabled, savedCharacters, onAddCharacter, onAddText, onAddBalloon, onAddBackground, onSetBackgroundImage }: Props) {
  const [bgFiles, setBgFiles] = useState<string[]>([]);
  const [bgColor, setBgColor] = useState("#cfe3f7");
  const [bgImage, setBgImage] = useState("assets/generated/bg-school-001.png");

  useEffect(() => {
    let live = true;
    (async () => {
      if (!fs) {
        setBgFiles([]);
        return;
      }
      const bgs = await fs.listFiles("assets/bg");
      if (live) setBgFiles(bgs.filter((f) => IMG_EXT.test(f)));
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
      {savedCharacters.map((f) => (
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

      <div style={{ fontWeight: 700, margin: "10px 0 4px" }}>吹き出し</div>
      <div style={{ display: "flex", gap: "4px" }}>
        {BALLOON_SHAPES.map(({ shape, label }) => (
          <button
            key={shape}
            style={{ ...panelBtn, width: "auto", margin: 0, flex: 1, textAlign: "center" }}
            disabled={disabled}
            onClick={() => onAddBalloon(shape)}
          >
            {label}
          </button>
        ))}
      </div>

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
      {bgFiles.map((f) => (
        <button
          key={f}
          style={panelBtn}
          disabled={disabled}
          onClick={() => onSetBackgroundImage(`assets/bg/${f}`)}
        >
          {f}
        </button>
      ))}
      {fs && bgFiles.length === 0 && (
        <div style={{ color: "#999", fontSize: "11px", margin: "2px 0" }}>
          フォルダ内 assets/bg/ に画像なし
        </div>
      )}
      {!fs && (
        <div style={{ color: "#999", fontSize: "11px", margin: "2px 0" }}>
          フォルダ内画像はフォルダを開くと表示
        </div>
      )}
      <input
        value={bgImage}
        onChange={(e) => setBgImage(e.target.value)}
        placeholder="assets/generated/..."
        style={{ width: "100%", fontSize: "11px", padding: "3px 4px", boxSizing: "border-box", marginTop: "4px" }}
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
