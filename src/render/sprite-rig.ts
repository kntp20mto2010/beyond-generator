// 新キャラ(スプライト合成)の動的リグ。SpriteRigPage.tsx の ticker 本体を
// React/Pixi-app/エディタUI から切り離して再利用可能にした移植版。
// シーン編集のメインステージ(SpriteCharacterView)で clip/表情/まばたき/口パクを駆動する。
//
// ページのデフォルト(脚=ミックス, 腕=ミックス, IK=off, log skin=on, バルジ=on)に固定。
// 向き反転は親(ElView コンテナ)の scale.x で行うため、ここでは sg=1 固定で内部反転しない。
import { Container, Mesh, MeshGeometry, Rectangle, Sprite, Texture } from "pixi.js";
import type { ClipDoc } from "../core/schema/clip.js";
import type { BoneId } from "../runtime/skeleton.js";
import { blendFrames, type ClipFrame, sampleClip } from "../runtime/clip-player.js";
import type { CharConfig, Frame, Layer } from "../editor/newchar/character-configs.js";
import { CLIP_WALK_GIRL } from "../editor/newchar/walk-girl.js";
import { CLIP_WAVE_RELAX } from "../editor/newchar/wave-relax.js";
import { CLIP_POINT_FWD } from "../editor/newchar/point-fwd.js";
import { CLIP_TALK_RELAX } from "../editor/newchar/talk-relax.js";
import { CLIP_SIT } from "../editor/newchar/sit.js";
import { CLIP_IDLE } from "../presets/clips/idle.js";

const TEXW = 1280;

// シーン側のクリップ名 → 新キャラ ClipDoc の解決表。scene-eval は名前だけ解決し、
// 実サンプリングはこの表を介してビューが行う(新キャラクリップは CLIPS 未登録のため)。
export const SPRITE_CLIPS: Record<string, ClipDoc | null> = {
  "walk-girl": CLIP_WALK_GIRL,
  idle: CLIP_IDLE,
  wave: CLIP_WAVE_RELAX,
  point: CLIP_POINT_FWD,
  talk: CLIP_TALK_RELAX,
  sit: CLIP_SIT,
  tpose: null,
};

export function lookupSpriteClip(id: string): ClipDoc | null {
  return id in SPRITE_CLIPS ? SPRITE_CLIPS[id]! : CLIP_IDLE;
}

// 喋りクリップ判定(口パク 4Hz を出すか)。
export function isTalkClip(id: string): boolean {
  return id === "talk";
}

// 表情 → 目の scale.y。null = 自動まばたきに任せる。
export type ExprKey = "normal" | "smile" | "surprise" | "worry";
const EXPRS: Record<ExprKey, number | null> = {
  normal: null,
  smile: 0.5,
  surprise: 1.2,
  worry: 0.8,
};
export function toExprKey(preset: string): ExprKey {
  return preset === "smile" || preset === "surprise" || preset === "worry" ? preset : "normal";
}

// --- 純粋ヘルパ(SpriteRigPage から移設) ---
const deg2rad = (d: number) => (d * Math.PI) / 180;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
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

const FK_THIGH_AMP = 0.3;
const FK_SHIN_AMP = 0.6;
const BULGE_K = 0.9;

const EMPTY_FRAME: ClipFrame = {
  pose: { rotations: {}, rootOffset: [0, 0] },
  handShape: "relax",
  virtualVelocity: 0,
};

type LegMeshData = { rest: Float32Array; W: Float32Array; posBuf: ReturnType<MeshGeometry["getBuffer"]>; mesh: Mesh; nV: number };
type ArmMeshData = { rest: Float32Array; W: Float32Array; posBuf: ReturnType<MeshGeometry["getBuffer"]>; mesh: Mesh; nV: number; uppPivot: [number, number]; forPivot: [number, number]; upperKey: BoneId; foreKey: BoneId };

