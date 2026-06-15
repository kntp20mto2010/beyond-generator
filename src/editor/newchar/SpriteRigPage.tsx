import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { withPixiInitLock } from "../../render/pixi-init-lock.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { CLIPS } from "../../presets/clips/index.js";
import type { BoneId } from "../../runtime/skeleton.js";

// See-through(Single-image Layer Decomposition for Anime Characters / SIGGRAPH 2026)で
// 分解した一枚絵を、ツールの深度推定によるz順で個別レイヤー描画し、脚を関節分割して
// 既存の歩行クリップで動かすテスト。
// - z順: Marigold深度マップの平均深度で back→front を決定(本コードで実測)
// - 関節: legwear/footwear マスクの中心線から hip/knee/ankle を実測
const DIR = "/assets/characters/seethrough-girl";
const HIP: [number, number] = [620, 469]; // 股関節中心(画像px・実測)

type Frame = [number, number, number, number]; // x,y,w,h(画像px)

// 静止レイヤー(深度順)。bbox を frame に。
interface Layer {
  key: string;
  jp: string;
  file: string;
  frame: Frame;
  group: "back" | "front";
}
const BACK_LAYERS: Layer[] = [
  { key: "back_hair", jp: "後ろ髪", file: "back_hair.png", frame: [532, 37, 228, 210], group: "back" },
];
const FRONT_LAYERS: Layer[] = [
  { key: "handwear", jp: "腕(袖)", file: "handwear.png", frame: [508, 278, 259, 372], group: "front" },
  { key: "topwear", jp: "上着", file: "topwear.png", frame: [552, 222, 172, 226], group: "front" },
  { key: "neck", jp: "首", file: "neck.png", frame: [620, 196, 42, 69], group: "front" },
  { key: "head", jp: "頭", file: "head.png", frame: [557, 68, 140, 158], group: "front" },
  { key: "ears", jp: "耳", file: "ears.png", frame: [664, 167, 33, 40], group: "front" },
  { key: "face", jp: "顔", file: "face.png", frame: [559, 76, 121, 150], group: "front" },
  { key: "mouth", jp: "口", file: "mouth.png", frame: [584, 199, 17, 9], group: "front" },
  { key: "eyewhite", jp: "白目", file: "eyewhite.png", frame: [565, 148, 79, 39], group: "front" },
  { key: "irides", jp: "瞳", file: "irides.png", frame: [569, 151, 59, 36], group: "front" },
  { key: "eyelash", jp: "睫毛", file: "eyelash.png", frame: [562, 141, 86, 36], group: "front" },
  { key: "eyebrow", jp: "眉", file: "eyebrow.png", frame: [569, 123, 74, 13], group: "front" },
  { key: "front_hair", jp: "前髪", file: "front_hair.png", frame: [539, 54, 147, 178], group: "front" },
];

// 脚(legwear/footwear を関節分割)。pivot=関節(画像px・マスク中心線実測)
interface LegPiece {
  key: string;
  file: string;
  frame: Frame;
  pivot: [number, number];
  parent: "root" | string;
  bone: BoneId | null;
}
const LEG_PIECES: LegPiece[] = [
  // 股カバー(legwearの上部=ウエスト+股。静止して裂けを覆う)
  { key: "pelvis", file: "legwear.png", frame: [500, 437, 240, 116], pivot: HIP, parent: "root", bone: null },
  // 画像左の脚(x<620)= thighR/shinR
  { key: "thighL", file: "legwear.png", frame: [528, 551, 102, 236], pivot: [582, 470], parent: "root", bone: "thighR" },
  { key: "shinL", file: "legwear.png", frame: [538, 781, 114, 308], pivot: [580, 775], parent: "thighL", bone: "shinR" },
  { key: "footL", file: "footwear.png", frame: [503, 1073, 142, 138], pivot: [588, 1080], parent: "shinL", bone: null },
  // 画像右の脚(x>620)= thighL/shinL
  { key: "thighR", file: "legwear.png", frame: [610, 551, 106, 236], pivot: [665, 470], parent: "root", bone: "thighL" },
  { key: "shinR", file: "legwear.png", frame: [612, 781, 110, 308], pivot: [667, 775], parent: "thighR", bone: "shinL" },
  { key: "footR", file: "footwear.png", frame: [598, 1073, 112, 138], pivot: [660, 1080], parent: "shinR", bone: null },
];

