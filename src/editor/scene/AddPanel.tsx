import { useEffect, useRef, useState } from "react";
import type { FileSystemAdapter } from "../../io/fs.js";
import type { AssetResolver } from "../../io/asset-resolver.js";
import { SPRITE_BUILTIN_LIST } from "../../io/asset-resolver.js";
import type { BalloonElement } from "../../core/schema/project.js";
import type { CharacterDoc } from "../../core/schema/character.js";
import type { ThumbnailService } from "../thumbs/thumbnail-service.js";
import { Section } from "../ui/Section.js";
import { Thumb } from "../ui/Thumb.js";
import { OBJECT_CATALOG, getDefaultVariantSrc } from "./objects-catalog.js";

interface CharEntry {
  ref: string;
  label: string;
  thumb?: string; // スプライトキャラ用: 立ち絵サムネ画像パス(assets配信)
}

interface Props {
  fs: FileSystemAdapter | null;
  disabled: boolean;
  savedCharacters: string[];
  resolver: AssetResolver;
  thumbs: ThumbnailService | null;
  onAddCharacter: (ref: string) => void;
  onAddText: () => void;
  onAddBalloon: (shape: BalloonElement["shape"]) => void;
  onAddObject: (src: string) => void;
  onAddBackground: (color: string) => void;
  onSetBackgroundImage: (image: string | null) => void;
}

const BUILTIN_BGS = [
  "assets/generated/bg-school-001.png",
  "assets/backgrounds/bg-classroom-001.svg",
  "assets/backgrounds/sakura-room-empty.png",
  "assets/generated/sakura-room-L1-20260620.png",
  "assets/backgrounds/navy-room-empty.png",
  "assets/generated/navy-room-L1-20260623.png",
  "assets/backgrounds/riverside-empty.png",
  "assets/backgrounds/riverside-empty-wide.png",
];

const BG_SWATCHES = [
  { color: "#f4f1ec", label: "紙色" },
  { color: "#cfe3f7", label: "空色" },
  { color: "#f5c07a", label: "夕色" },
  { color: "#1a1a2e", label: "夜色" },
  { color: "#7ab87a", label: "緑" },
  { color: "#9a9a9a", label: "灰" },
  { color: "#ffffff", label: "白" },
  { color: "#222222", label: "黒" },
];

const IMG_EXT = /\.(png|jpe?g|webp)$/i;