export interface RigUpdate {
  clip: ClipDoc | null;
  localTime: number;       // クリップローカル秒(未ラップ)
  prevClip?: ClipDoc | null;
  prevLocalTime?: number;
  blend?: number;          // クロスフェード重み(1 or 未指定=ブレンド無し)
  expr: ExprKey;
  talk: boolean;           // true で口パク 4Hz
  dt: number;              // バネ/まばたき進行用(秒)
}

// 新キャラの動的リグ。container を親に addChild して使う。
// 全パーツは HIP 相対座標(原点=股)。外側スケールは呼び出し側が適用する。
export class SpriteRig {
  readonly container = new Container();
  readonly #cfg: CharConfig;

  // 駆動対象コンテナ
  #hairLeanCont!: Container;
  #hairHeadCont!: Container;
  #hairSwayCont!: Container;
  #backArm!: Container;
  #frontArmCont!: Container;
  #upper!: Container;
  #headCont!: Container;
  #mouthCont!: Container;
  #eyeCont!: Container;
  #footL!: Container;
  #footR!: Container;
  #legMixL!: LegMeshData;
  #legMixR!: LegMeshData;
  #armMeshL!: ArmMeshData;
  #armMeshR!: ArmMeshData;

  // cfg 由来の定数
  #HIP: [number, number];
  #HIP_L: [number, number];
  #HIP_R: [number, number];
  #KNEE_L: [number, number];
  #KNEE_R: [number, number];
  #ANKLE_L: [number, number];
  #ANKLE_R: [number, number];

  // バネ/まばたき状態
  #hairAng = 0;
  #hairVel = 0;
  #prevBob = 0;
  #blinkCooldown = 2.5 + Math.random() * 3;
  #blinkPhase = -1;

  constructor(cfg: CharConfig, texByFile: Map<string, Texture>) {
    this.#cfg = cfg;
    this.#HIP = cfg.hip;
    this.#HIP_L = cfg.hipL; this.#HIP_R = cfg.hipR;
    this.#KNEE_L = cfg.kneeL; this.#KNEE_R = cfg.kneeR;
    this.#ANKLE_L = cfg.ankleL; this.#ANKLE_R = cfg.ankleR;
    this.#build(texByFile);
  }

  #build(texByFile: Map<string, Texture>): void {
    const cfg = this.#cfg;
    const HIP = this.#HIP;
    const root = this.container;
    const sub = (file: string, f: Frame) =>
      new Texture({ source: texByFile.get(file)!.source, frame: new Rectangle(f[0], f[1], f[2], f[3]) });
    const placed = (l: Layer) => {
      const s = new Sprite(sub(l.file, l.frame));
      s.position.set(l.frame[0] - HIP[0], l.frame[1] - HIP[1]);
      return s;
    };

    const BACK_LAYERS = cfg.backLayers, FRONT_LAYERS = cfg.frontLayers, ARMS = cfg.arms;
    const HAIR_PIVOT = cfg.hairPivot;

    // 1) 後ろ髪(最奥)。lean → head nod → 毛先バネ の3段ネスト。
    const neckLayerForHair = FRONT_LAYERS.find((l) => l.file === "neck.png");
    const NECK_BASE_X = neckLayerForHair ? neckLayerForHair.frame[0] + neckLayerForHair.frame[2] / 2 - HIP[0] : 0;
    const NECK_BASE_Y = neckLayerForHair ? neckLayerForHair.frame[1] - HIP[1] : 0;
    const bh = BACK_LAYERS[0]!;
    const hairLeanCont = new Container();
    root.addChild(hairLeanCont);
    const hairHeadCont = new Container();
    hairHeadCont.pivot.set(NECK_BASE_X, NECK_BASE_Y);
    hairHeadCont.position.set(NECK_BASE_X, NECK_BASE_Y);
    hairLeanCont.addChild(hairHeadCont);
    const hairSwayCont = new Container();
    hairSwayCont.position.set(HAIR_PIVOT[0] - HIP[0], HAIR_PIVOT[1] - HIP[1]);
    hairHeadCont.addChild(hairSwayCont);
    const bhSprite = new Sprite(sub(bh.file, bh.frame));
    bhSprite.position.set(bh.frame[0] - HAIR_PIVOT[0], bh.frame[1] - HAIR_PIVOT[1]);
    hairSwayCont.addChild(bhSprite);
    this.#hairLeanCont = hairLeanCont;
    this.#hairHeadCont = hairHeadCont;
    this.#hairSwayCont = hairSwayCont;

