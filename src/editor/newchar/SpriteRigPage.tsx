import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Mesh, MeshGeometry, Rectangle, Sprite, Texture } from "pixi.js";
import { withPixiInitLock } from "../../render/pixi-init-lock.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { CLIP_WALK_GIRL } from "./walk-girl.js";
import type { BoneId } from "../../runtime/skeleton.js";

// See-through(SIGGRAPH 2026)出力を深度z順で個別レイヤー描画。
// 下半身(ズボン)は剛体カットアウトだと股で継ぎ目が出るため、1枚のメッシュを
// 骨盤+両脚にスキニング(線形ブレンド)して連続変形させる(継ぎ目が出ない)。
// 腕は剛体カットアウト、上半身は静止レイヤー。
const DIR = "/assets/characters/seethrough-girl";
const HIP: [number, number] = [614, 540];
const TEXW = 1280;

type Frame = [number, number, number, number];
interface Layer { jp: string; file: string; frame: Frame }
const BACK_LAYERS: Layer[] = [{ jp: "後ろ髪", file: "back_hair.png", frame: [540, 125, 202, 185] }];
const FRONT_LAYERS: Layer[] = [
  { jp: "上着", file: "topwear.png", frame: [557, 291, 154, 195] },
  { jp: "首", file: "neck.png", frame: [618, 272, 37, 57] },
  { jp: "頭", file: "head.png", frame: [564, 158, 122, 135] },
  { jp: "耳", file: "ears.png", frame: [657, 237, 30, 37] },
  { jp: "顔", file: "face.png", frame: [564, 135, 111, 157] },
  { jp: "口", file: "mouth.png", frame: [587, 268, 13, 6] },
  { jp: "白目", file: "eyewhite.png", frame: [570, 220, 69, 36] },
  { jp: "瞳", file: "irides.png", frame: [573, 224, 52, 32] },
  { jp: "睫毛", file: "eyelash.png", frame: [567, 215, 75, 32] },
  { jp: "眉", file: "eyebrow.png", frame: [572, 199, 67, 12] },
  { jp: "前髪", file: "front_hair.png", frame: [547, 129, 155, 181] },
];

// 腕(剛体)
interface Piece { key: string; file: string; frame: Frame; pivot: [number, number]; parent: string; bone: BoneId | null; amp?: number }
// 腕は左右一致トラックで駆動(画像左腕=clip L)。amp大きめで前進感のある振りに。
const ARMS: Piece[] = [
  { key: "upperArmL", file: "handwear.png", frame: [534, 332, 76, 161], pivot: [572, 340], parent: "upper", bone: "upperArmL", amp: 1.0 },
  { key: "forearmL", file: "handwear.png", frame: [517, 493, 77, 162], pivot: [555, 500], parent: "upperArmL", bone: "forearmL", amp: 1.0 },
  { key: "upperArmR", file: "handwear.png", frame: [663, 323, 76, 171], pivot: [701, 332], parent: "upper", bone: "upperArmR", amp: 1.0 },
  { key: "forearmR", file: "handwear.png", frame: [666, 495, 81, 173], pivot: [706, 502], parent: "upperArmR", bone: "forearmR", amp: 1.0 },
];

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

// 脚の関節(実測・新版=脚短縮 clean版 y=480-890)
const KNEE_L: [number, number] = [581, 705];
const KNEE_R: [number, number] = [652, 705];
const ANKLE_L: [number, number] = [575, 885];
const ANKLE_R: [number, number] = [660, 885];
const HIP_L: [number, number] = [594, 595];
const HIP_R: [number, number] = [640, 595];

// FKの脚振り。太腿(振り幅)を小さめにして遊脚が支持脚に「振り被る」のを抑える。
// 膝の曲げ(shin)は保って歩きの表情は残す。IKモードはこの値を使わない。
const FK_THIGH_AMP = 0.3; // 太腿の前後振り(小さい=脚が重ならない)
const FK_SHIN_AMP = 0.6;  // 膝の曲げ量も控えめに合わせる

