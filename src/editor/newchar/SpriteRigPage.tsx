import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Mesh, MeshGeometry, Rectangle, Sprite, Texture } from "pixi.js";
import { withPixiInitLock } from "../../render/pixi-init-lock.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { CLIPS } from "../../presets/clips/index.js";
import type { BoneId } from "../../runtime/skeleton.js";

// See-through(SIGGRAPH 2026)出力を深度z順で個別レイヤー描画。
// 下半身(ズボン)は剛体カットアウトだと股で継ぎ目が出るため、1枚のメッシュを
// 骨盤+両脚にスキニング(線形ブレンド)して連続変形させる(継ぎ目が出ない)。
// 腕は剛体カットアウト、上半身は静止レイヤー。
const DIR = "/assets/characters/seethrough-girl";
const HIP: [number, number] = [620, 469];
const TEXW = 1280;

type Frame = [number, number, number, number];
interface Layer { jp: string; file: string; frame: Frame }
const BACK_LAYERS: Layer[] = [{ jp: "後ろ髪", file: "back_hair.png", frame: [532, 37, 228, 210] }];
const FRONT_LAYERS: Layer[] = [
  { jp: "上着", file: "topwear.png", frame: [552, 222, 172, 226] },
  { jp: "首", file: "neck.png", frame: [620, 196, 42, 69] },
  { jp: "頭", file: "head.png", frame: [557, 68, 140, 158] },
  { jp: "耳", file: "ears.png", frame: [664, 167, 33, 40] },
  { jp: "顔", file: "face.png", frame: [559, 76, 121, 150] },
  { jp: "口", file: "mouth.png", frame: [584, 199, 17, 9] },
  { jp: "白目", file: "eyewhite.png", frame: [565, 148, 79, 39] },
  { jp: "瞳", file: "irides.png", frame: [569, 151, 59, 36] },
  { jp: "睫毛", file: "eyelash.png", frame: [562, 141, 86, 36] },
  { jp: "眉", file: "eyebrow.png", frame: [569, 123, 74, 13] },
  { jp: "前髪", file: "front_hair.png", frame: [539, 54, 147, 178] },
];

// 腕(剛体)
interface Piece { key: string; file: string; frame: Frame; pivot: [number, number]; parent: string; bone: BoneId | null; amp?: number }
const ARMS: Piece[] = [
  { key: "upperArmL", file: "handwear.png", frame: [503, 266, 96, 206], pivot: [583, 282], parent: "upper", bone: "upperArmR", amp: 0.8 },
  { key: "forearmL", file: "handwear.png", frame: [503, 452, 86, 206], pivot: [561, 458], parent: "upperArmL", bone: "forearmR", amp: 0.8 },
  { key: "upperArmR", file: "handwear.png", frame: [686, 266, 94, 208], pivot: [716, 284], parent: "upper", bone: "upperArmL", amp: 0.8 },
  { key: "forearmR", file: "handwear.png", frame: [686, 454, 92, 204], pivot: [716, 466], parent: "upperArmR", bone: "forearmL", amp: 0.8 },
];

