import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { withPixiInitLock } from "../../render/pixi-init-lock.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { CLIPS } from "../../presets/clips/index.js";
import type { BoneId } from "../../runtime/skeleton.js";

// See-through(Single-image Layer Decomposition for Anime Characters / SIGGRAPH 2026)の
// 出力を、ツール深度のz順で個別レイヤー描画。脚・腕を関節分割して歩行クリップで駆動。
// - つけね(hip)は腰でなく股(クロッチ)の高さに置く → 振っても股が割れない。上は骨盤で静止カバー
// - 腕も上腕/前腕に分割(マスク中心線から肩/肘/手首を実測)
const DIR = "/assets/characters/seethrough-girl";
const HIP: [number, number] = [620, 469];

type Frame = [number, number, number, number];

interface Layer {
  jp: string;
  file: string;
  frame: Frame;
}
const BACK_LAYERS: Layer[] = [{ jp: "後ろ髪", file: "back_hair.png", frame: [532, 37, 228, 210] }];
// 前面・深度順(handwear は腕として関節分割するのでここには無い)
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

// 関節分割ピース。host=root(脚)/upper(腕)。pivot=関節(画像px・マスク実測)。amp=振り倍率
interface Piece {
  key: string;
  file: string;
  frame: Frame;
  pivot: [number, number];
  parent: string; // host名 or 他pieceのkey
  bone: BoneId | null;
  amp?: number;
}

// 脚: つけねを股(y≈545)へ下げ、左右を中心寄せ。膝/足首は脚の中心線実測
const LEGS: Piece[] = [
  { key: "thighL", file: "legwear.png", frame: [522, 528, 112, 262], pivot: [598, 545], parent: "root", bone: "thighR", amp: 0.5 },
  { key: "shinL", file: "legwear.png", frame: [536, 786, 116, 305], pivot: [580, 782], parent: "thighL", bone: "shinR", amp: 0.5 },
  { key: "footL", file: "footwear.png", frame: [503, 1073, 142, 138], pivot: [588, 1082], parent: "shinL", bone: null },
  { key: "thighR", file: "legwear.png", frame: [610, 528, 112, 262], pivot: [646, 545], parent: "root", bone: "thighL", amp: 0.5 },
  { key: "shinR", file: "legwear.png", frame: [612, 786, 112, 305], pivot: [668, 782], parent: "thighR", bone: "shinL", amp: 0.5 },
  { key: "footR", file: "footwear.png", frame: [598, 1073, 112, 138], pivot: [660, 1082], parent: "shinR", bone: null },
];
// 股カバー(legwear上部=ウエスト+股。静止。脚の上端を隠す)。z=脚の前
const PELVIS: Layer = { jp: "骨盤(股)", file: "legwear.png", frame: [496, 435, 248, 138] };

// 腕: 肩/肘/手首を実測。上着の後ろ(深度順)
const ARMS: Piece[] = [
  { key: "upperArmL", file: "handwear.png", frame: [503, 266, 96, 206], pivot: [583, 282], parent: "upper", bone: "upperArmR", amp: 0.8 },
  { key: "forearmL", file: "handwear.png", frame: [503, 452, 86, 206], pivot: [561, 458], parent: "upperArmL", bone: "forearmR", amp: 0.8 },
  { key: "upperArmR", file: "handwear.png", frame: [686, 266, 94, 208], pivot: [716, 284], parent: "upper", bone: "upperArmL", amp: 0.8 },
  { key: "forearmR", file: "handwear.png", frame: [686, 454, 92, 204], pivot: [716, 466], parent: "upperArmR", bone: "forearmL", amp: 0.8 },
];

