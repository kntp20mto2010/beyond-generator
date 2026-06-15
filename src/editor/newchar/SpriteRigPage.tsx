import { useEffect, useRef, useState, type ReactNode } from "react";
import { Application, Assets, Container, Graphics, Mesh, MeshGeometry, Rectangle, Sprite, Texture } from "pixi.js";
import { withPixiInitLock } from "../../render/pixi-init-lock.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { CLIP_WALK_GIRL } from "./walk-girl.js";
import { CLIP_WAVE_RELAX } from "./wave-relax.js";
import { CLIP_IDLE } from "../../presets/clips/idle.js";
import { CLIP_POINT } from "../../presets/clips/point.js";
import type { ClipDoc } from "../../core/schema/clip.js";
import type { BoneId } from "../../runtime/skeleton.js";

// See-through(SIGGRAPH 2026)出力を深度z順で個別レイヤー描画。
// 下半身(ズボン)は剛体カットアウトだと股で継ぎ目が出るため、1枚のメッシュを
// 骨盤+両脚にスキニング(線形ブレンド)して連続変形させる(継ぎ目が出ない)。
// 腕は剛体カットアウト、上半身は静止レイヤー。
import { CHARS, type CharKey, type CharConfig, type Frame, type Layer } from "./character-configs.js";

const TEXW = 1280;

const TABLE: { jp: string; file: string; bone: string }[] = [
  { jp: "後ろ髪", file: "back_hair.png", bone: "頭に追従+毛先揺れ(バネ)" },
  { jp: "靴", file: "footwear.png", bone: "足L/R(脛に追従)" },
  { jp: "ズボン", file: "legwear.png", bone: "メッシュ(骨盤+太腿/脛L/Rにスキニング)" },
  { jp: "腕(袖)", file: "handwear.png", bone: "上腕L/R・前腕L/R(剛体)" },
  { jp: "上着", file: "topwear.png", bone: "胴(傾き)" },
  { jp: "首", file: "neck.png", bone: "—(静止)" },
  { jp: "頭", file: "head.png", bone: "—(静止)" },
  { jp: "耳", file: "ears.png", bone: "—(静止)" },
  { jp: "顔", file: "face.png", bone: "—(静止)" },
  { jp: "口", file: "mouth.png", bone: "—(静止)" },
  { jp: "白目", file: "eyewhite.png", bone: "—(静止)" },
  { jp: "瞳", file: "irides.png", bone: "—(静止)" },
  { jp: "睫毛", file: "eyelash.png", bone: "—(静止)" },
  { jp: "眉", file: "eyebrow.png", bone: "—(静止)" },
  { jp: "前髪", file: "front_hair.png", bone: "—(静止)" },
];

// ポーズ・表情のプリセット辞書(toolbar の <select> から参照)
type PoseKey = "walk-girl" | "idle" | "wave" | "point" | "tpose";
const POSES: Record<PoseKey, { label: string; clip: ClipDoc | null }> = {
  "walk-girl": { label: "歩く", clip: CLIP_WALK_GIRL },
  idle: { label: "待機", clip: CLIP_IDLE },
  wave: { label: "手を振る", clip: CLIP_WAVE_RELAX },
  point: { label: "指差し", clip: CLIP_POINT },
  tpose: { label: "棒立ち", clip: null },
};
type ExprKey = "normal" | "smile" | "surprise" | "worry";
// eyeScale: null = 自動まばたきに任せる。値 = scale.y を固定(まばたきはスキップ)。
const EXPRS: Record<ExprKey, { label: string; eyeScale: number | null }> = {
  normal: { label: "普通", eyeScale: null },
  smile: { label: "笑顔", eyeScale: 0.5 },
  surprise: { label: "驚き", eyeScale: 1.2 },
  worry: { label: "困り", eyeScale: 0.8 },
};

const deg2rad = (d: number) => (d * Math.PI) / 180;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// 2x3 アフィン(列ベクトル: x'=a x + c y + tx)
interface Aff { a: number; b: number; c: number; d: number; tx: number; ty: number }
function rotAbout(px: number, py: number, th: number): Aff {
  const c = Math.cos(th), s = Math.sin(th);
  return { a: c, b: s, c: -s, d: c, tx: px - (c * px - s * py), ty: py - (s * px + c * py) };
}
function mul(A: Aff, B: Aff): Aff {
  return {
    a: A.a * B.a + A.c * B.b, b: A.b * B.a + A.d * B.b,
    c: A.a * B.c + A.c * B.d, d: A.b * B.c + A.d * B.d,
    tx: A.a * B.tx + A.c * B.ty + A.tx, ty: A.b * B.tx + A.d * B.ty + A.ty,
  };
}
const ax = (M: Aff, x: number, y: number) => M.a * x + M.c * y + M.tx;
const ay = (M: Aff, x: number, y: number) => M.b * x + M.d * y + M.ty;

// FKの脚振り。太腿(振り幅)を小さめにして遊脚が支持脚に「振り被る」のを抑える。
// 膝の曲げ(shin)は保って歩きの表情は残す。IKモードはこの値を使わない。
const FK_THIGH_AMP = 0.3; // 太腿の前後振り(小さい=脚が重ならない)
const FK_SHIN_AMP = 0.6;  // 膝の曲げ量も控えめに合わせる
const BULGE_K = 0.9;      // 関節バルジ: 曲げ量に応じて脚を太らせる係数(膝でピーク)

// 2ボーンIK: 股(hx,hy)→目標足首(tx,ty)。bend=膝の向き(+1で前/画像左へ膨らむ)。
// 戻り値は world 角 [太腿角, 脛角](rest空間)。
function legIK(hx: number, hy: number, tx: number, ty: number, L1: number, L2: number, bend: number): [number, number] {
  const dx = tx - hx, dy = ty - hy;
  let d = Math.hypot(dx, dy);
  d = Math.max(Math.abs(L1 - L2) + 1, Math.min(L1 + L2 - 1, d));
  const a = Math.atan2(dy, dx);
  const cosH = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const th = a + bend * Math.acos(cosH);
  const kx = hx + L1 * Math.cos(th), ky = hy + L1 * Math.sin(th);
  return [th, Math.atan2(ty - ky, tx - kx)];
}

// Toolbar セクション。タイトル + ボタン群を 1 ブロックに。
function ToolSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>{title}</div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>{children}</div>
    </div>
  );
}