    // 2) 奥腕(画像左)。後ろ髪のすぐ前・他すべての背面。腕メッシュを格納。
    const backArm = new Container();
    root.addChild(backArm);
    this.#backArm = backArm;

    // 3) 奥靴コンテナ。
    const shoeBack = new Container();
    root.addChild(shoeBack);

    // 4) 下半身ミックスメッシュ(脚ごとに分離、共有重みで継ぎ目なし)。
    const gx0 = cfg.meshGx0, gx1 = cfg.meshGx1, gy0 = cfg.meshGy0, gy1 = cfg.meshGy1;
    const ROWS = 16;
    const buildLegMesh = (xLo: number, xHi: number, cols: number): LegMeshData => {
      const rows = ROWS, n = cols * rows;
      const rA = new Float32Array(n * 2), uA = new Float32Array(n * 2), pA = new Float32Array(n * 2);
      const WA = new Float32Array(n * 5);
      const isLeftMesh = xLo < cfg.midline - 1;
      let k = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = xLo + (xHi - xLo) * (c / (cols - 1));
        const y = gy0 + (gy1 - gy0) * (r / (rows - 1));
        rA[k * 2] = x; rA[k * 2 + 1] = y; uA[k * 2] = x / TEXW; uA[k * 2 + 1] = y / TEXW;
        const wP = 1 - smooth(cfg.wPRange[0], cfg.wPRange[1], y);
        const kT = smooth(cfg.kTRange[0], cfg.kTRange[1], y);
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
    const legMixR = buildLegMesh(cfg.midline, gx1, 7);
    const legMixL = buildLegMesh(gx0, cfg.midline, 7);
    const legBack = new Container();
    root.addChild(legBack);
    legBack.addChild(legMixL.mesh);
    legBack.addChild(legMixR.mesh);
    this.#legMixL = legMixL; this.#legMixR = legMixR;

    // 5) 靴スプライト。footL=奥側→shoeBack, footR=手前側→shoeFront。
    const shoeFront = new Container();
    const footL = new Container();
    const fls = new Sprite(sub(cfg.footLFile, cfg.footLFrame));
    fls.position.set(cfg.footLFrame[0] - this.#ANKLE_L[0], cfg.footLFrame[1] - this.#ANKLE_L[1]);
    footL.addChild(fls); shoeBack.addChild(footL);
    const footR = new Container();
    const frs = new Sprite(sub(cfg.footRFile, cfg.footRFrame));
    frs.position.set(cfg.footRFrame[0] - this.#ANKLE_R[0], cfg.footRFrame[1] - this.#ANKLE_R[1]);
    footR.addChild(frs); shoeFront.addChild(footR);
    this.#footL = footL; this.#footR = footR;

    // 6) 上半身(上着 + 首)。頭/口/目 は headCont 内。
    const upper = new Container();
    root.addChild(upper);
    upper.addChild(placed(FRONT_LAYERS[0]!));
    const neckLayer = FRONT_LAYERS.find((l) => l.file === "neck.png");
    if (neckLayer) upper.addChild(placed(neckLayer));

    const headCont = new Container();
    if (neckLayer) {
      const hx = neckLayer.frame[0] + neckLayer.frame[2] / 2 - HIP[0];
      const hy = neckLayer.frame[1] - HIP[1];
      headCont.pivot.set(hx, hy);
      headCont.position.set(hx, hy);
    }
    upper.addChild(headCont);

    const mouthLayer = FRONT_LAYERS.find((l) => l.file === "mouth.png");
    const mouthCont = new Container();
    if (mouthLayer) {
      const mx = mouthLayer.frame[0] + mouthLayer.frame[2] / 2 - HIP[0];
      const my = mouthLayer.frame[1] - HIP[1];
      mouthCont.pivot.set(mx, my);
      mouthCont.position.set(mx, my);
    }

    const EYE_FILES = new Set(["eyewhite.png", "irides.png", "eyelash.png"]);
    const eyeWhite = FRONT_LAYERS.find((l) => l.file === "eyewhite.png");
    const eyeCont = new Container();
    if (eyeWhite) {
      const ex = eyeWhite.frame[0] + eyeWhite.frame[2] / 2 - HIP[0];
      const ey = eyeWhite.frame[1] + eyeWhite.frame[3] / 2 - HIP[1];
      eyeCont.pivot.set(ex, ey);
      eyeCont.position.set(ex, ey);
    }

    let eyeAttached = false, mouthAttached = false;
    const HEAD_SKIP = new Set(["topwear.png", "neck.png"]);
    for (const l of FRONT_LAYERS.slice(1)) {
      if (HEAD_SKIP.has(l.file)) continue;
      if (l.file === "mouth.png") {
        if (!mouthAttached) { headCont.addChild(mouthCont); mouthAttached = true; }
        mouthCont.addChild(placed(l));
      } else if (EYE_FILES.has(l.file)) {
        if (!eyeAttached) { headCont.addChild(eyeCont); eyeAttached = true; }
        eyeCont.addChild(placed(l));
      } else {
        headCont.addChild(placed(l));
      }
    }
    this.#upper = upper; this.#headCont = headCont;
    this.#mouthCont = mouthCont; this.#eyeCont = eyeCont;

    // 7) 手前靴 → 手前腕(画像右)。
    root.addChild(shoeFront);
    const frontArmCont = new Container();
    root.addChild(frontArmCont);
    this.#frontArmCont = frontArmCont;

    // 8) 腕ミックスメッシュ(rest=0, upperArm + 肘継ぎ目を log-blend)。
    const armPivL = ARMS.find((a) => a.key === "upperArmL")!.pivot;
    const forePivL = ARMS.find((a) => a.key === "forearmL")!.pivot;
    const armMeshL = this.#buildArmMesh(texByFile, cfg.armLBbox, cfg.elbowYL, "upperArmL", "forearmL", armPivL, forePivL);
    const armPivR = ARMS.find((a) => a.key === "upperArmR")!.pivot;
    const forePivR = ARMS.find((a) => a.key === "forearmR")!.pivot;
    const armMeshR = this.#buildArmMesh(texByFile, cfg.armRBbox, cfg.elbowYR, "upperArmR", "forearmR", armPivR, forePivR);
    backArm.addChild(armMeshL.mesh);
    frontArmCont.addChild(armMeshR.mesh);
    this.#armMeshL = armMeshL; this.#armMeshR = armMeshR;
  }

  #buildArmMesh(
    texByFile: Map<string, Texture>,
    bbox: [number, number, number, number], elbowY: number,
    upperKey: BoneId, foreKey: BoneId, uppPivot: [number, number], forPivot: [number, number],
  ): ArmMeshData {
    const [xLo, yLo, xHi, yHi] = bbox;
    const cols = 5, rows = 40, n = cols * rows;
    const rA = new Float32Array(n * 2), uA = new Float32Array(n * 2), pA = new Float32Array(n * 2);
    const WA = new Float32Array(n * 3);
    let k = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = xLo + (xHi - xLo) * (c / (cols - 1));
      const y = yLo + (yHi - yLo) * (r / (rows - 1));
      rA[k * 2] = x; rA[k * 2 + 1] = y; uA[k * 2] = x / TEXW; uA[k * 2 + 1] = y / TEXW;
      const wT = 0;
      const wF = smooth(elbowY - 18.5, elbowY + 18.5, y);
      const wU = Math.max(0, 1 - wT - wF);
      WA[k * 3] = wT; WA[k * 3 + 1] = wU; WA[k * 3 + 2] = wF;
      k++;
    }
    const ix: number[] = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c; ix.push(i, i + 1, i + cols, i + 1, i + cols + 1, i + cols);
    }
    for (let v = 0; v < n; v++) { pA[v * 2] = rA[v * 2]!; pA[v * 2 + 1] = rA[v * 2 + 1]!; }
    const g = new MeshGeometry({ positions: pA.slice(), uvs: uA, indices: new Uint32Array(ix) });
    const m = new Mesh({ geometry: g, texture: texByFile.get("handwear.png")! });
    return { rest: rA, W: WA, posBuf: g.getBuffer("aPosition"), mesh: m, nV: n, uppPivot, forPivot, upperKey, foreKey };
  }

  // 毎フレーム駆動。clip/localTime/expr/talk/dt から全パーツを変形する。
  update(u: RigUpdate): void {
    const cfg = this.#cfg;
    const HIP = this.#HIP;
    const HIP_L = this.#HIP_L, HIP_R = this.#HIP_R;
    const KNEE_L = this.#KNEE_L, KNEE_R = this.#KNEE_R;
    const ANKLE_L = this.#ANKLE_L, ANKLE_R = this.#ANKLE_R;
    const dt = u.dt;

    // sampleClip に生の localTime を渡す(loop=true は内部で wrap、loop=false は末尾保持)。
    // 着座など loop=false のワンショットを正しく一回再生し座り姿勢で止めるため。
    const base = u.clip ? sampleClip(u.clip, u.localTime) : EMPTY_FRAME;
    let frame = base;
    if (u.prevClip !== undefined && u.blend !== undefined && u.blend < 1) {
      const prev = u.prevClip ? sampleClip(u.prevClip, u.prevLocalTime ?? 0) : EMPTY_FRAME;
      frame = blendFrames(prev, base, u.blend);
    }
    const rot = (frame.pose.rotations ?? {}) as Record<string, number>;
    const bobImg = (frame.pose.rootOffset?.[1] ?? 0) * cfg.bobK;
    const transBob: Aff = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: bobImg };

    // 脚 FK(IK off): クリップの太腿/脛角を振幅として適用。
    const thL = deg2rad(FK_THIGH_AMP * (rot["thighL"] ?? 0));
    const shL = deg2rad(FK_SHIN_AMP * (rot["shinL"] ?? 0));
    const thR = deg2rad(FK_THIGH_AMP * (rot["thighR"] ?? 0));
    const shR = deg2rad(FK_SHIN_AMP * (rot["shinR"] ?? 0));
    const WthighL = mul(transBob, rotAbout(HIP_L[0], HIP_L[1], thL));
    const WshinL = mul(WthighL, rotAbout(KNEE_L[0], KNEE_L[1], shL));
    const WthighR = mul(transBob, rotAbout(HIP_R[0], HIP_R[1], thR));
    const WshinR = mul(WthighR, rotAbout(KNEE_R[0], KNEE_R[1], shR));

    // 対数(スクリュー)ブレンドスキニング + 関節バルジ。
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
    const absSh = [0, Math.abs(shL), Math.abs(shL), Math.abs(shR), Math.abs(shR)];
    const CROTCH_Y = cfg.crotchY, KNEE_Y = KNEE_L[1], ANK_Y = ANKLE_L[1];
    const skin = (restA: Float32Array, WA: Float32Array, pd: Float32Array, count: number) => {
      for (let v = 0; v < count; v++) {
        let rx = restA[v * 2]!; const ry = restA[v * 2 + 1]!;
        const lw = WA[v * 5 + 1]! + WA[v * 5 + 2]!, rw = WA[v * 5 + 3]! + WA[v * 5 + 4]!, legW = lw + rw;
        if (legW >= 1e-4) {
          const prof = ry <= KNEE_Y ? smooth(CROTCH_Y, KNEE_Y, ry) : 1 - smooth(KNEE_Y, ANK_Y, ry);
          if (prof > 0) {
            const bend = (lw * absSh[1]! + rw * absSh[3]!) / legW;
            const cX = (lw * cfg.legCenterLX + rw * cfg.legCenterRX) / legW;
            rx = cX + (rx - cX) * (1 + BULGE_K * prof * bend);
          }
        }
        let th = 0, ux = 0, uy = 0;
        for (let b = 0; b < 5; b++) { const w = WA[v * 5 + b]!; if (w === 0) continue; th += w * bTh[b]!; ux += w * bUx[b]!; uy += w * bUy[b]!; }
        let aC: number, bC: number;
        if (Math.abs(th) < 1e-6) { aC = 1; bC = 0; } else { aC = Math.sin(th) / th; bC = (1 - Math.cos(th)) / th; }
        const tx = aC * ux - bC * uy, ty = bC * ux + aC * uy, c = Math.cos(th), s = Math.sin(th);
        pd[v * 2] = (c * rx - s * ry + tx) - HIP[0]; pd[v * 2 + 1] = (s * rx + c * ry + ty) - HIP[1];
      }
    };
    skin(this.#legMixL.rest, this.#legMixL.W, this.#legMixL.posBuf.data as Float32Array, this.#legMixL.nV);
    this.#legMixL.posBuf.update();
    skin(this.#legMixR.rest, this.#legMixR.W, this.#legMixR.posBuf.data as Float32Array, this.#legMixR.nV);
    this.#legMixR.posBuf.update();

    // 足を脛末端へ。IK off なので接地ウェイト w=0(脛追従)+ 足首ピッチを重ねる。
    const placeFoot = (foot: Container, Wsh: Aff, ankle: [number, number], ankleDeg: number) => {
      foot.position.set(ax(Wsh, ankle[0], ankle[1]) - HIP[0], ay(Wsh, ankle[0], ankle[1]) - HIP[1]);
      foot.rotation = Math.atan2(Wsh.b, Wsh.a) + deg2rad(ankleDeg);
    };
    placeFoot(this.#footL, WshinL, ANKLE_L, rot["ankleL"] ?? 0);
    placeFoot(this.#footR, WshinR, ANKLE_R, rot["ankleR"] ?? 0);

    // 腕ミックス: 各腕メッシュを 3 ボーン log-blend でスキニング。
    const skinArm = (a: ArmMeshData) => {
      const uA = deg2rad(rot[a.upperKey] ?? 0);
      const fA = deg2rad(rot[a.foreKey] ?? 0);
      const Wrest: Aff = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
      const Wupp = rotAbout(a.uppPivot[0], a.uppPivot[1], uA);
      const Wfor = mul(Wupp, rotAbout(a.forPivot[0], a.forPivot[1], fA));
      const bones = [Wrest, Wupp, Wfor];
      const aTh: number[] = [], aUx: number[] = [], aUy: number[] = [];
      for (let b = 0; b < 3; b++) {
        const M = bones[b]!;
        let th = Math.atan2(M.b, M.a);
        // atan2 の ±π ラップ対策: Wupp を基準に Wfor を ±2π 補正して連続化(肘の折れ防止)。
        if (b > 1 && aTh[1] != null) {
          while (th - aTh[1]! > Math.PI) th -= 2 * Math.PI;
          while (th - aTh[1]! < -Math.PI) th += 2 * Math.PI;
        }
        let aC: number, bC: number;
        if (Math.abs(th) < 1e-6) { aC = 1; bC = 0; }
        else { aC = Math.sin(th) / th; bC = (1 - Math.cos(th)) / th; }
        const den = aC * aC + bC * bC;
        aTh[b] = th; aUx[b] = (aC * M.tx + bC * M.ty) / den; aUy[b] = (-bC * M.tx + aC * M.ty) / den;
      }
      const pd = a.posBuf.data as Float32Array;
      for (let v = 0; v < a.nV; v++) {
        const rx = a.rest[v * 2]!, ry = a.rest[v * 2 + 1]!;
        let th = 0, ux = 0, uy = 0;
        for (let b = 0; b < 3; b++) { const w = a.W[v * 3 + b]!; if (w === 0) continue; th += w * aTh[b]!; ux += w * aUx[b]!; uy += w * aUy[b]!; }
        let aC: number, bC: number;
        if (Math.abs(th) < 1e-6) { aC = 1; bC = 0; } else { aC = Math.sin(th) / th; bC = (1 - Math.cos(th)) / th; }
        const tx = aC * ux - bC * uy, ty = bC * ux + aC * uy, c = Math.cos(th), s = Math.sin(th);
        pd[v * 2] = (c * rx - s * ry + tx) - HIP[0];
        pd[v * 2 + 1] = (s * rx + c * ry + ty) - HIP[1];
      }
      a.posBuf.update();
    };
    skinArm(this.#armMeshL);
    skinArm(this.#armMeshR);

    // 上体の前傾 + 腰の上下動(bob)。上半身/腕/後ろ髪が一緒に上下(足は接地固定)。
    const lean = deg2rad(rot["torso"] ?? 0);
    this.#upper.rotation = lean; this.#upper.position.y = bobImg;
    this.#backArm.rotation = lean; this.#backArm.position.y = bobImg;
    this.#frontArmCont.rotation = lean; this.#frontArmCont.position.y = bobImg;

    // 後ろ髪: 前傾追従 + 毛先バネ。
    this.#hairLeanCont.rotation = lean; this.#hairLeanCont.position.y = bobImg;
    const bob = frame.pose.rootOffset?.[1] ?? 0;
    const bobVel = dt > 0 ? (bob - this.#prevBob) / dt : 0;
    this.#prevBob = bob;
    const hairTarget = -lean * 0.3 + Math.max(-0.07, Math.min(0.07, bobVel * 0.0018));
    this.#hairVel += ((hairTarget - this.#hairAng) * 80 - this.#hairVel * 16) * dt;
    this.#hairAng += this.#hairVel * dt;
    this.#hairSwayCont.rotation = this.#hairAng;

    // 頭のうなずき: head ボーンを首付け根 pivot で headCont/hairHeadCont に適用。
    const headRot = deg2rad(rot["head"] ?? 0);
    this.#headCont.rotation = headRot;
    this.#hairHeadCont.rotation = headRot;

    // 口パク: talk のとき 4Hz で scale.y を 1.0↔4.0 に伸ばす。
    if (u.talk) {
      const phase = (u.localTime * 4) % 1;
      this.#mouthCont.scale.y = 1.0 + 3.0 * 0.5 * (1 - Math.cos(2 * Math.PI * phase));
    } else {
      this.#mouthCont.scale.y = 1.0;
    }

    // まばたき(自動) + 表情の目開閉。表情指定があればまばたきより優先。
    if (this.#blinkPhase < 0) {
      this.#blinkCooldown -= dt;
      if (this.#blinkCooldown <= 0) this.#blinkPhase = 0;
    } else {
      this.#blinkPhase += dt / 0.15;
      if (this.#blinkPhase >= 1) { this.#blinkPhase = -1; this.#blinkCooldown = 2.5 + Math.random() * 3; }
    }
    let sY = 1;
    if (this.#blinkPhase >= 0) {
      if (this.#blinkPhase < 0.33) sY = 1 - (this.#blinkPhase / 0.33) * 0.9;
      else if (this.#blinkPhase < 0.55) sY = 0.1;
      else sY = 0.1 + ((this.#blinkPhase - 0.55) / 0.45) * 0.9;
    }
    const exprScale = EXPRS[u.expr];
    this.#eyeCont.scale.y = exprScale ?? sY;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
