import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { withPixiInitLock } from "../../render/pixi-init-lock.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { CLIPS } from "../../presets/clips/index.js";
import type { BoneId } from "../../runtime/skeleton.js";

// see-through 成果物(意味レイヤーで分離した一枚絵)を切り出してボーンを仕込み、
// 既存の歩行クリップで動かすテスト。
// 裂け対策: 胴+股のピース(torso)を脚の上に重ねて股の割れ目を覆い、脚は胴の下から出す。
// 腕は脚を覆わないよう左右別ピースにして脇に垂らす(歩行では静止)。

const SRC = "/assets/characters/seethrough-girl/girl.png";
const HIP: [number, number] = [620, 449]; // 画像px(1280)での股関節中心

// 脚(下層・root直下)。frame=[x,y,w,h], pivot=関節(画像px)
interface LegPiece {
  name: string;
  frame: [number, number, number, number];
  pivot: [number, number];
  parent: "root" | string;
  bone: BoneId;
}
const LEGS: LegPiece[] = [
  // 脚A(画像左 x<620)= thighR/shinR
  { name: "thighA", frame: [528, 448, 100, 322], pivot: [583, 448], parent: "root", bone: "thighR" },
  { name: "shinA", frame: [500, 764, 135, 458], pivot: [579, 766], parent: "thighA", bone: "shinR" },
  // 脚B(画像右 x>620)= thighL/shinL
  { name: "thighB", frame: [612, 448, 102, 322], pivot: [659, 448], parent: "root", bone: "thighL" },
  { name: "shinB", frame: [606, 764, 134, 458], pivot: [663, 766], parent: "thighB", bone: "shinL" },
];

// 上半身ピース(上層・upperコンテナ内・hip基準)。frame だけ持つ静止スプライト。
// torso が脚の上端(股)を覆う。配列順=z(後ろほど前面)
const UPPER: { name: string; frame: [number, number, number, number] }[] = [
  { name: "torso", frame: [534, 224, 178, 370] }, // 胴+ベルト+股(脚の裂け目を覆う y224-594)。脚は股下から出る
  { name: "armR", frame: [499, 258, 92, 402] }, // 画像左の袖(脇に垂れる)
  { name: "armL", frame: [690, 258, 88, 402] }, // 画像右の袖
  { name: "head", frame: [444, 10, 360, 256] }, // 頭+髪+首上
];

const deg2rad = (d: number) => (d * Math.PI) / 180;

export function SpriteRigPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(true);
  const signRef = useRef(-1); // 左向きに合わせ脚回転を反転(歩容の水平ミラー)
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
        app.init({ width: 520, height: 680, background: "#eef1f5", antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true }),
      );
      if (disposed) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);

      let tex: Texture;
      try {
        tex = await Assets.load(SRC);
      } catch {
        setStatus("画像の読込に失敗");
        return;
      }
      if (disposed) return;

      const S = 0.47;
      const root = new Container();
      root.scale.set(S);
      const hipCanvas: [number, number] = [260, 250];
      root.position.set(hipCanvas[0], hipCanvas[1]);
      app.stage.addChild(root);

      const sub = (f: [number, number, number, number]) =>
        new Texture({ source: tex.source, frame: new Rectangle(f[0], f[1], f[2], f[3]) });

      // --- 脚(下層) ---
      const conts = new Map<string, Container>();
      const pivotOf = new Map<string, [number, number]>([["root", HIP]]);
      for (const p of LEGS) pivotOf.set(p.name, p.pivot);
      const driven: { cont: Container; bone: BoneId }[] = [];
      for (const p of LEGS) {
        const parentCont = p.parent === "root" ? root : conts.get(p.parent)!;
        const parentPivot = pivotOf.get(p.parent)!;
        const cont = new Container();
        cont.position.set(p.pivot[0] - parentPivot[0], p.pivot[1] - parentPivot[1]);
        const spr = new Sprite(sub(p.frame));
        spr.position.set(p.frame[0] - p.pivot[0], p.frame[1] - p.pivot[1]);
        cont.addChild(spr);
        parentCont.addChild(cont);
        conts.set(p.name, cont);
        driven.push({ cont, bone: p.bone });
      }

      // --- 上半身(上層・torsoが股を覆う) ---
      const upper = new Container();
      root.addChild(upper); // 脚の後に追加 = 前面
      for (const u of UPPER) {
        const spr = new Sprite(sub(u.frame));
        spr.position.set(u.frame[0] - HIP[0], u.frame[1] - HIP[1]);
        upper.addChild(spr);
      }

      // --- ボーンオーバーレイ(最前面) ---
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

        // ボーン表示
        bonesG.visible = bonesRef.current;
        if (bonesRef.current) {
          bonesG.clear();
          const hipC = root.toGlobal({ x: 0, y: 0 });
          const tA = conts.get("thighA")!.toGlobal({ x: 0, y: 0 });
          const kA = conts.get("shinA")!.toGlobal({ x: 0, y: 0 });
          const aA = conts.get("shinA")!.toGlobal({ x: -4, y: 314 });
          const tB = conts.get("thighB")!.toGlobal({ x: 0, y: 0 });
          const kB = conts.get("shinB")!.toGlobal({ x: 0, y: 0 });
          const aB = conts.get("shinB")!.toGlobal({ x: -3, y: 314 });
          const neck = upper.toGlobal({ x: 0, y: -200 });
          const headTop = upper.toGlobal({ x: 0, y: -380 });
          // 骨
          bonesG.moveTo(hipC.x, hipC.y).lineTo(tA.x, tA.y).lineTo(kA.x, kA.y).lineTo(aA.x, aA.y);
          bonesG.moveTo(hipC.x, hipC.y).lineTo(tB.x, tB.y).lineTo(kB.x, kB.y).lineTo(aB.x, aB.y);
          bonesG.moveTo(hipC.x, hipC.y).lineTo(neck.x, neck.y).lineTo(headTop.x, headTop.y);
          bonesG.stroke({ width: 3, color: 0x3aa0ff, alpha: 0.9 });
          // 関節
          for (const p of [hipC, tA, kA, aA, tB, kB, aB, neck, headTop]) {
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
      <div style={{ fontWeight: 700, marginBottom: "4px" }}>新キャラクター(see-through スプライト + ボーン / 歩行テスト)</div>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px", maxWidth: "660px", lineHeight: 1.6 }}>
        パーツ分離した一枚絵を、脚を太腿/脛で切り分けて既存の歩行クリップで駆動。胴ピースを脚の上に重ねて股の裂けを覆う。
        {status && <span style={{ color: "var(--warn)" }}> — {status}</span>}
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <button className="ui-btn" onClick={() => setPlaying((p) => !p)}>{playing ? "⏹ 停止" : "▶ 歩く"}</button>
        <button className="ui-btn" onClick={() => setShowBones((b) => !b)}>{showBones ? "🦴 ボーン非表示" : "🦴 ボーン表示"}</button>
        <button className="ui-btn" onClick={() => setSign((s) => -s)}>脚の振り反転(現在 {sign > 0 ? "+" : "−"})</button>
      </div>
      <div ref={hostRef} style={{ width: 520, height: 680, boxShadow: "0 1px 6px rgba(0,0,0,0.3)", background: "#eef1f5", borderRadius: "6px" }} />
    </div>
  );
}