const TABLE: { jp: string; file: string; bone: string }[] = [
  { jp: "後ろ髪", file: "back_hair.png", bone: "—(静止)" },
  { jp: "靴", file: "footwear.png", bone: "足L/R(脛に追従)" },
  { jp: "ズボン", file: "legwear.png", bone: "太腿L/R・脛L/R(股で接続)" },
  { jp: "腕(袖)", file: "handwear.png", bone: "上腕L/R・前腕L/R" },
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

export function SpriteRigPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(true);
  const signRef = useRef(-1);
  const bonesRef = useRef(false);
  const [playing, setPlaying] = useState(true);
  const [sign, setSign] = useState(-1);
  const [showBones, setShowBones] = useState(false);
  const [status, setStatus] = useState("読込中…");
  playingRef.current = playing;
  signRef.current = sign;
  bonesRef.current = showBones;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      await withPixiInitLock(() =>
        app.init({ width: 480, height: 660, background: "#eef1f5", antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true }),
      );
      if (disposed) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);

      const files = [...new Set(
        [...BACK_LAYERS, ...FRONT_LAYERS, PELVIS].map((l) => l.file).concat([...LEGS, ...ARMS].map((p) => p.file)),
      )];
      const texByFile = new Map<string, Texture>();
      try {
        await Promise.all(files.map(async (f) => texByFile.set(f, await Assets.load(`${DIR}/${f}`))));
      } catch {
        setStatus("画像の読込に失敗");
        return;
      }
      if (disposed) return;

      const S = 0.42;
      const root = new Container();
      root.scale.set(S);
      const hipCanvas: [number, number] = [240, 224];
      root.position.set(hipCanvas[0], hipCanvas[1]);
      app.stage.addChild(root);

      const sub = (file: string, f: Frame) =>
        new Texture({ source: texByFile.get(file)!.source, frame: new Rectangle(f[0], f[1], f[2], f[3]) });
      const placedSprite = (l: Layer) => {
        const spr = new Sprite(sub(l.file, l.frame));
        spr.position.set(l.frame[0] - HIP[0], l.frame[1] - HIP[1]);
        return spr;
      };

      // 関節分割ピース群を構築(host コンテナへ)
      const conts = new Map<string, Container>();
      const driven: { cont: Container; bone: BoneId; amp: number }[] = [];
      const buildPieces = (pieces: Piece[], hosts: Map<string, Container>, hostPivots: Map<string, [number, number]>) => {
        for (const p of pieces) hostPivots.set(p.key, p.pivot);
        for (const p of pieces) {
          const parentCont = hosts.get(p.parent) ?? conts.get(p.parent)!;
          const parentPivot = hostPivots.get(p.parent)!;
          const cont = new Container();
          cont.position.set(p.pivot[0] - parentPivot[0], p.pivot[1] - parentPivot[1]);
          const spr = new Sprite(sub(p.file, p.frame));
          spr.position.set(p.frame[0] - p.pivot[0], p.frame[1] - p.pivot[1]);
          cont.addChild(spr);
          parentCont.addChild(cont);
          conts.set(p.key, cont);
          if (p.bone) driven.push({ cont, bone: p.bone, amp: p.amp ?? 1 });
        }
      };

      // 1) 後ろ髪
      for (const l of BACK_LAYERS) root.addChild(placedSprite(l));
      // 2) 脚(関節分割)→ 骨盤カバー(脚の前)
      buildPieces(LEGS, new Map([["root", root]]), new Map([["root", HIP]]));
      root.addChild(placedSprite(PELVIS));
      // 3) 上半身(前面)。upper=胴の傾き。腕は upper の後ろ(上着の前に topwear を足すので腕→上着の順)
      const upper = new Container();
      root.addChild(upper);
      buildPieces(ARMS, new Map([["upper", upper]]), new Map([["upper", HIP]]));
      for (const l of FRONT_LAYERS) upper.addChild(placedSprite(l));

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
        for (const { cont, bone, amp } of driven) {
          cont.rotation = deg2rad(signRef.current * amp * (rot[bone] ?? 0));
        }
        upper.rotation = deg2rad(rot["torso"] ?? 0);
        root.position.set(hipCanvas[0], hipCanvas[1] + (frame.pose.rootOffset?.[1] ?? 0) * bobK * S);

        bonesG.visible = bonesRef.current;
        if (bonesRef.current) {
          bonesG.clear();
          const g = (k: string, x = 0, y = 0) => conts.get(k)!.toGlobal({ x, y });
          const hipC = root.toGlobal({ x: 0, y: 0 });
          // 脚
          const chain = (t0: string, k: string, a: string, ankle: [number, number]) => {
            const p0 = g(t0), p1 = g(k), p2 = conts.get(a)!.toGlobal({ x: ankle[0], y: ankle[1] });
            bonesG.moveTo(hipC.x, hipC.y).lineTo(p0.x, p0.y).lineTo(p1.x, p1.y).lineTo(p2.x, p2.y);
            return [p0, p1, p2];
          };
          const jl = chain("thighL", "shinL", "footL", [0, 0]);
          const jr = chain("thighR", "shinR", "footR", [0, 0]);
          // 腕(肩→肘→手首)。手首=前腕ローカルの末端
          const armJoints = (ua: string, fa: string, wristLocal: [number, number]) => {
            const s = g(ua), e = g(fa), w = conts.get(fa)!.toGlobal({ x: wristLocal[0], y: wristLocal[1] });
            bonesG.moveTo(s.x, s.y).lineTo(e.x, e.y).lineTo(w.x, w.y);
            return [s, e, w];
          };
          const al = armJoints("upperArmL", "forearmL", [-24, 178]);
          const ar = armJoints("upperArmR", "forearmR", [-11, 182]);
          // 背骨
          const neck = upper.toGlobal({ x: 0, y: -205 });
          const headTop = upper.toGlobal({ x: 0, y: -400 });
          bonesG.moveTo(hipC.x, hipC.y).lineTo(neck.x, neck.y).lineTo(headTop.x, headTop.y);
          bonesG.stroke({ width: 3, color: 0x3aa0ff, alpha: 0.9 });
          for (const p of [hipC, ...jl, ...jr, ...al, ...ar, neck, headTop]) {
            bonesG.circle(p.x, p.y, 5).fill({ color: 0xff5a3a });
          }
        }
      });
    })();

    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "16px", background: "var(--bg-app)", color: "var(--text)" }}>
      <div style={{ fontWeight: 700, marginBottom: "4px" }}>新キャラクター(See-through レイヤー + ボーン / 歩行テスト)</div>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px", maxWidth: "760px", lineHeight: 1.6 }}>
        See-through(SIGGRAPH 2026)出力を深度z順で個別レイヤー描画。脚・腕をマスク実測の関節で分割し歩行クリップで駆動。
        脚のつけねは股の高さに置き、上を骨盤で静止カバー(腰から割れない)。
        {status && <span style={{ color: "var(--warn)" }}> — {status}</span>}
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <button className="ui-btn" onClick={() => setPlaying((p) => !p)}>{playing ? "⏹ 停止" : "▶ 歩く"}</button>
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
                <th style={{ padding: "4px 6px" }}>z</th>
                <th style={{ padding: "4px 6px" }}>画像</th>
                <th style={{ padding: "4px 6px" }}>部位</th>
                <th style={{ padding: "4px 6px" }}>ボーン</th>
              </tr>
            </thead>
            <tbody>
              {TABLE.map((r, i) => (
                <tr key={r.file} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "3px 6px", color: "var(--text-dim)" }}>{i + 1}</td>
                  <td style={{ padding: "3px 6px" }}>
                    <img
                      src={`${DIR}/${r.file.replace(".png", "_thumb.png")}`}
                      alt={r.jp}
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