// 接地IK(その場トレッドミル): 支持脚の足首を地面へ固定し、接地中は一定速度で
// 後方へ流す → 足が滑らない(Spine流の grounded walk)。遊脚はFK。
const L1L = Math.hypot(KNEE_L[0] - HIP_L[0], KNEE_L[1] - HIP_L[1]);
const L2L = Math.hypot(ANKLE_L[0] - KNEE_L[0], ANKLE_L[1] - KNEE_L[1]);
const L1R = Math.hypot(KNEE_R[0] - HIP_R[0], KNEE_R[1] - HIP_R[1]);
const L2R = Math.hypot(ANKLE_R[0] - KNEE_R[0], ANKLE_R[1] - KNEE_R[1]);
const REST_TH_L = Math.atan2(KNEE_L[1] - HIP_L[1], KNEE_L[0] - HIP_L[0]);
const REST_SH_L = Math.atan2(ANKLE_L[1] - KNEE_L[1], ANKLE_L[0] - KNEE_L[0]);
const REST_TH_R = Math.atan2(KNEE_R[1] - HIP_R[1], KNEE_R[0] - HIP_R[0]);
const REST_SH_R = Math.atan2(ANKLE_R[1] - KNEE_R[1], ANKLE_R[0] - KNEE_R[0]);
const GROUND_Y = 875;  // 足を接地させる画像Y(rest足首885より少し上=膝に余裕)
const STEP = 100;      // 接地中に足が後退する水平距離(画像px)。脚短縮版
const LIFT = 50;       // 遊脚中の足の持ち上げ高さ(画像px)→ 膝の畳み量を決める
const BULGE_K = 0.9;   // 関節バルジ: 曲げ量に応じて脚を太らせる係数(膝でピーク)

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