// Toolbar 用ラベル付き <select>。className は ui-btn 流用で見た目を揃える。
function ToolSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
      <span style={{ color: "var(--text-dim)" }}>{label}:</span>
      <select className="ui-btn" value={value} onChange={(e) => onChange(e.target.value)} style={{ paddingRight: "20px" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function CharRig({ cfg }: { cfg: CharConfig }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(true);
  const signRef = useRef(1);
  const bonesRef = useRef(false);
  const legModeRef = useRef<"mesh" | "mix" | "cutout">("mix");
  const ikRef = useRef(false);
  const skinRef = useRef(true);
  const bulgeRef = useRef(true);
  const armModeRef = useRef<"cutout" | "mix">("mix");
  const wireRef = useRef(false);
  const facingRef = useRef<"left" | "right">("left");
  const poseRef = useRef<PoseKey>("walk-girl");
  const exprRef = useRef<ExprKey>("normal");
  const applyFacingRef = useRef<((f: "left" | "right") => void) | null>(null);
  // フレーム表示 + スクラブ + スナップ用。
  // scrubRef.current=秒指定で playback override(null=自動再生)。tRef は表示用に毎フレーム更新。
  const appRef = useRef<Application | null>(null);
  const tRef = useRef(0);
  const clipDurRef = useRef(1);
  // ratio (0..1) で保持。秒換算は ticker 内で curDur を掛けて行う(ポーズ切替で
  // duration が変わっても「50%」は常に「50%」のまま追従する)。null = 自動再生。
  const scrubRef = useRef<number | null>(null);
  const snapRef = useRef<(name?: string) => Promise<string | null>>(async () => null);
  const frameDisplayRef = useRef<HTMLSpanElement>(null);
  // pivot エディタ用。hovered/dragging は armKey("upperArmL" 等)を保持。
  const editStateRefOuter = useRef<{ hovered: string | null; dragging: string | null }>({ hovered: null, dragging: null });
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(true);
  const [sign, setSign] = useState(1);
  const [showBones, setShowBones] = useState(false);
  const [legMode, setLegMode] = useState<"mesh" | "mix" | "cutout">("mix");
  const [ikMode, setIkMode] = useState(false);
  const [skinMode, setSkinMode] = useState(true);
  const [bulgeMode, setBulgeMode] = useState(true);
  const [armMode, setArmMode] = useState<"cutout" | "mix">("mix");
  const [wireMode, setWireMode] = useState(false);
  const [facing, setFacing] = useState<"left" | "right">("left");
  const [pose, setPose] = useState<PoseKey>("walk-girl");
  const [expression, setExpression] = useState<ExprKey>("normal");
  const [scrubPct, setScrubPct] = useState<string>("");
  const [snapStatus, setSnapStatus] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [status, setStatus] = useState("読込中…");
  playingRef.current = playing;
  signRef.current = sign;
  bonesRef.current = showBones;
  legModeRef.current = legMode;
  ikRef.current = ikMode;
  skinRef.current = skinMode;
  bulgeRef.current = bulgeMode;
  armModeRef.current = armMode;
  wireRef.current = wireMode;
  facingRef.current = facing;
  poseRef.current = pose;
  exprRef.current = expression;
  const LEG_LABEL = { mesh: "単一メッシュ", mix: "ミックス(剛体+継ぎ目/左右分離)", cutout: "剛体カットアウト" } as const;

  // scrubPct(0..100) → scrubRef.current(ratio 0..1)。空文字=自動再生。
  useEffect(() => {
    if (scrubPct === "") {
      scrubRef.current = null;
    } else {
      const p = parseFloat(scrubPct);
      if (!isNaN(p)) scrubRef.current = p / 100;
    }
  }, [scrubPct]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();

    // キャラ別ランドマーク/フレーム/閾値は cfg から取り出して以降は既存名で参照する
    const DIR = cfg.dir;
    const HIP = cfg.hip;
    const HAIR_PIVOT = cfg.hairPivot;
    const HIP_L = cfg.hipL, HIP_R = cfg.hipR;
    const KNEE_L = cfg.kneeL, KNEE_R = cfg.kneeR;
    const ANKLE_L = cfg.ankleL, ANKLE_R = cfg.ankleR;
    const GROUND_Y = cfg.groundY, STEP = cfg.step, LIFT = cfg.lift;
    const BACK_LAYERS = cfg.backLayers, FRONT_LAYERS = cfg.frontLayers, ARMS = cfg.arms;
    // IK derived
    const L1L = Math.hypot(KNEE_L[0] - HIP_L[0], KNEE_L[1] - HIP_L[1]);
    const L2L = Math.hypot(ANKLE_L[0] - KNEE_L[0], ANKLE_L[1] - KNEE_L[1]);
    const L1R = Math.hypot(KNEE_R[0] - HIP_R[0], KNEE_R[1] - HIP_R[1]);
    const L2R = Math.hypot(ANKLE_R[0] - KNEE_R[0], ANKLE_R[1] - KNEE_R[1]);
    const REST_TH_L = Math.atan2(KNEE_L[1] - HIP_L[1], KNEE_L[0] - HIP_L[0]);
    const REST_SH_L = Math.atan2(ANKLE_L[1] - KNEE_L[1], ANKLE_L[0] - KNEE_L[0]);
    const REST_TH_R = Math.atan2(KNEE_R[1] - HIP_R[1], KNEE_R[0] - HIP_R[0]);
    const REST_SH_R = Math.atan2(ANKLE_R[1] - KNEE_R[1], ANKLE_R[0] - KNEE_R[0]);

    (async () => {
      await withPixiInitLock(() =>
        app.init({ width: 480, height: 660, background: "#eef1f5", antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true }),
      );
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      const files = [...new Set([...BACK_LAYERS, ...FRONT_LAYERS].map((l) => l.file).concat(ARMS.map((p) => p.file), ["legwear.png", cfg.footLFile, cfg.footRFile]))];
      const texByFile = new Map<string, Texture>();
      try { await Promise.all(files.map(async (f) => texByFile.set(f, await Assets.load(`${DIR}/${f}`)))); }
      catch { setStatus("画像の読込に失敗"); return; }
      if (disposed) return;

      const S = 0.40;
      const root = new Container();
      root.scale.set(S);
      const hipCanvas = cfg.hipCanvas;
      root.position.set(hipCanvas[0], hipCanvas[1]);
      app.stage.addChild(root);

      const sub = (file: string, f: Frame) => new Texture({ source: texByFile.get(file)!.source, frame: new Rectangle(f[0], f[1], f[2], f[3]) });
      const placed = (l: Layer) => { const s = new Sprite(sub(l.file, l.frame)); s.position.set(l.frame[0] - HIP[0], l.frame[1] - HIP[1]); return s; };

      // 腕インフラ(剛体カットアウト。host=描画する親コンテナ)
      const conts = new Map<string, Container>();
      const armDriven: { cont: Container; bone: BoneId; amp: number }[] = [];
      const armPivots = new Map<string, [number, number]>([["upper", HIP]]);
      for (const p of ARMS) armPivots.set(p.key, p.pivot);
      const buildArm = (key: string, host: Container) => {
        const p = ARMS.find((q) => q.key === key)!;
        const parentCont = p.parent === "upper" ? host : conts.get(p.parent)!;
        const pp = armPivots.get(p.parent)!;
        const cont = new Container(); cont.position.set(p.pivot[0] - pp[0], p.pivot[1] - pp[1]);
        const s = new Sprite(sub(p.file, p.frame)); s.position.set(p.frame[0] - p.pivot[0], p.frame[1] - p.pivot[1]);
        cont.addChild(s); parentCont.addChild(cont); conts.set(p.key, cont);
        if (p.bone) armDriven.push({ cont, bone: p.bone, amp: p.amp ?? 1 });
      };

      // 1) 後ろ髪(最奥)。頭の前傾に追従(股中心の hairLean)しつつ、毛先が遅れて
      //    揺れる(生え際中心の hairSway をバネ減衰で遅延 = フォロースルー)。
      const bh = BACK_LAYERS[0]!;
      const hairLeanCont = new Container();
      root.addChild(hairLeanCont);
      const hairSwayCont = new Container();
      hairSwayCont.position.set(HAIR_PIVOT[0] - HIP[0], HAIR_PIVOT[1] - HIP[1]);
      hairLeanCont.addChild(hairSwayCont);
      const bhSprite = new Sprite(sub(bh.file, bh.frame));
      bhSprite.position.set(bh.frame[0] - HAIR_PIVOT[0], bh.frame[1] - HAIR_PIVOT[1]);
      hairSwayCont.addChild(bhSprite);
      // 1.5) 右腕(画像左)= 後ろ髪のすぐ前・他すべて(脚/体/頭)の背面
      const backArm = new Container(); root.addChild(backArm);
      buildArm("upperArmL", backArm); buildArm("forearmL", backArm);
      // 1.6) 奥靴コンテナ(footL=texture-L=奥側 をここに入れる)。
      //      奥脚のすぐ前(=奥脚のトラウザ裾が奥靴の上端を隠す)。
      const shoeBack = new Container(); root.addChild(shoeBack);

      // 2) 下半身メッシュ(ズボン全体を骨盤+両脚にスキニング)
      const COLS = 11, ROWS = 16;
      const gx0 = cfg.meshGx0, gx1 = cfg.meshGx1, gy0 = cfg.meshGy0, gy1 = cfg.meshGy1;
      const nV = COLS * ROWS;
      const rest = new Float32Array(nV * 2); // 画像px(rest)
      const pos = new Float32Array(nV * 2); // root-local(変形後)
      const uvs = new Float32Array(nV * 2);
      // weights[v] = {pelvis, thighL, shinL, thighR, shinR}
      const W = new Float32Array(nV * 5);
      let vi = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = gx0 + (gx1 - gx0) * (c / (COLS - 1));
          const y = gy0 + (gy1 - gy0) * (r / (ROWS - 1));
          rest[vi * 2] = x; rest[vi * 2 + 1] = y;
          uvs[vi * 2] = x / TEXW; uvs[vi * 2 + 1] = y / TEXW;
          // 重み: 上部=骨盤、膝でthigh/shin、中心帯で左右ブレンド(キャラ設定値)
          const wP = 1 - smooth(cfg.wPRange[0], cfg.wPRange[1], y); // ウエスト〜股上は静止
          const kT = smooth(cfg.kTRange[0], cfg.kTRange[1], y); // 膝で太腿→脛
          const sL = 1 - smooth(cfg.sLRange[0], cfg.sLRange[1], x); // x中心帯で左右脚をブレンド
          const rest5 = 1 - wP;
          W[vi * 5 + 0] = wP;
          W[vi * 5 + 1] = rest5 * sL * (1 - kT); // thighL
          W[vi * 5 + 2] = rest5 * sL * kT;       // shinL
          W[vi * 5 + 3] = rest5 * (1 - sL) * (1 - kT); // thighR
          W[vi * 5 + 4] = rest5 * (1 - sL) * kT;       // shinR
          vi++;
        }
      }
      const idx: number[] = [];
      for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
        const i = r * COLS + c;
        idx.push(i, i + 1, i + COLS, i + 1, i + COLS + 1, i + COLS);
      }
      // 初期 pos = rest - HIP
      for (let v = 0; v < nV; v++) { pos[v * 2] = rest[v * 2]! - HIP[0]; pos[v * 2 + 1] = rest[v * 2 + 1]! - HIP[1]; }
      const geom = new MeshGeometry({ positions: pos.slice(), uvs, indices: new Uint32Array(idx) });
      const legMesh = new Mesh({ geometry: geom, texture: texByFile.get("legwear.png")! });
      root.addChild(legMesh);
      const posBuf = geom.getBuffer("aPosition");

      // 2.5) ミックス用: 脚ごとに分離したメッシュ。剛体ベース(太腿/脛は剛体)+ 膝の継ぎ目
      //      だけ変形。左右を別メッシュにして z で重ね(近=左を手前)、被っても潰れない。
      type LegMeshData = { rest: Float32Array; W: Float32Array; posBuf: ReturnType<MeshGeometry["getBuffer"]>; mesh: Mesh; nV: number };
      // 両脚のボーンを共有する重み構造(単一メッシュと同じ sL ブレンド)で各脚を作る。
      // 共有重みなので、左右メッシュの境界(midline)が常に同じ位置に来る → 継ぎ目が出ない。
      // 違いは描画範囲(xLo..xHi)とz順/tintのみ。
      const buildLegMesh = (xLo: number, xHi: number, cols: number): LegMeshData => {
        const rows = ROWS, n = cols * rows;
        const rA = new Float32Array(n * 2), uA = new Float32Array(n * 2), pA = new Float32Array(n * 2);
        const WA = new Float32Array(n * 5);
        const isLeftMesh = xLo < cfg.midline - 1; // L=midより前、R=midより後
        let k = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const x = xLo + (xHi - xLo) * (c / (cols - 1));
          const y = gy0 + (gy1 - gy0) * (r / (rows - 1));
          rA[k * 2] = x; rA[k * 2 + 1] = y; uA[k * 2] = x / TEXW; uA[k * 2 + 1] = y / TEXW;
          const wP = 1 - smooth(cfg.wPRange[0], cfg.wPRange[1], y);
          const kT = smooth(cfg.kTRange[0], cfg.kTRange[1], y);
          // sL は y で振る舞いを変える:
          //  ・上半身(股付近): 左右脚をブレンド → midline の継ぎ目が出ない
          //  ・膝より下: 各メッシュは自分側の脚に振り切る → 足首が引かれて細くならない
          const sL_upper = 1 - smooth(cfg.sLRange[0], cfg.sLRange[1], x);
          const sL_lower = isLeftMesh ? 1 : 0;
          const lowerY = smooth(cfg.lowerYRange[0], cfg.lowerYRange[1], y);
          const sL = sL_upper * (1 - lowerY) + sL_lower * lowerY;
          const rest5 = 1 - wP;
          WA[k * 5] = wP;
          WA[k * 5 + 1] = rest5 * sL * (1 - kT);       // thighL
          WA[k * 5 + 2] = rest5 * sL * kT;             // shinL
          WA[k * 5 + 3] = rest5 * (1 - sL) * (1 - kT); // thighR
          WA[k * 5 + 4] = rest5 * (1 - sL) * kT;       // shinR
          k++;
        }
        const ix: number[] = [];
        for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
          const i = r * cols + c; ix.push(i, i + 1, i + cols, i + 1, i + cols + 1, i + cols);
        }
        for (let v = 0; v < n; v++) { pA[v * 2] = rA[v * 2]! - HIP[0]; pA[v * 2 + 1] = rA[v * 2 + 1]! - HIP[1]; }
        const g = new MeshGeometry({ positions: pA.slice(), uvs: uA, indices: new Uint32Array(ix) });
        const m = new Mesh({ geometry: g, texture: texByFile.get("legwear.png")! });
        return { rest: rA, W: WA, posBuf: g.getBuffer("aPosition"), mesh: m, nV: n };
      };
      // 右半分(奥/far) と 左半分(手前/near)。midline=620 で接続、共有重みなので継ぎ目なし。
      const legMixR = buildLegMesh(cfg.midline, gx1, 7);
      const legMixL = buildLegMesh(gx0, cfg.midline, 7);
      // 両脚とも upper(上着)より奥に置く。手前/奥の depth swap をすると、
      // 上着の裾より上にあるズボン上部(ウエスト〜股上)が片側だけ前面に出てしまい
      // 「上半身と下半身が分離した」見え方になる。脚の前後 depth はカットアウト時の
      // FK で十分なので、メッシュは両方とも legBack に置く。
      const legBack = new Container(); root.addChild(legBack);
      legBack.addChild(legMixL.mesh);
      legBack.addChild(legMixR.mesh);
      legMixR.mesh.visible = false; legMixL.mesh.visible = false;

      // 剛体カットアウト版の脚(比較トグル用)
      const legCutout = new Container();
      legCutout.visible = false;
      root.addChild(legCutout);
      const cutPieces: { cont: Container; bone: BoneId; pivot: [number, number]; amp: number }[] = [];
      const buildCut = (frame: Frame, pivot: [number, number], parentCont: Container, parentPivot: [number, number], bone: BoneId | null, amp: number) => {
        const cont = new Container();
        cont.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1]);
        const s = new Sprite(sub("legwear.png", frame)); s.position.set(frame[0] - pivot[0], frame[1] - pivot[1]);
        cont.addChild(s); parentCont.addChild(cont);
        if (bone) cutPieces.push({ cont, bone, pivot, amp });
        return cont;
      };
      const tL = buildCut(cfg.thighLFrame, HIP_L, legCutout, HIP, "thighL", FK_THIGH_AMP);
      buildCut(cfg.shinLFrame, KNEE_L, tL, HIP_L, "shinL", FK_SHIN_AMP);
      const tR = buildCut(cfg.thighRFrame, HIP_R, legCutout, HIP, "thighR", FK_THIGH_AMP);
      buildCut(cfg.shinRFrame, KNEE_R, tR, HIP_R, "shinR", FK_SHIN_AMP);

      const FOOT_L: Frame = cfg.footLFrame, FOOT_R: Frame = cfg.footRFrame;
      // footL は texture-L = 奥側 → shoeBack へ。footR は texture-R = 手前側 → shoeFront へ。
      // 鏡反転で前/奥が自動的に正しい canvas 側に飛ぶ(legBack/legFront と同じ規約)。
      const shoeFront = new Container(); // upper の後で root に追加(z位置=手前脚の直前)
      const footL = new Container(); const fls = new Sprite(sub(cfg.footLFile, FOOT_L)); fls.position.set(FOOT_L[0] - ANKLE_L[0], FOOT_L[1] - ANKLE_L[1]); footL.addChild(fls); shoeBack.addChild(footL);
      const footR = new Container(); const frs = new Sprite(sub(cfg.footRFile, FOOT_R)); frs.position.set(FOOT_R[0] - ANKLE_R[0], FOOT_R[1] - ANKLE_R[1]); footR.addChild(frs); shoeFront.addChild(footR);

      // 3) 上半身(左腕=体の前 + 前面レイヤー)
      const upper = new Container();
      root.addChild(upper);
      upper.addChild(placed(FRONT_LAYERS[0]!)); // 上着
      // 目: まばたき用に 白目/瞳/睫毛 を 1 つの container にまとめ、白目の視覚中心を
      // pivot にして scale.y を絞ると目の中央から閉じる。z 順を保つため、最初に出てきた
      // 目レイヤーの位置で eyeCont を upper に挿入する。
      const EYE_FILES = new Set(["eyewhite.png", "irides.png", "eyelash.png"]);
      const eyeWhite = FRONT_LAYERS.find((l) => l.file === "eyewhite.png");
      const eyeCont = new Container();
      if (eyeWhite) {
        const ex = eyeWhite.frame[0] + eyeWhite.frame[2] / 2 - HIP[0];
        const ey = eyeWhite.frame[1] + eyeWhite.frame[3] / 2 - HIP[1];
        eyeCont.pivot.set(ex, ey);
        eyeCont.position.set(ex, ey);
      }
      let eyeAttached = false;
      for (const l of FRONT_LAYERS.slice(1)) {
        if (EYE_FILES.has(l.file)) {
          if (!eyeAttached) { upper.addChild(eyeCont); eyeAttached = true; }
          eyeCont.addChild(placed(l));
        } else {
          upper.addChild(placed(l));
        }
      }

      // 4) 手前靴レイヤー(upper の後)。
      root.addChild(shoeFront);
      // 5) 手前腕レイヤー: lean/bobは upper と同じ挙動なので
      //    独立した frontArmCont を立てて、ticker で同じ rotation/position を適用。
      const frontArmCont = new Container();
      root.addChild(frontArmCont);
      buildArm("upperArmR", frontArmCont); buildArm("forearmR", frontArmCont);

      // 6) 腕ミックス用メッシュ(rest+剛体+肘継ぎ目)。左右別メッシュ。bbox は handwear texture 内の
      //    各腕領域。重みは 3 ボーン smoothstep:
      //      wT(rest=身体側, 無回転) → 上端 SHOULDER_BAND 幅で 1→0
      //      wF(forearm)            → 肘前後 37px バンドで 0→1
      //      wU(upperArm)           → 残り(1 - wT - wF)
      //    肩キャップ領域(肩ピボットより上の数pxを含む上端帯)を身体に貼り付けたまま、
      //    その下から upperArm の回転に滑らかに渡せる → どのポーズで腕を回しても
      //    肩は body 側にとどまる(「付け根が浮遊」しない)。
      const SHOULDER_BAND = 30; // px(rest→upperArm 遷移帯。実画素で配筋約 1 行分)
      type ArmMeshData = { rest: Float32Array; W: Float32Array; posBuf: ReturnType<MeshGeometry["getBuffer"]>; mesh: Mesh; nV: number; upperKey: BoneId; foreKey: BoneId; uppPivot: [number, number]; forPivot: [number, number] };
      const buildArmMesh = (bbox: [number, number, number, number], elbowY: number, upperKey: BoneId, foreKey: BoneId, uppPivot: [number, number], forPivot: [number, number]): ArmMeshData => {
        const [xLo, yLo, xHi, yHi] = bbox;
        const cols = 5, rows = 14, n = cols * rows;
        const rA = new Float32Array(n * 2), uA = new Float32Array(n * 2), pA = new Float32Array(n * 2);
        const WA = new Float32Array(n * 3); // 3 bones(rest/upperArm/forearm)
        let k = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const x = xLo + (xHi - xLo) * (c / (cols - 1));
          const y = yLo + (yHi - yLo) * (r / (rows - 1));
          rA[k * 2] = x; rA[k * 2 + 1] = y; uA[k * 2] = x / TEXW; uA[k * 2 + 1] = y / TEXW;
          const wT = 1 - smooth(yLo, yLo + SHOULDER_BAND, y);  // rest(肩帯)
          const wF = smooth(elbowY - 18.5, elbowY + 18.5, y);  // forearm(肘前後)
          const wU = Math.max(0, 1 - wT - wF);                  // upperArm(残り)
          WA[k * 3] = wT;
          WA[k * 3 + 1] = wU;
          WA[k * 3 + 2] = wF;
          k++;
        }
        const ix: number[] = [];
        for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
          const i = r * cols + c; ix.push(i, i + 1, i + cols, i + 1, i + cols + 1, i + cols);
        }
        for (let v = 0; v < n; v++) { pA[v * 2] = rA[v * 2]!; pA[v * 2 + 1] = rA[v * 2 + 1]!; }
        const g = new MeshGeometry({ positions: pA.slice(), uvs: uA, indices: new Uint32Array(ix) });
        const m = new Mesh({ geometry: g, texture: texByFile.get("handwear.png")! });
        return { rest: rA, W: WA, posBuf: g.getBuffer("aPosition"), mesh: m, nV: n, upperKey, foreKey, uppPivot, forPivot };
      };
      // L腕(画像左=texture-L=奥側)
      const armPivL = ARMS.find((a) => a.key === "upperArmL")!.pivot;
      const forePivL = ARMS.find((a) => a.key === "forearmL")!.pivot;
      const armMeshL = buildArmMesh(cfg.armLBbox, cfg.elbowYL, "upperArmL", "forearmL", armPivL, forePivL);
      // R腕(画像右=texture-R=手前側)
      const armPivR = ARMS.find((a) => a.key === "upperArmR")!.pivot;
      const forePivR = ARMS.find((a) => a.key === "forearmR")!.pivot;
      const armMeshR = buildArmMesh(cfg.armRBbox, cfg.elbowYR, "upperArmR", "forearmR", armPivR, forePivR);
      // 奥腕 mesh は backArm に、手前腕 mesh は frontArmCont に入れる(z順は腕と同じ)。
      backArm.addChild(armMeshL.mesh);
      frontArmCont.addChild(armMeshR.mesh);
      armMeshL.mesh.visible = false; armMeshR.mesh.visible = false;

      const bonesG = new Graphics();
      app.stage.addChild(bonesG);
      const wireG = new Graphics();
      app.stage.addChild(wireG);

      setStatus("");

      // 舞台用: facing 反転は scale.x のみ。チビ前向き体型は texture-L が見た目の右半身、
      // texture-R が見た目の左半身を担うため、鏡反転だけで前/奥の関係も z順も tint も
      // 自動的に正しく入れ替わる(texture-Rの「奥側」のtintは鏡で奥側に飛ぶ)。
      applyFacingRef.current = (newFacing: "left" | "right") => {
        root.scale.x = newFacing === "left" ? S : -S;
      };

      // 既定クリップは walk-girl。ポーズ切替時は poseRef.current で参照先を差し替える。
      let t = 0;
      const bobK = cfg.bobK;
      // クリップ無しポーズ(棒立ち)の空フレーム
      const EMPTY_FRAME = { pose: { rotations: {} as Record<string, number>, rootOffset: [0, 0] as [number, number] } };
      // 後ろ髪フォロースルー用のバネ状態
      let hairAng = 0, hairVel = 0, prevBob = 0;
      // まばたき状態: blinkPhase = -1 はアイドル、[0,1] はまばたき進行(150ms)。
      // blinkCooldown は次のまばたきまでの秒(2.5–5.5s)。
      let blinkCooldown = 2.5 + Math.random() * 3;
      let blinkPhase = -1;
      let frameDispCount = 0; // DOM フレーム表示の更新カウンタ(~100ms 毎)
      const eyeHoldRef = { current: null as number | null }; // DEV: scale.y を固定して目検証

      // app と snap を ref に bind(JSX ボタンと DEV フックから参照)。
      appRef.current = app;
      snapRef.current = async (name) => {
        const a = appRef.current;
        if (!a) return null;
        // プレビュー iframe が非表示だと rAF がスロットルされて scrub/pose の変更が
        // ticker に反映されないまま snap が走る → 古い canvas を撮ってしまう。
        // 明示的に ticker を 1 回回してから extract する。
        try { a.ticker.update(performance.now()); } catch { /* noop */ }
        // Pixi の実画素 canvas(DPR=2 で 960x1320) → 480x660 にダウンサンプル PNG
        const src = a.renderer.extract.canvas(a.stage) as HTMLCanvasElement;
        const TW = 480, TH = 660;
        const dst = document.createElement("canvas");
        dst.width = TW; dst.height = TH;
        const ctx = dst.getContext("2d");
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, TW, TH);
        const dataUrl = dst.toDataURL("image/png");
        const dur = clipDurRef.current || 1;
        const phase = ((tRef.current % dur) / dur) * 100;
        const charId = cfg.dir.split("/").pop() || "char";
        const fullName = `${charId}-${poseRef.current}-${name || "snap"}-p${phase.toFixed(0)}`;
        try {
          const r = await fetch("/__pose-snapshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: fullName, dataUrl }),
          });
          const j = await r.json() as { path?: string; bytes?: number };
          return j.path ?? null;
        } catch (e) { console.error("snap failed", e); return null; }
      };

      // DEV: 位相固定/スナップ/まばたきの検証フック
      if (import.meta.env.DEV) {
        // __rigFrame(0.5) = 50% of current pose. null/未指定 = 自動再生に戻す。
        (globalThis as unknown as { __rigFrame?: (phase01: number | null) => void }).__rigFrame = (p) => {
          scrubRef.current = p == null ? null : Math.max(0, Math.min(1, p));
        };
        // 旧 __rigScrub(秒指定)は __rigFrame に統合。互換のため ratio に変換して受ける。
        (globalThis as unknown as { __rigScrub?: (v: number | null) => void }).__rigScrub = (v) => {
          scrubRef.current = v == null ? null : Math.max(0, Math.min(1, v / clipDurRef.current));
        };
        (globalThis as unknown as { __rigSnap?: (name?: string) => Promise<string | null> }).__rigSnap = (name) => snapRef.current(name);
        (globalThis as unknown as { __rigApp?: Application }).__rigApp = app;
        (globalThis as unknown as { __rigEye?: () => number }).__rigEye = () => eyeCont.scale.y;
        (globalThis as unknown as { __rigBlinkNow?: () => void }).__rigBlinkNow = () => { blinkPhase = 0; };
        (globalThis as unknown as { __rigEyeHold?: (v: number | null) => void }).__rigEyeHold =
          (v) => { eyeHoldRef.current = v; };
      }

      // ───────────────────────────────────────────────────────────────────────
      // インタラクティブ pivot エディタ: 🦴 ボーン ON のとき、腕の付け根/肘 dot を
      // ホバー → ドラッグで動かせる。texture 座標は parent 容器の toLocal で逆算。
      // 結果は cfg.arms[i].pivot を in-place mutate するだけ。container.position と
      // sprite.position は ticker 側で毎フレーム再設定するので即座に追従する。
      // 「💾 軸保存」で /__rig-save に POST して character-configs.ts に書き戻し。
      const editStateRef = editStateRefOuter; // 既に component scope で持っている
      const HIT_R = 14;
      const screenPosOf = (armKey: string) => {
        const c = conts.get(armKey);
        return c ? c.toGlobal({ x: 0, y: 0 }) : null;
      };
      const findArmAt = (mx: number, my: number): string | null => {
        for (const p of ARMS) {
          const s = screenPosOf(p.key);
          if (!s) continue;
          const dx = s.x - mx, dy = s.y - my;
          if (dx * dx + dy * dy <= HIT_R * HIT_R) return p.key;
        }
        return null;
      };
      const onPM = (e: PointerEvent) => {
        if (!bonesRef.current) return;
        const rect = host.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        if (editStateRef.current.dragging) {
          const armConf = ARMS.find((a) => a.key === editStateRef.current.dragging);
          if (!armConf) return;
          const parent = armConf.parent === "upper" ? upper : conts.get(armConf.parent);
          if (!parent) return;
          const parentLocal = parent.toLocal({ x: mx, y: my });
          const pp = armPivots.get(armConf.parent);
          if (!pp) return;
          armConf.pivot[0] = parentLocal.x + pp[0];
          armConf.pivot[1] = parentLocal.y + pp[1];
          e.preventDefault();
        } else {
          const hit = findArmAt(mx, my);
          editStateRef.current.hovered = hit;
          host.style.cursor = hit ? "grab" : "";
        }
      };
      const onPD = (e: PointerEvent) => {
        if (!bonesRef.current) return;
        const rect = host.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const hit = findArmAt(mx, my);
        if (hit) {
          editStateRef.current.dragging = hit;
          host.setPointerCapture?.(e.pointerId);
          host.style.cursor = "grabbing";
          e.preventDefault();
        }
      };
      const onPU = (e: PointerEvent) => {
        if (editStateRef.current.dragging) {
          editStateRef.current.dragging = null;
          try { host.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
          host.style.cursor = editStateRef.current.hovered ? "grab" : "";
        }
      };
      host.addEventListener("pointermove", onPM);
      host.addEventListener("pointerdown", onPD);
      host.addEventListener("pointerup", onPU);
      host.addEventListener("pointercancel", onPU);
      pointerCleanupRef.current = () => {
        host.removeEventListener("pointermove", onPM);
        host.removeEventListener("pointerdown", onPD);
        host.removeEventListener("pointerup", onPU);
        host.removeEventListener("pointercancel", onPU);
      };

      app.ticker.add(() => {
        const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 15);
        if (scrubRef.current == null && playingRef.current) t += dt;
        const clip = POSES[poseRef.current].clip;
        const curDur = clip?.duration ?? 1;
        // scrubRef は ratio(0..1)。null=自動。秒換算は curDur を掛ける(ポーズが
        // 切り替わっても%指定はそのまま追従する)。
        const tt = scrubRef.current != null ? scrubRef.current * curDur : t;
        const frame = clip ? sampleClip(clip, tt % curDur) : EMPTY_FRAME;
        clipDurRef.current = curDur;
        tRef.current = tt;
        frameDispCount++;
        if (frameDispCount % 6 === 0 && frameDisplayRef.current) {
          const inDur = tt % curDur;
          const pct = curDur > 0 ? (inDur / curDur) * 100 : 0;
          frameDisplayRef.current.textContent =
            `${inDur.toFixed(2)}s / ${curDur.toFixed(2)}s (${pct.toFixed(0)}%)`;
        }
        const rot = frame.pose.rotations ?? {};
        const sg = signRef.current;
        const ikOn = ikRef.current;
        // 腰の上下動は root全体ではなく「股」を画像空間で上下させる(足は接地で固定)。
        const bobImg = (frame.pose.rootOffset?.[1] ?? 0) * bobK;
        const transBob: Aff = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: bobImg };

        // 各脚の位相(右は半周オフセット)と接地ウェイト(stance中核=1, 遊脚=0)。
        const phaseL = ((tt % 1) + 1) % 1;
        const phaseR = (phaseL + 0.5) % 1;
        // 足の床フラット度(脛追従→床水平)。踵接地〜爪先離れで1へ。
        const plantW = (p: number) => (p >= 0.5 ? 0 : smooth(0.02, 0.2, p) * (1 - smooth(0.34, 0.5, p)));
        const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
        // 足首の目標軌道(画像空間)。接地中=床を等速で後退、遊脚中=後→前へ弧を描いて持ち上げ。
        const footPath = (phase: number, hipX: number): [number, number] => {
          if (phase < 0.5) {
            const sp = phase / 0.5; // 0(踵接地)→1(爪先離れ)
            return [hipX - STEP / 2 + STEP * sp, GROUND_Y]; // 前→後へ等速(トレッドミル)
          }
          const sw = (phase - 0.5) / 0.5; // 0→1(遊脚)
          const xBack = hipX + STEP / 2, xFront = hipX - STEP / 2;
          return [xBack + (xFront - xBack) * smoother(sw), GROUND_Y - LIFT * Math.sin(Math.PI * sw)];
        };
        // 1脚: ON時は全周フル2ボーンIK(接地→遊脚弧)。膝の畳みは足の持ち上げ量から自然に出る。
        const solveLeg = (
          phase: number, hip: [number, number], L1: number, L2: number,
          restTh: number, restSh: number, fkTh: number, fkSh: number,
        ): { th: number; sh: number; w: number } => {
          if (!ikOn) return { th: fkTh, sh: fkSh, w: 0 };
          const [tx, ty] = footPath(phase, hip[0]);
          const [thW, shW] = legIK(hip[0], hip[1] + bobImg, tx, ty, L1, L2, 1);
          return { th: thW - restTh, sh: shW - restSh - (thW - restTh), w: plantW(phase) };
        };
        const fkThL = deg2rad(sg * FK_THIGH_AMP * (rot["thighL"] ?? 0));
        const fkShL = deg2rad(sg * FK_SHIN_AMP * (rot["shinL"] ?? 0));
        const fkThR = deg2rad(sg * FK_THIGH_AMP * (rot["thighR"] ?? 0));
        const fkShR = deg2rad(sg * FK_SHIN_AMP * (rot["shinR"] ?? 0));
        const legL = solveLeg(phaseL, HIP_L, L1L, L2L, REST_TH_L, REST_SH_L, fkThL, fkShL);
        const legR = solveLeg(phaseR, HIP_R, L1R, L2R, REST_TH_R, REST_SH_R, fkThR, fkShR);
        const thL = legL.th, shL = legL.sh, thR = legR.th, shR = legR.sh;
        // pelvis(骨盤)も bob で上下 → 上は腰に追従、下(足)は接地で固定、膝が吸収。
        const WthighL = mul(transBob, rotAbout(HIP_L[0], HIP_L[1], thL));
        const WshinL = mul(WthighL, rotAbout(KNEE_L[0], KNEE_L[1], shL));
        const WthighR = mul(transBob, rotAbout(HIP_R[0], HIP_R[1], thR));
        const WshinR = mul(WthighR, rotAbout(KNEE_R[0], KNEE_R[1], shR));

        const lMode = legModeRef.current;
        legMesh.visible = lMode === "mesh";
        legMixL.mesh.visible = legMixR.mesh.visible = lMode === "mix";
        legCutout.visible = lMode === "cutout";
        if (lMode === "cutout") {
          for (const { cont, bone, amp } of cutPieces) cont.rotation = deg2rad(sg * amp * (rot[bone] ?? 0));
        } else {
          // 対数(スクリュー)ブレンドスキニング。各ボーン剛体変換の log を重み平均し exp で戻す
          // → 回転の大きさが保たれ(つぶれない)剛体変換を正しく内挿する(段差/せん断なし)。
          const lbsBones = [transBob, WthighL, WshinL, WthighR, WshinR];
          const bTh: number[] = [], bUx: number[] = [], bUy: number[] = [];
          for (let b = 0; b < 5; b++) {
            const M = lbsBones[b]!;
            const th = Math.atan2(M.b, M.a);
            let aC: number, bC: number;
            if (Math.abs(th) < 1e-6) { aC = 1; bC = 0; }
            else { aC = Math.sin(th) / th; bC = (1 - Math.cos(th)) / th; }
            const den = aC * aC + bC * bC;
            bTh[b] = th; bUx[b] = (aC * M.tx + bC * M.ty) / den; bUy[b] = (-bC * M.tx + aC * M.ty) / den;
          }
          // 関節バルジ(紡錘形): 股下→膝で増加・膝→足首で減少、曲げ量に比例。
          const bulgeOn = bulgeRef.current;
          const absSh = [0, Math.abs(shL), Math.abs(shL), Math.abs(shR), Math.abs(shR)];
          const CROTCH_Y = cfg.crotchY, KNEE_Y = KNEE_L[1], ANK_Y = ANKLE_L[1];
          const useLog = skinRef.current;
          // 1メッシュ分をスキニング(restA/WA/pd)。log-blend or LBS、バルジ適用。
          const skin = (restA: Float32Array, WA: Float32Array, pd: Float32Array, count: number) => {
            for (let v = 0; v < count; v++) {
              let rx = restA[v * 2]!; const ry = restA[v * 2 + 1]!;
              if (bulgeOn) {
                const lw = WA[v * 5 + 1]! + WA[v * 5 + 2]!, rw = WA[v * 5 + 3]! + WA[v * 5 + 4]!, legW = lw + rw;
                if (legW >= 1e-4) {
                  const prof = ry <= KNEE_Y ? smooth(CROTCH_Y, KNEE_Y, ry) : 1 - smooth(KNEE_Y, ANK_Y, ry);
                  if (prof > 0) {
                    const bend = (lw * absSh[1]! + rw * absSh[3]!) / legW;
                    const cX = (lw * cfg.legCenterLX + rw * cfg.legCenterRX) / legW;
                    rx = cX + (rx - cX) * (1 + BULGE_K * prof * bend);
                  }
                }
              }
              if (useLog) {
                let th = 0, ux = 0, uy = 0;
                for (let b = 0; b < 5; b++) { const w = WA[v * 5 + b]!; if (w === 0) continue; th += w * bTh[b]!; ux += w * bUx[b]!; uy += w * bUy[b]!; }
                let aC: number, bC: number;
                if (Math.abs(th) < 1e-6) { aC = 1; bC = 0; } else { aC = Math.sin(th) / th; bC = (1 - Math.cos(th)) / th; }
                const tx = aC * ux - bC * uy, ty = bC * ux + aC * uy, c = Math.cos(th), s = Math.sin(th);
                pd[v * 2] = (c * rx - s * ry + tx) - HIP[0]; pd[v * 2 + 1] = (s * rx + c * ry + ty) - HIP[1];
              } else {
                let dx = 0, dy = 0;
                for (let b = 0; b < 5; b++) { const w = WA[v * 5 + b]!; if (w === 0) continue; const M = lbsBones[b]!; dx += w * ax(M, rx, ry); dy += w * ay(M, rx, ry); }
                pd[v * 2] = dx - HIP[0]; pd[v * 2 + 1] = dy - HIP[1];
              }
            }
          };
          if (lMode === "mesh") { skin(rest, W, posBuf.data as Float32Array, nV); posBuf.update(); }
          else {
            skin(legMixL.rest, legMixL.W, legMixL.posBuf.data as Float32Array, legMixL.nV); legMixL.posBuf.update();
            skin(legMixR.rest, legMixR.W, legMixR.posBuf.data as Float32Array, legMixR.nV); legMixR.posBuf.update();
          }
        }

        // 足を脛末端へ(脛のworldで位置)。接地中(w)は脛追従をやめて床に水平、
        // 足首ピッチ(踵接地/爪先離れ)を重ねる。遊脚は脛に追従。
        const rotAny = rot as Record<string, number>;
        const placeFoot = (foot: Container, Wsh: Aff, ankle: [number, number], ankleDeg: number, w: number) => {
          foot.position.set(ax(Wsh, ankle[0], ankle[1]) - HIP[0], ay(Wsh, ankle[0], ankle[1]) - HIP[1]);
          foot.rotation = (1 - w) * Math.atan2(Wsh.b, Wsh.a) + deg2rad(sg * ankleDeg);
        };
        placeFoot(footL, WshinL, ANKLE_L, rotAny["ankleL"] ?? 0, legL.w);
        placeFoot(footR, WshinR, ANKLE_R, rotAny["ankleR"] ?? 0, legR.w);

        // 腕(剛体)
        // pivot 編集に追従するため container.position と sprite.position を毎フレーム再設定。
        for (const p of ARMS) {
          const cont = conts.get(p.key);
          const pp = armPivots.get(p.parent);
          if (!cont || !pp) continue;
          cont.position.set(p.pivot[0] - pp[0], p.pivot[1] - pp[1]);
          const spr = cont.children[0];
          if (spr) spr.position.set(p.frame[0] - p.pivot[0], p.frame[1] - p.pivot[1]);
        }
        for (const { cont, bone, amp } of armDriven) cont.rotation = deg2rad(sg * amp * (rot[bone] ?? 0));
        // 腕ミックス: cutout↔mix トグル。mix時は cutout sprite を隠して mesh を log-blendスキニング。
        const armMixOn = armModeRef.current === "mix";
        conts.get("upperArmL")!.visible = !armMixOn;
        conts.get("upperArmR")!.visible = !armMixOn;
        armMeshL.mesh.visible = armMixOn;
        armMeshR.mesh.visible = armMixOn;
        if (armMixOn) {
          const skinArm = (a: typeof armMeshL) => {
            const uA = deg2rad(sg * 1.0 * (rot[a.upperKey] ?? 0));
            const fA = deg2rad(sg * 1.0 * (rot[a.foreKey] ?? 0));
            // Wrest = 恒等(身体側=肩キャップを body 線に貼り付ける)。
            // Wupp = 肩 pivot 周りの upperArm 回転。Wfor = それに重ねた forearm 回転。
            const Wrest: Aff = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
            const Wupp = rotAbout(a.uppPivot[0], a.uppPivot[1], uA);
            const Wfor = mul(Wupp, rotAbout(a.forPivot[0], a.forPivot[1], fA));
            // log-blend(3ボーン): θ*=Σwθ, u*=Σwu, t*=A(θ*)·u*, p'=R(θ*)p+t*
            const bones = [Wrest, Wupp, Wfor];
            const bTh: number[] = [], bUx: number[] = [], bUy: number[] = [];
            for (let b = 0; b < 3; b++) {
              const M = bones[b]!;
              const th = Math.atan2(M.b, M.a);
              let aC: number, bC: number;
              if (Math.abs(th) < 1e-6) { aC = 1; bC = 0; }
              else { aC = Math.sin(th) / th; bC = (1 - Math.cos(th)) / th; }
              const den = aC * aC + bC * bC;
              bTh[b] = th; bUx[b] = (aC * M.tx + bC * M.ty) / den; bUy[b] = (-bC * M.tx + aC * M.ty) / den;
            }
            const pd = a.posBuf.data as Float32Array;
            for (let v = 0; v < a.nV; v++) {
              const rx = a.rest[v * 2]!, ry = a.rest[v * 2 + 1]!;
              let th = 0, ux = 0, uy = 0;
              for (let b = 0; b < 3; b++) { const w = a.W[v * 3 + b]!; if (w === 0) continue; th += w * bTh[b]!; ux += w * bUx[b]!; uy += w * bUy[b]!; }
              let aC: number, bC: number;
              if (Math.abs(th) < 1e-6) { aC = 1; bC = 0; } else { aC = Math.sin(th) / th; bC = (1 - Math.cos(th)) / th; }
              const tx = aC * ux - bC * uy, ty = bC * ux + aC * uy, c = Math.cos(th), s = Math.sin(th);
              // 親(backArm/frontArmCont)が lean/bob を適用するので、ここでは image-coord - HIP のみ
              pd[v * 2] = (c * rx - s * ry + tx) - HIP[0];
              pd[v * 2 + 1] = (s * rx + c * ry + ty) - HIP[1];
            }
            a.posBuf.update();
          };
          skinArm(armMeshL);
          skinArm(armMeshR);
        }
        // 上体の前傾(クリップの torso が負=前傾を表す)。沈みで屈み蹴り上げで起きる。
        // 上半身・腕・後ろ髪・剛体脚は腰の上下動(bobImg)で一緒に上下(足は接地で固定)。
        const lean = deg2rad(rot["torso"] ?? 0);
        upper.rotation = lean;
        upper.position.y = bobImg;
        backArm.rotation = lean;
        backArm.position.y = bobImg;
        frontArmCont.rotation = lean;
        frontArmCont.position.y = bobImg;
        legCutout.position.y = bobImg;

        // 後ろ髪: 頭の前傾に追従(hairLean)+ 毛先がバネ減衰で遅れて揺れる(hairSway)。
        hairLeanCont.rotation = lean;
        hairLeanCont.position.y = bobImg;
        const bob = frame.pose.rootOffset?.[1] ?? 0;
        const bobVel = dt > 0 ? (bob - prevBob) / dt : 0;
        prevBob = bob;
        // 目標角: 上体の傾きと逆へ毛先が流れる + 上下動の慣性(控えめに)
        const hairTarget = -lean * 0.3 + Math.max(-0.07, Math.min(0.07, bobVel * 0.0018));
        hairVel += ((hairTarget - hairAng) * 80 - hairVel * 16) * dt; // バネ(減衰強めで揺れを抑制)
        hairAng += hairVel * dt;
        hairSwayCont.rotation = hairAng;

        // まばたき: 閉じる(0–0.33) → 閉じたまま(0.33–0.55) → 開く(0.55–1)。
        if (blinkPhase < 0) {
          blinkCooldown -= dt;
          if (blinkCooldown <= 0) blinkPhase = 0;
        } else {
          blinkPhase += dt / 0.15;
          if (blinkPhase >= 1) { blinkPhase = -1; blinkCooldown = 2.5 + Math.random() * 3; }
        }
        let sY = 1;
        if (blinkPhase >= 0) {
          if (blinkPhase < 0.33) sY = 1 - (blinkPhase / 0.33) * 0.9;
          else if (blinkPhase < 0.55) sY = 0.1;
          else sY = 0.1 + ((blinkPhase - 0.55) / 0.45) * 0.9;
        }
        // 表情で目の開閉が指定されていればそれを優先(まばたきはスキップ)、
        // 普通(eyeScale=null) の時のみ自動まばたき値 sY を使う。DEV hold は最強優先。
        const exprScale = EXPRS[exprRef.current].eyeScale;
        eyeCont.scale.y = eyeHoldRef.current ?? exprScale ?? sY;

        root.position.set(hipCanvas[0], hipCanvas[1]); // bobは各パーツ側で適用(足は接地固定)

        wireG.visible = wireRef.current;
        if (wireRef.current) {
          wireG.clear();
          // 各メッシュの三角ワイヤフレーム+頂点ドットを描画。
          // mesh.worldTransform で頂点を画面座標へ。
          const drawMeshWire = (mesh: Mesh, color: number) => {
            if (!mesh.visible) return;
            const pos = (mesh.geometry.getBuffer("aPosition").data as Float32Array);
            const idx = mesh.geometry.getIndex().data as Uint16Array | Uint32Array;
            const wt = mesh.worldTransform;
            const tx = (x: number, y: number) => ({ x: wt.a * x + wt.c * y + wt.tx, y: wt.b * x + wt.d * y + wt.ty });
            // 三角辺
            for (let i = 0; i < idx.length; i += 3) {
              const i0 = idx[i]!, i1 = idx[i + 1]!, i2 = idx[i + 2]!;
              const p0 = tx(pos[i0 * 2]!, pos[i0 * 2 + 1]!);
              const p1 = tx(pos[i1 * 2]!, pos[i1 * 2 + 1]!);
              const p2 = tx(pos[i2 * 2]!, pos[i2 * 2 + 1]!);
              wireG.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).lineTo(p2.x, p2.y).lineTo(p0.x, p0.y);
            }
            wireG.stroke({ width: 1, color, alpha: 0.7 });
            // 頂点ドット
            for (let v = 0; v < pos.length / 2; v++) {
              const p = tx(pos[v * 2]!, pos[v * 2 + 1]!);
              wireG.circle(p.x, p.y, 1.5).fill({ color, alpha: 0.9 });
            }
          };
          // 脚メッシュ(可視のものだけ)
          drawMeshWire(legMesh, 0x00cc66);
          drawMeshWire(legMixL.mesh, 0x00aaff);
          drawMeshWire(legMixR.mesh, 0xff6600);
          // 腕メッシュ
          drawMeshWire(armMeshL.mesh, 0x00aaff);
          drawMeshWire(armMeshR.mesh, 0xff6600);
          // 剛体スプライト(cutout)のフレーム境界も枠線で見せる(レイアウト確認用)。
          const drawSpriteFrame = (cont: Container, color: number) => {
            if (!cont.visible) return;
            const b = cont.getBounds();
            wireG.rect(b.x, b.y, b.width, b.height).stroke({ width: 1, color, alpha: 0.5 });
          };
          drawSpriteFrame(footL, 0x6644ff);
          drawSpriteFrame(footR, 0x6644ff);
          if (legModeRef.current === "cutout") drawSpriteFrame(legCutout, 0x44dd44);
          if (armModeRef.current === "cutout") {
            for (const k of ["upperArmL", "forearmL", "upperArmR", "forearmR"]) {
              const c = conts.get(k); if (c) drawSpriteFrame(c, 0xcc00cc);
            }
          }
        }

        bonesG.visible = bonesRef.current;
        if (bonesRef.current) {
          bonesG.clear();
          const g = (M: Aff, x: number, y: number) => root.toGlobal({ x: ax(M, x, y) - HIP[0], y: ay(M, x, y) - HIP[1] });
          const hipC = g(transBob, HIP[0], HIP[1]);
          const pHipL = g(transBob, HIP_L[0], HIP_L[1]), pKL = g(WthighL, KNEE_L[0], KNEE_L[1]), pAL = g(WshinL, ANKLE_L[0], ANKLE_L[1]);
          const pHipR = g(transBob, HIP_R[0], HIP_R[1]), pKR = g(WthighR, KNEE_R[0], KNEE_R[1]), pAR = g(WshinR, ANKLE_R[0], ANKLE_R[1]);
          bonesG.moveTo(hipC.x, hipC.y).lineTo(pHipL.x, pHipL.y).lineTo(pKL.x, pKL.y).lineTo(pAL.x, pAL.y);
          bonesG.moveTo(hipC.x, hipC.y).lineTo(pHipR.x, pHipR.y).lineTo(pKR.x, pKR.y).lineTo(pAR.x, pAR.y);
          const sh = (k: string) => conts.get(k)!.toGlobal({ x: 0, y: 0 });
          const wL = conts.get("forearmL")!.toGlobal({ x: cfg.wristLOffset[0], y: cfg.wristLOffset[1] }), wR = conts.get("forearmR")!.toGlobal({ x: cfg.wristROffset[0], y: cfg.wristROffset[1] });
          bonesG.moveTo(sh("upperArmL").x, sh("upperArmL").y).lineTo(sh("forearmL").x, sh("forearmL").y).lineTo(wL.x, wL.y);
          bonesG.moveTo(sh("upperArmR").x, sh("upperArmR").y).lineTo(sh("forearmR").x, sh("forearmR").y).lineTo(wR.x, wR.y);
          const neck = upper.toGlobal({ x: 0, y: cfg.neckYLocal }), headTop = upper.toGlobal({ x: 0, y: cfg.headTopYLocal });
          bonesG.moveTo(hipC.x, hipC.y).lineTo(neck.x, neck.y).lineTo(headTop.x, headTop.y);
          bonesG.stroke({ width: 3, color: 0x3aa0ff, alpha: 0.9 });
          for (const p of [hipC, pHipL, pKL, pAL, pHipR, pKR, pAR, sh("upperArmL"), sh("forearmL"), wL, sh("upperArmR"), sh("forearmR"), wR, neck, headTop])
            bonesG.circle(p.x, p.y, 5).fill({ color: 0xff5a3a });
          // 編集対象(腕 pivot)を黄色リングで強調。ドラッグ中はさらに太く。
          for (const p of ARMS) {
            const c = conts.get(p.key);
            if (!c) continue;
            const isDrag = editStateRefOuter.current.dragging === p.key;
            const isHover = editStateRefOuter.current.hovered === p.key;
            if (!isDrag && !isHover) continue;
            const sp = c.toGlobal({ x: 0, y: 0 });
            bonesG.circle(sp.x, sp.y, isDrag ? 13 : 10).stroke({ width: isDrag ? 3 : 2, color: 0xffd400, alpha: 0.95 });
          }
        }
      });
    })();

    return () => {
      disposed = true;
      pointerCleanupRef.current?.();
      pointerCleanupRef.current = null;
      if (app.renderer) app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 舞台の向きが変わったら、scale.x反転 + 腕コンテナ入れ替え + 脚z順入れ替え + tint入れ替えを一括適用。
  useEffect(() => {
    let cancelled = false;
    const tryApply = () => {
      if (cancelled) return;
      if (applyFacingRef.current) {
        applyFacingRef.current(facing);
      } else {
        // mount内のasync IIFEがまだ完了していない場合に備えて、次フレームで再試行
        requestAnimationFrame(tryApply);
      }
    };
    tryApply();
    return () => { cancelled = true; };
  }, [facing]);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "16px", background: "var(--bg-app)", color: "var(--text)" }}>
      <div style={{ fontWeight: 700, marginBottom: "4px" }}>新キャラクター(See-through レイヤー + メッシュ/ボーン 歩行テスト)</div>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px", maxWidth: "780px", lineHeight: 1.6 }}>
        下半身はズボンを1枚のメッシュにして骨盤+両脚へスキニング(線形ブレンド)→ 股が連続変形して継ぎ目が出ない。
        「メッシュ/剛体」で切替比較できる。腕は剛体カットアウト。
        {status && <span style={{ color: "var(--warn)" }}> — {status}</span>}
      </div>
      <div style={{ display: "flex", gap: "18px", marginBottom: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <ToolSection title="演出">
          <button className="ui-btn" onClick={() => setPlaying((p) => !p)}>{playing ? "⏹ 停止" : "▶ 再生"}</button>
          <ToolSelect label="ポーズ" value={pose} onChange={(v) => setPose(v as PoseKey)}
            options={(Object.keys(POSES) as PoseKey[]).map((k) => ({ value: k, label: POSES[k].label }))} />
          <ToolSelect label="表情" value={expression} onChange={(v) => setExpression(v as ExprKey)}
            options={(Object.keys(EXPRS) as ExprKey[]).map((k) => ({ value: k, label: EXPRS[k].label }))} />
          <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "monospace", minWidth: "170px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            📍 <span ref={frameDisplayRef}>0.00s / 0.00s (0%)</span>
          </span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
            <span style={{ color: "var(--text-dim)" }}>スクラブ%:</span>
            <input className="ui-btn" type="number" step={1} min={0} max={100}
              style={{ width: "62px" }}
              placeholder="auto"
              value={scrubPct}
              onChange={(e) => setScrubPct(e.target.value)} />
          </label>
          <button className="ui-btn" onClick={async () => {
            setSnapStatus("保存中…");
            const p = await snapRef.current("manual");
            setSnapStatus(p ? `→ ${p}` : "保存失敗");
            setTimeout(() => setSnapStatus(""), 4000);
          }}>📸 スナップ</button>
          {snapStatus && <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "monospace" }}>{snapStatus}</span>}
        </ToolSection>
        <ToolSection title="リグ">
          <button className="ui-btn" onClick={() => setLegMode((m) => (m === "mesh" ? "mix" : m === "mix" ? "cutout" : "mesh"))}>脚: {LEG_LABEL[legMode]}</button>
          <button className="ui-btn" onClick={() => setArmMode((m) => m === "cutout" ? "mix" : "cutout")}>腕: {armMode === "cutout" ? "剛体" : "ミックス"}</button>
          <button className="ui-btn" onClick={() => setIkMode((m) => !m)}>接地: {ikMode ? "IK" : "FK"}</button>
          <button className="ui-btn" onClick={() => setSkinMode((m) => !m)}>スキン: {skinMode ? "対数" : "LBS"}</button>
          <button className="ui-btn" onClick={() => setBulgeMode((m) => !m)}>関節: {bulgeMode ? "バルジ" : "通常"}</button>
        </ToolSection>
        <ToolSection title="デバッグ">
          <button className="ui-btn" onClick={() => setShowBones((b) => !b)}>🦴 ボーン{showBones ? "OFF" : "ON"}</button>
          <button className="ui-btn" onClick={() => setWireMode((w) => !w)}>🔲 メッシュ{wireMode ? "OFF" : "ON"}</button>
          <button className="ui-btn" onClick={() => setSign((s) => -s)}>脚振り反転({sign > 0 ? "+" : "−"})</button>
          <button className="ui-btn" onClick={async () => {
            setSaveStatus("保存中…");
            const arms = cfg.arms.map((a) => ({ key: a.key, pivot: [a.pivot[0], a.pivot[1]] as [number, number] }));
            const charId = cfg.dir.split("/").pop() || "";
            try {
              const r = await fetch("/__rig-save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ char: charId, arms }),
              });
              const j = await r.json() as { ok?: boolean; replaced?: number };
              setSaveStatus(j.ok ? `${j.replaced} 件保存` : "保存失敗");
            } catch { setSaveStatus("通信失敗"); }
            setTimeout(() => setSaveStatus(""), 4000);
          }}>💾 軸保存</button>
          {saveStatus && <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{saveStatus}</span>}
        </ToolSection>
        <ToolSection title="舞台">
          <button className="ui-btn" onClick={() => setFacing((f) => f === "left" ? "right" : "left")}>{facing === "left" ? "← 左向き" : "右向き →"}</button>
        </ToolSection>
      </div>

      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div ref={hostRef} style={{ width: 480, height: 660, boxShadow: "0 1px 6px rgba(0,0,0,0.3)", background: "#eef1f5", borderRadius: "6px", flexShrink: 0 }} />
        <div style={{ minWidth: 320, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "6px" }}>レイヤー対応表(z = 描画順 1=最奥)</div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "8px" }}>z順は See-through の深度マップ(Marigold)の平均深度で算出。</div>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "4px 6px" }}>z</th><th style={{ padding: "4px 6px" }}>画像</th><th style={{ padding: "4px 6px" }}>部位</th><th style={{ padding: "4px 6px" }}>ボーン</th>
              </tr>
            </thead>
            <tbody>
              {TABLE.map((r, i) => (
                <tr key={r.file} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "3px 6px", color: "var(--text-dim)" }}>{i + 1}</td>
                  <td style={{ padding: "3px 6px" }}>
                    <img
                      src={`${cfg.dir}/${r.file.replace(".png", "_thumb.png")}`}
                      alt={r.jp}
                      onError={(e) => {
                        // _thumb.png が無いキャラは本体 PNG をフォールバック(40px縮小なので帯域コストは軽微)
                        const img = e.currentTarget;
                        if (!img.dataset.fallback) {
                          img.dataset.fallback = "1";
                          img.src = `${cfg.dir}/${r.file}`;
                        }
                      }}
                      style={{ width: 40, height: 40, objectFit: "contain", background: "#dfe4ea", borderRadius: "3px", display: "block" }}
                    />
                  </td>
                  <td style={{ padding: "3px 6px" }}>{r.jp}</td>
                  <td style={{ padding: "3px 6px", color: r.bone.startsWith("—") ? "var(--text-dim)" : "var(--accent)" }}>{r.bone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 外側ラッパ: キャラ選択 + 子に key={char} を付与して切替時に rig をリマウント
export function SpriteRigPage() {
  const [char, setChar] = useState<CharKey>("sakura");
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div style={{ padding: "10px 16px 0", display: "flex", gap: "8px", background: "var(--bg-app)" }}>
        <span style={{ fontSize: "12px", color: "var(--text-dim)", alignSelf: "center" }}>キャラ:</span>
        {(Object.keys(CHARS) as CharKey[]).map((k) => (
          <button
            key={k}
            className="ui-btn"
            style={{ fontWeight: char === k ? 700 : 400, background: char === k ? "var(--accent)" : undefined, color: char === k ? "#fff" : undefined }}
            onClick={() => setChar(k)}
          >
            {CHARS[k].label}
          </button>
        ))}
      </div>
      <CharRig key={char} cfg={CHARS[char]} />
    </div>
  );
}
