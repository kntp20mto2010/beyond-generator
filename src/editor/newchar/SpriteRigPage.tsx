import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { withPixiInitLock } from "../../render/pixi-init-lock.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { CLIPS } from "../../presets/clips/index.js";
import type { BoneId } from "../../runtime/skeleton.js";

// see-through 成果物(パーツ分離した一枚絵)を切り出してボーンを仕込み、
// 既存の歩行クリップで動かすテスト。意味レイヤー(上着/ズボン)を関節単位に
// 後スライスして、太腿+脛をhip/kneeで振る cutout 方式。

const SRC = "/assets/characters/seethrough-girl/girl.png";

// 画像px(1280キャンバス)で測った関節・パーツ領域。alpha>=200 実測:
// 頭y68-225 / 首197-264 / 胴(袖含む)222-648 / 腰~450 / 脚438-1085(膝~765) / 足1077-1205 / 中心x~620
interface Piece {
  name: string;
  frame: [number, number, number, number]; // x,y,w,h(画像px)
  pivot: [number, number]; // 関節(画像px)
  parent: string; // "root" か他pieceのname
  bone?: BoneId; // 駆動する歩行クリップのボーン回転
}

const HIP: [number, number] = [620, 450];
const PIECES: Piece[] = [
  // 上半身(頭+髪+セーター+腕)を1枚の剛体に。torso のわずかな傾きのみ
  { name: "upperBody", frame: [448, 14, 352, 600], pivot: HIP, parent: "root", bone: "torso" },
  // 脚A(画像左 x<620)= thighR/shinR
  { name: "thighA", frame: [528, 444, 100, 326], pivot: [583, 448], parent: "root", bone: "thighR" },
  { name: "shinA", frame: [500, 764, 132, 452], pivot: [579, 766], parent: "thighA", bone: "shinR" },
  // 脚B(画像右 x>620)= thighL/shinL
  { name: "thighB", frame: [612, 444, 100, 326], pivot: [659, 448], parent: "root", bone: "thighL" },
  { name: "shinB", frame: [606, 764, 130, 452], pivot: [663, 766], parent: "thighB", bone: "shinL" },
];

const deg2rad = (d: number) => (d * Math.PI) / 180;

export function SpriteRigPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(true);
  const signRef = useRef(1); // 脚の回転符号(視覚調整用)
  const [playing, setPlaying] = useState(true);
  const [sign, setSign] = useState(1);
  const [status, setStatus] = useState("読込中…");
  playingRef.current = playing;
  signRef.current = sign;

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

      const S = 0.47; // 画像px → キャンバス
      const root = new Container();
      root.scale.set(S);
      const hipCanvas: [number, number] = [260, 250];
      root.position.set(hipCanvas[0], hipCanvas[1]);
      app.stage.addChild(root);

      const conts = new Map<string, Container>();
      const driven: { cont: Container; bone: BoneId }[] = [];

      // 親pivotを引くため二段で構築(PIECESは親が先に来る順)
      const pivotOf = new Map<string, [number, number]>();
      pivotOf.set("root", HIP);
      for (const p of PIECES) pivotOf.set(p.name, p.pivot);

      for (const p of PIECES) {
        const parentCont = p.parent === "root" ? root : conts.get(p.parent)!;
        const parentPivot = pivotOf.get(p.parent)!;
        const cont = new Container();
        // 自分のpivotを親pivot基準に配置(画像px。親がscale済なのでここは素のpx)
        cont.position.set(p.pivot[0] - parentPivot[0], p.pivot[1] - parentPivot[1]);
        const [fx, fy, fw, fh] = p.frame;
        const sub = new Texture({ source: tex.source, frame: new Rectangle(fx, fy, fw, fh) });
        const spr = new Sprite(sub);
        // frame左上を pivot 基準へ
        spr.position.set(fx - p.pivot[0], fy - p.pivot[1]);
        cont.addChild(spr);
        parentCont.addChild(cont);
        conts.set(p.name, cont);
        if (p.bone) driven.push({ cont, bone: p.bone });
      }

      setStatus("");
      const walk = CLIPS["walk"]!;
      let t = 0;
      const bobK = 1185 / 658; // 棒人間の身長→女の子身長の比でroot上下動を換算
      // 棒人間より脚が長く正面寄りなので、歩行クリップの脚回転を縮小(前後振りが横開きに見えるのを緩和)
      const LEG_AMP = 0.5;

      app.ticker.add(() => {
        const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 15);
        if (playingRef.current) t += dt;
        const tt = t % walk.duration;
        const frame = sampleClip(walk, tt);
        const rot = frame.pose.rotations ?? {};
        for (const { cont, bone } of driven) {
          const isLeg = bone !== "torso";
          const v = rot[bone] ?? 0;
          cont.rotation = deg2rad(isLeg ? signRef.current * LEG_AMP * v : v);
        }
        // 上下動(接地で低く)
        root.position.set(hipCanvas[0], hipCanvas[1] + (frame.pose.rootOffset?.[1] ?? 0) * bobK * S);
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
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px", maxWidth: "640px", lineHeight: 1.6 }}>
        パーツ分離した一枚絵を、脚を太腿/脛で切り分けて既存の歩行クリップで駆動するテスト。
        意味レイヤー(上着・ズボン)を関節単位に後スライスしている。{status && <span style={{ color: "var(--warn)" }}> — {status}</span>}
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
        <button className="ui-btn" onClick={() => setPlaying((p) => !p)}>{playing ? "⏹ 停止" : "▶ 歩く"}</button>
        <button className="ui-btn" onClick={() => setSign((s) => -s)}>脚の振り反転(現在 {sign > 0 ? "+" : "−"})</button>
      </div>
      <div ref={hostRef} style={{ width: 520, height: 680, boxShadow: "0 1px 6px rgba(0,0,0,0.3)", background: "#eef1f5", borderRadius: "6px" }} />
    </div>
  );
}