export function SpriteRigPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(true);
  const signRef = useRef(1);
  const bonesRef = useRef(false);
  const legModeRef = useRef<"mesh" | "mix" | "cutout">("mesh");
  const ikRef = useRef(true);
  const skinRef = useRef(true);
  const bulgeRef = useRef(true);
  const armModeRef = useRef<"cutout" | "mix">("cutout");
  const facingRef = useRef<"left" | "right">("left");
  const applyFacingRef = useRef<((f: "left" | "right") => void) | null>(null);
  const [playing, setPlaying] = useState(true);
  const [sign, setSign] = useState(1);
  const [showBones, setShowBones] = useState(false);
  const [legMode, setLegMode] = useState<"mesh" | "mix" | "cutout">("mesh");
  const [ikMode, setIkMode] = useState(true);
  const [skinMode, setSkinMode] = useState(true);
  const [bulgeMode, setBulgeMode] = useState(true);
  const [armMode, setArmMode] = useState<"cutout" | "mix">("cutout");
  const [facing, setFacing] = useState<"left" | "right">("left");
  const [status, setStatus] = useState("読込中…");
  playingRef.current = playing;
  signRef.current = sign;
  bonesRef.current = showBones;
  legModeRef.current = legMode;
  ikRef.current = ikMode;
  skinRef.current = skinMode;
  bulgeRef.current = bulgeMode;
  armModeRef.current = armMode;
  facingRef.current = facing;
  const LEG_LABEL = { mesh: "単一メッシュ", mix: "ミックス(剛体+継ぎ目/左右分離)", cutout: "剛体カットアウト" } as const;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      await withPixiInitLock(() =>
        app.init({ width: 480, height: 660, background: "#eef1f5", antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true }),
      );
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      const files = [...new Set([...BACK_LAYERS, ...FRONT_LAYERS].map((l) => l.file).concat(ARMS.map((p) => p.file), ["legwear.png", "footwear.png"]))];
      const texByFile = new Map<string, Texture>();
      try { await Promise.all(files.map(async (f) => texByFile.set(f, await Assets.load(`${DIR}/${f}`)))); }
      catch { setStatus("画像の読込に失敗"); return; }
      if (disposed) return;

      const S = 0.40;
      const root = new Container();
      root.scale.set(S);
      const hipCanvas: [number, number] = [240, 296];
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
      const HAIR_PIVOT: [number, number] = [641, 175]; // 髪の生え際(頭頂後ろ・新版)
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
      const gx0 = 548, gx1 = 680, gy0 = 480, gy1 = 890; // 静止時のズボン外接(rest・脚短縮clean版)
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
          // 重み: 上部=骨盤、膝でthigh/shin、中心帯で左右ブレンド(脚短縮clean版)
          const wP = 1 - smooth(530, 600, y); // ウエスト〜股上は静止
          const kT = smooth(670, 740, y); // 膝で太腿→脛
          const sL = 1 - smooth(584, 644, x); // x中心帯で左右脚をブレンド(midline=614)
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
        const isLeftMesh = xLo < 600; // legMixL=548, legMixR=614
        let k = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const x = xLo + (xHi - xLo) * (c / (cols - 1));
          const y = gy0 + (gy1 - gy0) * (r / (rows - 1));
          rA[k * 2] = x; rA[k * 2 + 1] = y; uA[k * 2] = x / TEXW; uA[k * 2 + 1] = y / TEXW;
          const wP = 1 - smooth(530, 600, y);
          const kT = smooth(670, 740, y);
          // sL は y で振る舞いを変える:
          //  ・上半身(股付近): 左右脚をブレンド → midline の継ぎ目が出ない
          //  ・膝より下: 各メッシュは自分側の脚に振り切る → 足首が引かれて細くならない
          const sL_upper = 1 - smooth(584, 644, x);  // 緩やか(midline=614)
          const sL_lower = isLeftMesh ? 1 : 0;       // 自分側に固定
          const lowerY = smooth(640, 720, y);        // 0=股, 1=膝より下
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
      const legMixR = buildLegMesh(614, 680, 7);
      const legMixL = buildLegMesh(548, 614, 7);
      // 腕(backArm/upper) と同じ構造で脚の depth を出す。腕の規約と合わせて
      // texture-R(画像左向きでは画像右に見えるもの)が「前」、texture-L が「後」:
      //  ・legBack(深い z): legMixL(texture-L)
      //  ・legFront(浅い z): legMixR(texture-R)
      // 鏡反転で「画像右の前要素」が反対側に飛ぶので左右で違う半身が上に。
      const legBack = new Container(); root.addChild(legBack);
      const legFront = new Container();                          // upper の後で追加
      legBack.addChild(legMixL.mesh);
      legFront.addChild(legMixR.mesh);
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
      const tL = buildCut([548, 480, 65, 230], HIP_L, legCutout, HIP, "thighL", FK_THIGH_AMP);
      buildCut([553, 705, 50, 187], KNEE_L, tL, HIP_L, "shinL", FK_SHIN_AMP);
      const tR = buildCut([613, 480, 67, 228], HIP_R, legCutout, HIP, "thighR", FK_THIGH_AMP);
      buildCut([629, 705, 47, 187], KNEE_R, tR, HIP_R, "shinR", FK_SHIN_AMP);

      // 足(footwear)。実測 L_max=605(y=947)/R_min=601(y=975-979) なので、
      // 完全に非重複にするには boundary を x=600(L)と x=606(R)で挟む。x=601-605 の
      // 細いストリップ(主に底のmerged領域)は捨てる。
      const FOOT_L: Frame = [523, 875, 78, 119]; // 左靴のみ(x523-600)
      const FOOT_R: Frame = [606, 880, 72, 114]; // 右靴のみ(x606-677)
      // footL は texture-L = 奥側 → shoeBack へ。footR は texture-R = 手前側 → shoeFront へ。
      // 鏡反転で前/奥が自動的に正しい canvas 側に飛ぶ(legBack/legFront と同じ規約)。
      const shoeFront = new Container(); // upper の後で root に追加(z位置=手前脚の直前)
      const footL = new Container(); const fls = new Sprite(sub("footwear.png", FOOT_L)); fls.position.set(FOOT_L[0] - ANKLE_L[0], FOOT_L[1] - ANKLE_L[1]); footL.addChild(fls); shoeBack.addChild(footL);
      const footR = new Container(); const frs = new Sprite(sub("footwear.png", FOOT_R)); frs.position.set(FOOT_R[0] - ANKLE_R[0], FOOT_R[1] - ANKLE_R[1]); footR.addChild(frs); shoeFront.addChild(footR);

      // 3) 上半身(左腕=体の前 + 前面レイヤー)
      const upper = new Container();
      root.addChild(upper);
      upper.addChild(placed(FRONT_LAYERS[0]!)); // 上着
      for (const l of FRONT_LAYERS.slice(1)) upper.addChild(placed(l)); // 首・頭・顔…

      // 4) 手前靴レイヤー(upper の後・手前脚の前)。手前脚のトラウザ裾が手前靴の上端を覆う。
      root.addChild(shoeFront);
      // 5) 手前脚レイヤー: upper/shoeFront の後(=体の前面)。脚は y>437 なので頭/顔(y<227)とは
      //    重ならず、topwear のごく下端(~5px)にだけ少しかぶる程度の depth が出る。
      //    upper のlean/bobは継承させたくないので root の最後尾に。
      root.addChild(legFront);
      // 5) 手前腕レイヤー: 手前脚の更に前。lean/bobは upper と同じ挙動なので
      //    独立した frontArmCont を立てて、ticker で同じ rotation/position を適用。
      const frontArmCont = new Container();
      root.addChild(frontArmCont);
      buildArm("upperArmR", frontArmCont); buildArm("forearmR", frontArmCont);

      // 6) 腕ミックス用メッシュ(剛体+肘継ぎ目)。左右別メッシュ。bboxはhandwear texture内の
      //    各腕領域。重みは smoothstep で肘前後37pxバンド(~3行)、上下は剛体binary。
      //    upperArm/forearm の bone matrix を log-blend スキニング。
      type ArmMeshData = { rest: Float32Array; W: Float32Array; posBuf: ReturnType<MeshGeometry["getBuffer"]>; mesh: Mesh; nV: number; upperKey: BoneId; foreKey: BoneId; uppPivot: [number, number]; forPivot: [number, number] };
      const buildArmMesh = (bbox: [number, number, number, number], elbowY: number, upperKey: BoneId, foreKey: BoneId, uppPivot: [number, number], forPivot: [number, number]): ArmMeshData => {
        const [xLo, yLo, xHi, yHi] = bbox;
        const cols = 5, rows = 14, n = cols * rows;
        const rA = new Float32Array(n * 2), uA = new Float32Array(n * 2), pA = new Float32Array(n * 2);
        const WA = new Float32Array(n * 2); // 2 bones only(upperArm, forearm)
        let k = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const x = xLo + (xHi - xLo) * (c / (cols - 1));
          const y = yLo + (yHi - yLo) * (r / (rows - 1));
          rA[k * 2] = x; rA[k * 2 + 1] = y; uA[k * 2] = x / TEXW; uA[k * 2 + 1] = y / TEXW;
          // 肘前後 37px バンドで forearm 重みを smoothstep
          const wF = smooth(elbowY - 18.5, elbowY + 18.5, y);
          WA[k * 2] = 1 - wF; // upperArm
          WA[k * 2 + 1] = wF; // forearm
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
      // L腕(画像左=texture-L=奥側): bbox=[534,332,610,655], elbow y=493。bone駆動は upperArmL/forearmL。
      const armMeshL = buildArmMesh([534, 332, 610, 655], 493, "upperArmL", "forearmL", [572, 340], [555, 500]);
      // R腕(画像右=texture-R=手前側): bbox=[663,323,739,668], elbow y=495。
      const armMeshR = buildArmMesh([663, 323, 739, 668], 495, "upperArmR", "forearmR", [701, 332], [706, 502]);
      // 奥腕 mesh は backArm に、手前腕 mesh は frontArmCont に入れる(z順は腕と同じ)。
      backArm.addChild(armMeshL.mesh);
      frontArmCont.addChild(armMeshR.mesh);
      armMeshL.mesh.visible = false; armMeshR.mesh.visible = false;

      const bonesG = new Graphics();
      app.stage.addChild(bonesG);

      setStatus("");

      // 舞台用: facing 反転は scale.x のみ。チビ前向き体型は texture-L が見た目の右半身、
      // texture-R が見た目の左半身を担うため、鏡反転だけで前/奥の関係も z順も tint も
      // 自動的に正しく入れ替わる(texture-Rの「奥側」のtintは鏡で奥側に飛ぶ)。
      applyFacingRef.current = (newFacing: "left" | "right") => {
        root.scale.x = newFacing === "left" ? S : -S;
      };

      const walk = CLIP_WALK_GIRL;
      let t = 0;
      const bobK = 850 / 658; // 新版(身長短縮)に合わせて縮小
      // 後ろ髪フォロースルー用のバネ状態
      let hairAng = 0, hairVel = 0, prevBob = 0;

      // DEV: 位相を固定してキーポーズ単体を検証するためのスクラブフック
      const scrubRef = { current: null as number | null };
      if (import.meta.env.DEV) {
        (globalThis as unknown as { __rigScrub?: (v: number | null) => void }).__rigScrub = (v) => { scrubRef.current = v; };
      }

      app.ticker.add(() => {
        const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 15);
        if (scrubRef.current == null && playingRef.current) t += dt;
        const tt = scrubRef.current ?? t;
        const frame = sampleClip(walk, tt % walk.duration);
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
          const CROTCH_Y = 575, KNEE_Y = KNEE_L[1], ANK_Y = ANKLE_L[1];
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
                    const cX = (lw * 582 + rw * 652) / legW; // 新版の脚中心x(KNEE x)
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
            const Wupp = rotAbout(a.uppPivot[0], a.uppPivot[1], uA);
            const Wfor = mul(Wupp, rotAbout(a.forPivot[0], a.forPivot[1], fA));
            // log-blend(2ボーン): θ*=Σwθ, u*=Σwu, t*=A(θ*)·u*, p'=R(θ*)p+t*
            const bones = [Wupp, Wfor];
            const bTh: number[] = [], bUx: number[] = [], bUy: number[] = [];
            for (let b = 0; b < 2; b++) {
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
              for (let b = 0; b < 2; b++) { const w = a.W[v * 2 + b]!; if (w === 0) continue; th += w * bTh[b]!; ux += w * bUx[b]!; uy += w * bUy[b]!; }
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
        root.position.set(hipCanvas[0], hipCanvas[1]); // bobは各パーツ側で適用(足は接地固定)

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
          const wL = conts.get("forearmL")!.toGlobal({ x: -24, y: 155 }), wR = conts.get("forearmR")!.toGlobal({ x: -11, y: 155 });
          bonesG.moveTo(sh("upperArmL").x, sh("upperArmL").y).lineTo(sh("forearmL").x, sh("forearmL").y).lineTo(wL.x, wL.y);
          bonesG.moveTo(sh("upperArmR").x, sh("upperArmR").y).lineTo(sh("forearmR").x, sh("forearmR").y).lineTo(wR.x, wR.y);
          const neck = upper.toGlobal({ x: 0, y: -268 }), headTop = upper.toGlobal({ x: 0, y: -382 });
          bonesG.moveTo(hipC.x, hipC.y).lineTo(neck.x, neck.y).lineTo(headTop.x, headTop.y);
          bonesG.stroke({ width: 3, color: 0x3aa0ff, alpha: 0.9 });
          for (const p of [hipC, pHipL, pKL, pAL, pHipR, pKR, pAR, sh("upperArmL"), sh("forearmL"), wL, sh("upperArmR"), sh("forearmR"), wR, neck, headTop])
            bonesG.circle(p.x, p.y, 5).fill({ color: 0xff5a3a });
        }
      });
    })();

    return () => { disposed = true; if (app.renderer) app.destroy(true, { children: true }); };
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
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <button className="ui-btn" onClick={() => setPlaying((p) => !p)}>{playing ? "⏹ 停止" : "▶ 歩く"}</button>
        <button className="ui-btn" onClick={() => setLegMode((m) => (m === "mesh" ? "mix" : m === "mix" ? "cutout" : "mesh"))}>脚: {LEG_LABEL[legMode]}</button>
        <button className="ui-btn" onClick={() => setIkMode((m) => !m)}>接地: {ikMode ? "IK(地面固定)" : "FK(従来)"}</button>
        <button className="ui-btn" onClick={() => setSkinMode((m) => !m)}>スキン: {skinMode ? "対数ブレンド(自然)" : "LBS(線形=つぶれ)"}</button>
        <button className="ui-btn" onClick={() => setBulgeMode((m) => !m)}>関節: {bulgeMode ? "膨らむ(バルジ)" : "通常"}</button>
        <button className="ui-btn" onClick={() => setArmMode((m) => m === "cutout" ? "mix" : "cutout")}>腕: {armMode === "cutout" ? "剛体カットアウト" : "ミックス(剛体+肘継ぎ目)"}</button>
        <button className="ui-btn" onClick={() => setShowBones((b) => !b)}>{showBones ? "🦴 ボーン非表示" : "🦴 ボーン表示"}</button>
        <button className="ui-btn" onClick={() => setSign((s) => -s)}>脚の振り反転(現在 {sign > 0 ? "+" : "−"})</button>
        <button className="ui-btn" onClick={() => setFacing((f) => f === "left" ? "right" : "left")}>舞台: {facing === "left" ? "← 左向き" : "右向き →"}</button>
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
                    <img src={`${DIR}/${r.file.replace(".png", "_thumb.png")}`} alt={r.jp} style={{ width: 40, height: 40, objectFit: "contain", background: "#dfe4ea", borderRadius: "3px", display: "block" }} />
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