// 横の対応表(z-index = 描画順 1=奥。深度マップ由来)
const TABLE: { jp: string; file: string; bone: string }[] = [
  { jp: "後ろ髪", file: "back_hair.png", bone: "—(静止)" },
  { jp: "靴", file: "footwear.png", bone: "足L/R(脛に追従)" },
  { jp: "ズボン", file: "legwear.png", bone: "太腿L/R・脛L/R" },
  { jp: "腕(袖)", file: "handwear.png", bone: "—(静止)" },
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

      const files = [...new Set([...BACK_LAYERS, ...FRONT_LAYERS].map((l) => l.file).concat(LEG_PIECES.map((p) => p.file)))];
      const texByFile = new Map<string, Texture>();
      try {
        await Promise.all(
          files.map(async (f) => {
            texByFile.set(f, await Assets.load(`${DIR}/${f}`));
          }),
        );
      } catch {
        setStatus("画像の読込に失敗");
        return;
      }
      if (disposed) return;

      const S = 0.42;
      const root = new Container();
      root.scale.set(S);
      const hipCanvas: [number, number] = [240, 232];
      root.position.set(hipCanvas[0], hipCanvas[1]);
      app.stage.addChild(root);

      const sub = (file: string, f: Frame) =>
        new Texture({ source: texByFile.get(file)!.source, frame: new Rectangle(f[0], f[1], f[2], f[3]) });

      // 全身レイヤーを HIP 基準の素スプライトで配置
      const layerSprite = (l: Layer) => {
        const spr = new Sprite(sub(l.file, l.frame));
        spr.position.set(l.frame[0] - HIP[0], l.frame[1] - HIP[1]);
        return spr;
      };

      // 1) 後ろ髪(最奥)
      for (const l of BACK_LAYERS) root.addChild(layerSprite(l));

      // 2) 脚グループ(関節分割。上着の後ろ=深度順)
      const conts = new Map<string, Container>();
      const pivotOf = new Map<string, [number, number]>([["root", HIP]]);
      for (const p of LEG_PIECES) pivotOf.set(p.key, p.pivot);
      const driven: { cont: Container; bone: BoneId }[] = [];
      for (const p of LEG_PIECES) {
        const parentCont = p.parent === "root" ? root : conts.get(p.parent)!;
        const parentPivot = pivotOf.get(p.parent)!;
        const cont = new Container();
        cont.position.set(p.pivot[0] - parentPivot[0], p.pivot[1] - parentPivot[1]);
        const spr = new Sprite(sub(p.file, p.frame));
        spr.position.set(p.frame[0] - p.pivot[0], p.frame[1] - p.pivot[1]);
        cont.addChild(spr);
        parentCont.addChild(cont);
        conts.set(p.key, cont);
        if (p.bone) driven.push({ cont, bone: p.bone });
      }

      // 3) 上半身レイヤー(前面・深度順。torsoのわずかな傾き)
      const upper = new Container();
      root.addChild(upper);
      for (const l of FRONT_LAYERS) upper.addChild(layerSprite(l));

      // ボーンオーバーレイ(最前面)
      const bonesG = new Graphics();
      app.stage.addChild(bonesG);

      setStatus("");
      const walk = CLIPS["walk"]!;
      let t = 0;
      const bobK = 1185 / 658;
      const LEG_AMP = 0.5;

      app.ticker.add(() => {
        const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 15);
        if (playingRef.current) t += dt;
        const frame = sampleClip(walk, t % walk.duration);
        const rot = frame.pose.rotations ?? {};
        for (const { cont, bone } of driven) {
          cont.rotation = deg2rad(signRef.current * LEG_AMP * (rot[bone] ?? 0));
        }
        upper.rotation = deg2rad(rot["torso"] ?? 0);
        root.position.set(hipCanvas[0], hipCanvas[1] + (frame.pose.rootOffset?.[1] ?? 0) * bobK * S);

        bonesG.visible = bonesRef.current;
        if (bonesRef.current) {
          bonesG.clear();
          const hipC = root.toGlobal({ x: 0, y: 0 });
          const tL = conts.get("thighL")!.toGlobal({ x: 0, y: 0 });
          const kL = conts.get("shinL")!.toGlobal({ x: 0, y: 0 });
          const aL = conts.get("footL")!.toGlobal({ x: 0, y: 0 });
          const tR = conts.get("thighR")!.toGlobal({ x: 0, y: 0 });
          const kR = conts.get("shinR")!.toGlobal({ x: 0, y: 0 });
          const aR = conts.get("footR")!.toGlobal({ x: 0, y: 0 });
          const neck = upper.toGlobal({ x: 0, y: -205 });
          const headTop = upper.toGlobal({ x: 0, y: -400 });
          bonesG.moveTo(hipC.x, hipC.y).lineTo(tL.x, tL.y).lineTo(kL.x, kL.y).lineTo(aL.x, aL.y);
          bonesG.moveTo(hipC.x, hipC.y).lineTo(tR.x, tR.y).lineTo(kR.x, kR.y).lineTo(aR.x, aR.y);
          bonesG.moveTo(hipC.x, hipC.y).lineTo(neck.x, neck.y).lineTo(headTop.x, headTop.y);
          bonesG.stroke({ width: 3, color: 0x3aa0ff, alpha: 0.9 });
          for (const p of [hipC, tL, kL, aL, tR, kR, aR, neck, headTop]) {
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
        See-through(SIGGRAPH 2026, 一枚絵レイヤー分解)の出力を、ツール深度推定のz順で個別レイヤー描画。
        脚は legwear/footwear マスクの中心線から関節を実測し、既存の歩行クリップで駆動。
        {status && <span style={{ color: "var(--warn)" }}> — {status}</span>}
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <button className="ui-btn" onClick={() => setPlaying((p) => !p)}>{playing ? "⏹ 停止" : "▶ 歩く"}</button>
        <button className="ui-btn" onClick={() => setShowBones((b) => !b)}>{showBones ? "🦴 ボーン非表示" : "🦴 ボーン表示"}</button>
        <button className="ui-btn" onClick={() => setSign((s) => -s)}>脚の振り反転(現在 {sign > 0 ? "+" : "−"})</button>
      </div>

      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div ref={hostRef} style={{ width: 480, height: 660, boxShadow: "0 1px 6px rgba(0,0,0,0.3)", background: "#eef1f5", borderRadius: "6px", flexShrink: 0 }} />

        {/* 横: 画像↔ボーン対応 + z-index(深度由来) */}
        <div style={{ minWidth: 320, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "6px" }}>レイヤー対応表(z = 描画順 1=最奥)</div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "8px" }}>
            z順は See-through の深度マップ(Marigold)の平均深度で算出。
          </div>
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