// 吹き出し形状のミニSVG
function BalloonIcon({ shape }: { shape: BalloonElement["shape"] }) {
  if (shape === "round") {
    return (
      <svg viewBox="0 0 40 30" width={40} height={30} fill="none">
        <rect x="2" y="2" width="36" height="20" rx="8" stroke="currentColor" strokeWidth="1.5" fill="var(--bg-elev)" />
        <path d="M12 22 L8 28 L18 22" stroke="currentColor" strokeWidth="1.5" fill="var(--bg-elev)" />
      </svg>
    );
  }
  if (shape === "cloud") {
    return (
      <svg viewBox="0 0 40 30" width={40} height={30} fill="none">
        <path d="M6 20 Q4 20 4 16 Q4 12 7 12 Q7 6 13 6 Q16 3 20 4 Q25 2 28 6 Q33 6 34 11 Q37 12 36 16 Q36 20 33 20 Z"
          stroke="currentColor" strokeWidth="1.5" fill="var(--bg-elev)" />
        <circle cx="12" cy="27" r="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="16" cy="25" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  // spike
  return (
    <svg viewBox="0 0 40 30" width={40} height={30} fill="none">
      <polygon points="2,2 38,2 38,20 20,20 12,28 14,20 2,20"
        stroke="currentColor" strokeWidth="1.5" fill="var(--bg-elev)" />
    </svg>
  );
}

export function AddPanel({
  fs, disabled, savedCharacters, resolver, thumbs,
  onAddCharacter, onAddText, onAddBalloon, onAddObject, onAddBackground, onSetBackgroundImage,
}: Props) {
  const [bgFiles, setBgFiles] = useState<string[]>([]);
  const [bgColor, setBgColor] = useState("#cfe3f7");
  const [charUrls, setCharUrls] = useState<Record<string, string>>({});
  const [bgUrls, setBgUrls] = useState<Record<string, string>>({});
  const [objUrls, setObjUrls] = useState<Record<string, string>>({});
  const [resolverRev, setResolverRev] = useState(0);
  const colorPickerRef = useRef<HTMLInputElement>(null);

  // resolver変化を監視して画像URLを更新
  useEffect(() => resolver.subscribe(() => setResolverRev((r) => r + 1)), [resolver]);

  // assets/bg/ 一覧取得
  useEffect(() => {
    let live = true;
    (async () => {
      if (!fs) { setBgFiles([]); return; }
      const bgs = await fs.listFiles("assets/bg");
      if (live) setBgFiles(bgs.filter((f) => IMG_EXT.test(f)));
    })();
    return () => { live = false; };
  }, [fs]);

  // キャラサムネを起動時に生成
  const chars: CharEntry[] = [
    ...SPRITE_BUILTIN_LIST, // 新キャラ(スプライト): サクラ / リョウタ
    { ref: "builtin:template-a", label: "ハル(内蔵)" },
    { ref: "builtin:template-b", label: "ハナ(内蔵)" },
    ...savedCharacters.map((f) => ({ ref: `characters/${f}`, label: f.replace(/\.byc\.json$/, "") })),
  ];

  useEffect(() => {
    if (!thumbs) return;
    const unsub = thumbs.subscribe(() => setResolverRev((r) => r + 1));
    for (const { ref } of chars) {
      const doc: CharacterDoc | undefined = resolver.getCharacter(ref);
      if (doc) {
        void thumbs.renderCharacter(doc, { w: 72, h: 108 })
          .then((url) => setCharUrls((prev) => ({ ...prev, [ref]: url })));
      }
    }
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbs, resolverRev]);

  // スプライトキャラの立ち絵サムネ画像を読み込む(assets配信)
  useEffect(() => {
    const thumbsPaths = chars.map((c) => c.thumb).filter((p): p is string => !!p);
    const missing = thumbsPaths.filter((p) => !resolver.getImageUrl(p));
    if (missing.length > 0) void resolver.ensureImagesLoaded(missing, fs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, resolverRev]);

  // 背景画像の objectURL を取得
  const allBgPaths = [...BUILTIN_BGS, ...bgFiles.map((f) => `assets/bg/${f}`)];

  useEffect(() => {
    const newUrls: Record<string, string> = {};
    for (const path of allBgPaths) {
      const url = resolver.getImageUrl(path);
      if (url) newUrls[path] = url;
    }
    setBgUrls(newUrls);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolverRev, bgFiles]);

  // 未ロード画像があればensureImagesLoaded
  useEffect(() => {
    const missing = allBgPaths.filter((p) => !resolver.getImageUrl(p));
    if (missing.length > 0) void resolver.ensureImagesLoaded(missing, fs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, bgFiles, resolverRev]);

  // オブジェクトカタログ画像の読込 + objectURL(各 def の defaultView をサムネに使う)
  useEffect(() => {
    const defaultSrcs = OBJECT_CATALOG.map((o) => getDefaultVariantSrc(o));
    const missing = defaultSrcs.filter((p) => !resolver.getImageUrl(p));
    if (missing.length > 0) void resolver.ensureImagesLoaded(missing, fs);
    const urls: Record<string, string> = {};
    for (const o of OBJECT_CATALOG) {
      const src = getDefaultVariantSrc(o);
      const u = resolver.getImageUrl(src);
      if (u) urls[src] = u;
    }
    setObjUrls(urls);
  }, [fs, resolver, resolverRev]);

  return (
    <div style={{ overflowY: "auto", height: "100%", background: "var(--bg-panel)" }}>

      {/* キャラ */}
      <Section title="キャラ" defaultOpen={true}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          {chars.map(({ ref, label, thumb }) => (
            <Thumb
              key={ref}
              src={thumb ? resolver.getImageUrl(thumb) : charUrls[ref]}
              label={label}
              width={72}
              height={108}
              onClick={disabled ? undefined : () => onAddCharacter(ref)}
            >
              <span style={{ fontSize: "10px", color: "var(--text-dim)", textAlign: "center" }}>{label}</span>
            </Thumb>
          ))}
        </div>
        {!fs && (
          <div style={{ color: "var(--text-dim)", fontSize: "11px", marginTop: "4px" }}>
            保存済キャラはフォルダを開くと表示
          </div>
        )}
      </Section>

      {/* テキスト */}
      <Section title="テキスト" defaultOpen={false}>
        <button
          className="ui-btn"
          style={{ width: "100%" }}
          disabled={disabled}
          onClick={onAddText}
        >
          <span style={{ fontSize: "18px", lineHeight: 1 }}>あ</span>
          テキストを追加
        </button>
      </Section>

      {/* 吹き出し */}
      <Section title="吹き出し" defaultOpen={false}>
        <div style={{ display: "flex", gap: "6px" }}>
          {(["round", "cloud", "spike"] as const).map((shape) => (
            <button
              key={shape}
              className="balloon-mini"
              disabled={disabled}
              onClick={() => onAddBalloon(shape)}
            >
              <BalloonIcon shape={shape} />
              <span>{shape === "round" ? "角丸" : shape === "cloud" ? "雲" : "トゲ"}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* オブジェクト(家具/小物) */}
      <Section title="オブジェクト" defaultOpen={true}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          {OBJECT_CATALOG.map((o) => {
            const defaultSrc = getDefaultVariantSrc(o);
            const hasMultipleViews = Object.keys(o.views).length > 1;
            return (
              <Thumb
                key={o.id}
                src={objUrls[defaultSrc]}
                label={o.label}
                width={84}
                height={64}
                onClick={disabled ? undefined : () => onAddObject(defaultSrc)}
              >
                <span style={{ fontSize: "10px", color: "var(--text-dim)", textAlign: "center" }}>
                  {o.label}
                  {hasMultipleViews && <span style={{ marginLeft: 4, opacity: 0.6 }}>F/S</span>}
                </span>
              </Thumb>
            );
          })}
        </div>
      </Section>

      {/* 背景色 */}
      <Section title="背景色" defaultOpen={true}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
          {BG_SWATCHES.map(({ color, label }) => (
            <button
              key={color}
              className={`ui-swatch${bgColor === color ? " ui-swatch--selected" : ""}`}
              style={{ background: color }}
              title={label}
              disabled={disabled}
              onClick={() => {
                setBgColor(color);
                onAddBackground(color);
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <label style={{ color: "var(--text-dim)", fontSize: "11px" }}>カスタム</label>
          <input
            ref={colorPickerRef}
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            style={{ width: "28px", height: "24px", padding: 0, border: "none", cursor: "pointer", background: "none" }}
          />
          <button
            className="ui-btn"
            disabled={disabled}
            onClick={() => onAddBackground(bgColor)}
          >
            適用
          </button>
        </div>
      </Section>

      {/* 背景画像 */}
      <Section title="背景画像" defaultOpen={true}>
        {allBgPaths.length === 0 && (
          <div style={{ color: "var(--text-dim)", fontSize: "11px" }}>
            {fs ? "assets/bg/ に画像なし" : "フォルダを開くと表示"}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          {allBgPaths.map((path) => {
            const url = bgUrls[path];
            const label = path.split("/").pop() ?? path;
            return (
              <div
                key={path}
                className="ui-thumb"
                style={{ cursor: disabled ? "default" : "pointer" }}
                onClick={disabled ? undefined : () => onSetBackgroundImage(path)}
              >
                {url ? (
                  <img
                    src={url}
                    width={80}
                    height={45}
                    style={{ display: "block", objectFit: "cover", width: "100%", height: "45px" }}
                    alt={label}
                  />
                ) : (
                  <div style={{ width: "100%", height: "45px", background: "var(--bg-elev)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>読込中…</span>
                  </div>
                )}
                <div className="ui-thumb__label">{label}</div>
              </div>
            );
          })}
        </div>
        {scene_clear_button(disabled, onSetBackgroundImage)}
      </Section>
    </div>
  );
}

function scene_clear_button(
  disabled: boolean,
  onSetBackgroundImage: (image: string | null) => void,
) {
  return (
    <button
      className="ui-btn"
      style={{ marginTop: "6px", width: "100%", justifyContent: "center" }}
      disabled={disabled}
      onClick={() => onSetBackgroundImage(null)}
    >
      背景画像をクリア
    </button>
  );
}