const TABLE: { jp: string; file: string; bone: string }[] = [
  { jp: "後ろ髪", file: "back_hair.png", bone: "—(静止)" },
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
const IDENT: Aff = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
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

// 脚の関節(実測)
const KNEE_L: [number, number] = [580, 782];
const KNEE_R: [number, number] = [668, 782];
const ANKLE_L: [number, number] = [582, 1085];
const ANKLE_R: [number, number] = [662, 1085];
const HIP_L: [number, number] = [598, 545];
const HIP_R: [number, number] = [646, 545];

export function SpriteRigPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(true);
  const signRef = useRef(-1);
  const bonesRef = useRef(false);
  const meshRef = useRef(true);
  const [playing, setPlaying] = useState(true);
  const [sign, setSign] = useState(-1);
  const [showBones, setShowBones] = useState(false);
  const [meshMode, setMeshMode] = useState(true);
  const [status, setStatus] = useState("読込中…");
  playingRef.current = playing;
  signRef.current = sign;
  bonesRef.current = showBones;
  meshRef.current = meshMode;

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
      const hipCanvas: [number, number] = [240, 212];
      root.position.set(hipCanvas[0], hipCanvas[1]);
      app.stage.addChild(root);

      const sub = (file: string, f: Frame) => new Texture({ source: texByFile.get(file)!.source, frame: new Rectangle(f[0], f[1], f[2], f[3]) });
      const placed = (l: Layer) => { const s = new Sprite(sub(l.file, l.frame)); s.position.set(l.frame[0] - HIP[0], l.frame[1] - HIP[1]); return s; };

      // 1) 後ろ髪
      for (const l of BACK_LAYERS) root.addChild(placed(l));

      // 2) 下半身メッシュ(ズボン全体を骨盤+両脚にスキニング)
      const COLS = 11, ROWS = 16;
      const gx0 = 520, gx1 = 720, gy0 = 437, gy1 = 1092; // 静止時のズボン外接(rest)
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
          // 重み: 上部=骨盤、膝でthigh/shin、中心帯で左右ブレンド
          const wP = 1 - smooth(500, 620, y); // ウエスト〜股上は静止
          const kT = smooth(720, 840, y); // 膝で太腿→脛
          const sL = 1 - smooth(590, 650, x); // x中心帯で左右脚をブレンド(股が連続)
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

      // 剛体カットアウト版の脚(比較トグル用)
      const legCutout = new Container();
      legCutout.visible = false;
      root.addChild(legCutout);
      const cutPieces: { cont: Container; bone: BoneId; pivot: [number, number]; amp: number }[] = [];
      const buildCut = (frame: Frame, pivot: [number, number], parentCont: Container, parentPivot: [number, number], bone: BoneId | null, amp = 0.5) => {
        const cont = new Container();
        cont.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1]);
        const s = new Sprite(sub("legwear.png", frame)); s.position.set(frame[0] - pivot[0], frame[1] - pivot[1]);
        cont.addChild(s); parentCont.addChild(cont);
        if (bone) cutPieces.push({ cont, bone, pivot, amp });
        return cont;
      };
      const tL = buildCut([522, 528, 112, 262], HIP_L, legCutout, HIP, "thighR");
      buildCut([536, 786, 116, 305], KNEE_L, tL, HIP_L, "shinR");
      const tR = buildCut([610, 528, 112, 262], HIP_R, legCutout, HIP, "thighL");
      buildCut([612, 786, 112, 305], KNEE_R, tR, HIP_R, "shinL");

      // 足(footwear・脛末端に追従)。2足は x=605 で完全分離 → 左右フレームを重ねず分割
      const FOOT_L: Frame = [504, 1072, 103, 126]; // 左靴のみ(x504-607)
      const FOOT_R: Frame = [607, 1074, 102, 138]; // 右靴のみ(x607-709)
      const footL = new Container(); const fls = new Sprite(sub("footwear.png", FOOT_L)); fls.position.set(FOOT_L[0] - ANKLE_L[0], FOOT_L[1] - ANKLE_L[1]); footL.addChild(fls); root.addChild(footL);
      const footR = new Container(); const frs = new Sprite(sub("footwear.png", FOOT_R)); frs.position.set(FOOT_R[0] - ANKLE_R[0], FOOT_R[1] - ANKLE_R[1]); footR.addChild(frs); root.addChild(footR);

      // 3) 上半身(腕=剛体 + 前面レイヤー)
      const upper = new Container();
      root.addChild(upper);
      const conts = new Map<string, Container>();
      const armDriven: { cont: Container; bone: BoneId; amp: number }[] = [];
      const pivots = new Map<string, [number, number]>([["upper", HIP]]);
      for (const p of ARMS) pivots.set(p.key, p.pivot);
      for (const p of ARMS) {
        const parentCont = p.parent === "upper" ? upper : conts.get(p.parent)!;
        const pp = pivots.get(p.parent)!;
        const cont = new Container(); cont.position.set(p.pivot[0] - pp[0], p.pivot[1] - pp[1]);
        const s = new Sprite(sub(p.file, p.frame)); s.position.set(p.frame[0] - p.pivot[0], p.frame[1] - p.pivot[1]);
        cont.addChild(s); parentCont.addChild(cont); conts.set(p.key, cont);
        if (p.bone) armDriven.push({ cont, bone: p.bone, amp: p.amp ?? 1 });
      }
      for (const l of FRONT_LAYERS) upper.addChild(placed(l));

      const bonesG = new Graphics();
      app.stage.addChild(bonesG);

      setStatus("");
      const walk = CLIPS["walk"]!;
      let t = 0;
      const bobK = 1185 / 658;

      app.ticker.add(() => {
        const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 15);
        if (playingRef.current) t += dt;
        const frame = sampleClip(walk, t % walk.duration);
        const rot = frame.pose.rotations ?? {};
        const sg = signRef.current;
        // 脚ボーンの world アフィン(rest空間)
        const thL = deg2rad(sg * 0.5 * (rot["thighR"] ?? 0));
        const shL = deg2rad(sg * 0.5 * (rot["shinR"] ?? 0));
        const thR = deg2rad(sg * 0.5 * (rot["thighL"] ?? 0));
        const shR = deg2rad(sg * 0.5 * (rot["shinL"] ?? 0));
        const WthighL = rotAbout(HIP_L[0], HIP_L[1], thL);
        const WshinL = mul(WthighL, rotAbout(KNEE_L[0], KNEE_L[1], shL));
        const WthighR = rotAbout(HIP_R[0], HIP_R[1], thR);
        const WshinR = mul(WthighR, rotAbout(KNEE_R[0], KNEE_R[1], shR));
        const bones = [IDENT, WthighL, WshinL, WthighR, WshinR];

        const useMesh = meshRef.current;
        legMesh.visible = useMesh;
        legCutout.visible = !useMesh;
        if (useMesh) {
          const pd = posBuf.data as Float32Array;
          for (let v = 0; v < nV; v++) {
            const rx = rest[v * 2]!, ry = rest[v * 2 + 1]!;
            let dx = 0, dy = 0;
            for (let b = 0; b < 5; b++) {
              const w = W[v * 5 + b]!; if (w === 0) continue;
              const M = bones[b]!;
              dx += w * ax(M, rx, ry); dy += w * ay(M, rx, ry);
            }
            pd[v * 2] = dx - HIP[0]; pd[v * 2 + 1] = dy - HIP[1];
          }
          posBuf.update();
        } else {
          for (const { cont, bone, amp } of cutPieces) cont.rotation = deg2rad(sg * amp * (rot[bone] ?? 0));
        }

        // 足を脛末端へ(メッシュ/剛体共通: shinのworldで)
        const placeFoot = (foot: Container, Wsh: Aff, ankle: [number, number]) => {
          foot.position.set(ax(Wsh, ankle[0], ankle[1]) - HIP[0], ay(Wsh, ankle[0], ankle[1]) - HIP[1]);
          foot.rotation = Math.atan2(Wsh.b, Wsh.a);
        };
        placeFoot(footL, WshinL, ANKLE_L);
        placeFoot(footR, WshinR, ANKLE_R);

        // 腕(剛体)
        for (const { cont, bone, amp } of armDriven) cont.rotation = deg2rad(sg * amp * (rot[bone] ?? 0));
        upper.rotation = deg2rad(rot["torso"] ?? 0);
        root.position.set(hipCanvas[0], hipCanvas[1] + (frame.pose.rootOffset?.[1] ?? 0) * bobK * S);

        bonesG.visible = bonesRef.current;
        if (bonesRef.current) {
          bonesG.clear();
          const g = (M: Aff, x: number, y: number) => root.toGlobal({ x: ax(M, x, y) - HIP[0], y: ay(M, x, y) - HIP[1] });
          const hipC = root.toGlobal({ x: 0, y: 0 });
          const pHipL = g(IDENT, HIP_L[0], HIP_L[1]), pKL = g(WthighL, KNEE_L[0], KNEE_L[1]), pAL = g(WshinL, ANKLE_L[0], ANKLE_L[1]);
          const pHipR = g(IDENT, HIP_R[0], HIP_R[1]), pKR = g(WthighR, KNEE_R[0], KNEE_R[1]), pAR = g(WshinR, ANKLE_R[0], ANKLE_R[1]);
          bonesG.moveTo(hipC.x, hipC.y).lineTo(pHipL.x, pHipL.y).lineTo(pKL.x, pKL.y).lineTo(pAL.x, pAL.y);
          bonesG.moveTo(hipC.x, hipC.y).lineTo(pHipR.x, pHipR.y).lineTo(pKR.x, pKR.y).lineTo(pAR.x, pAR.y);
          const sh = (k: string) => conts.get(k)!.toGlobal({ x: 0, y: 0 });
          const wL = conts.get("forearmL")!.toGlobal({ x: -24, y: 178 }), wR = conts.get("forearmR")!.toGlobal({ x: -11, y: 182 });
          bonesG.moveTo(sh("upperArmL").x, sh("upperArmL").y).lineTo(sh("forearmL").x, sh("forearmL").y).lineTo(wL.x, wL.y);
          bonesG.moveTo(sh("upperArmR").x, sh("upperArmR").y).lineTo(sh("forearmR").x, sh("forearmR").y).lineTo(wR.x, wR.y);
          const neck = upper.toGlobal({ x: 0, y: -205 }), headTop = upper.toGlobal({ x: 0, y: -400 });
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
        <button className="ui-btn" onClick={() => setMeshMode((m) => !m)}>脚: {meshMode ? "メッシュ変形" : "剛体カットアウト"}</button>
        <button className="ui-btn" onClick={() => setShowBones((b) => !b)}>{showBones ? "🦴 ボーン非表示" : "🦴 ボーン表示"}</button>
        <button className="ui-btn" onClick={() => setSign((s) => -s)}>脚の振り反転(現在 {sign > 0 ? "+" : "−"})</button>
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
