import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { DocStore } from "../../core/doc-store.js";
import { PAPER_COLOR, type ProjectDoc, type SceneDoc } from "../../core/schema/project.js";
import { CharacterView } from "../../render/character-pixi.js";
import {
  evaluateScene,
  type CharResolver,
  type SceneFrameItem,
} from "../../runtime/scene-eval.js";
import type { Mat2D } from "../../runtime/mat2d.js";
import { ScenePhysicsPool } from "../../runtime/scene-physics.js";
import type { AssetResolver } from "../../io/asset-resolver.js";
import { updateElementTransform } from "../../core/commands-project.js";
import {
  STAGE_SCALE,
  VIEW_H,
  VIEW_W,
  screenToStage,
} from "./stage-coords.js";

export type PlayMode = "scene" | "all";

interface Props {
  store: DocStore<ProjectDoc>;
  resolver: AssetResolver;
  sceneId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: () => void;
  // 共有再生時刻。null = 非再生(scrub)
  tRef: React.MutableRefObject<number>;
  playMode: PlayMode | null;
  // 再生中に時刻をReactへ反映(throttle済み)
  onTime: (t: number) => void;
  // シーン末到達(all=次へ / scene=停止)
  onReachEnd: (mode: PlayMode) => void;
  // 物理を t=0 から再構築する合図
  seekNonce: number;
  // doc/asset変更で構造再評価を促す
  revision: number;
  resolverRev: number;
}

interface ElView {
  container: Container;
  charView?: CharacterView;
  text?: Text;
  placeholder?: { g: Graphics; label: Text };
}

export function StageCanvas(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  // ticker から最新propsを読むためのref
  const pRef = useRef(props);
  pRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      await app.init({
        width: VIEW_W,
        height: VIEW_H,
        background: PAPER_COLOR,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);

      const root = new Container();
      root.scale.set(STAGE_SCALE);
      app.stage.addChild(root);

      const bg = new Graphics();
      root.addChild(bg);

      // 背景画像(色レイヤの上・要素の下)。高さフィット+中央クロップ
      const bgImageLayer = new Container();
      root.addChild(bgImageLayer);
      let bgImgKey: string | null = null;
      const updateBgImage = (scene: SceneDoc | undefined) => {
        const img = scene?.background?.image ?? null;
        if (img === bgImgKey) return;
        bgImgKey = img;
        for (const c of bgImageLayer.removeChildren()) c.destroy();
        if (!img) return;
        const want = img;
        const imgEl = new Image();
        imgEl.onload = () => {
          if (disposed || bgImgKey !== want) return;
          const tex = Texture.from(imgEl);
          const s = Math.max(1920 / tex.width, 1080 / tex.height);
          const sp = new Sprite(tex);
          sp.scale.set(s);
          sp.position.set((1920 - tex.width * s) / 2, (1080 - tex.height * s) / 2);
          bgImageLayer.addChild(sp);
        };
        // 読込失敗時は背景色のみ(devサーバー外・未配置パス等)。onerrorは無視
        imgEl.src = encodeURI(`/${want}`);
      };

      const elLayer = new Container();
      root.addChild(elLayer);

      const selection = new Graphics();
      root.addChild(selection);

      const views = new Map<string, ElView>();
      const pool = new ScenePhysicsPool();
      let prevT = pRef.current.tRef.current;
      let lastSeekNonce = -1;
      let throttleAcc = 0;
      let lastFrame: SceneFrameItem[] = [];

      const p = () => pRef.current;
      const currentScene = (): SceneDoc | undefined =>
        p().store.doc.scenes.find((s) => s.id === p().sceneId);

      const resolver: CharResolver = {
        getCharacter: (ref) => pRef.current.resolver.getCharacter(ref),
      };

      // === ステージのドラッグ移動(累積デルタを開始transformに適用) ===
      const canvas = app.canvas;
      canvas.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        const p = pRef.current;
        const scene = p.store.doc.scenes.find((s) => s.id === p.sceneId);
        if (!scene) return;
        const rect = canvas.getBoundingClientRect();
        const sx = ((ev.clientX - rect.left) / rect.width) * VIEW_W;
        const sy = ((ev.clientY - rect.top) / rect.height) * VIEW_H;
        const [stageX, stageY] = screenToStage(sx, sy);

        // ヒットテスト: z降順で最初に当たった要素
        const frame = lastFrame;
        let hitId: string | null = null;
        for (let i = frame.length - 1; i >= 0; i--) {
          const item = frame[i]!;
          const view = views.get(item.elementId);
          if (!view) continue;
          const b = view.container.getBounds();
          // boundsはapp.stage座標。stage座標へ変換(/scale)
          const bx = b.x / STAGE_SCALE;
          const by = b.y / STAGE_SCALE;
          const bw = b.width / STAGE_SCALE;
          const bh = b.height / STAGE_SCALE;
          if (stageX >= bx && stageX <= bx + bw && stageY >= by && stageY <= by + bh) {
            hitId = item.elementId;
            break;
          }
        }
        p.onSelect(hitId);
        if (!hitId) return;

        const el = scene.elements.find((e) => e.id === hitId);
        if (!el) return;
        const startX = el.transform.x;
        const startY = el.transform.y;
        const startStageX = stageX;
        const startStageY = stageY;
        canvas.setPointerCapture(ev.pointerId);

        const onMove = (me: PointerEvent) => {
          const r = canvas.getBoundingClientRect();
          const mx = ((me.clientX - r.left) / r.width) * VIEW_W;
          const my = ((me.clientY - r.top) / r.height) * VIEW_H;
          const [gx, gy] = screenToStage(mx, my);
          updateElementTransform(p.store, scene.id, hitId!, {
            x: startX + (gx - startStageX),
            y: startY + (gy - startStageY),
          });
        };
        const onUp = () => {
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp);
        };
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
      });

      const collectDeforms = (scene: SceneDoc): Map<string, Map<string, Mat2D>> => {
        const map = new Map<string, Map<string, Mat2D>>();
        for (const el of scene.elements) {
          if (el.kind !== "character") continue;
          const d = pool.deforms(el.id);
          if (d) map.set(el.id, d);
        }
        return map;
      };

      const drawSelection = (frame: SceneFrameItem[]) => {
        selection.clear();
        const id = p().selectedId;
        if (!id) return;
        const item = frame.find((f) => f.elementId === id);
        const view = item ? views.get(id) : undefined;
        if (!view) return;
        const b = view.container.getBounds();
        const bx = b.x / STAGE_SCALE;
        const by = b.y / STAGE_SCALE;
        const bw = b.width / STAGE_SCALE;
        const bh = b.height / STAGE_SCALE;
        selection
          .rect(bx - 6, by - 6, bw + 12, bh + 12)
          .stroke({ color: 0x5b7db1, width: 3 });
      };

      const renderFrame = (scene: SceneDoc | undefined, t: number) => {
        bg.clear();
        const color = scene?.background?.color ?? PAPER_COLOR;
        bg.rect(0, 0, 1920, 1080).fill({ color });
        updateBgImage(scene);

        if (!scene) {
          for (const [, v] of views) v.container.destroy({ children: true });
          views.clear();
          selection.clear();
          lastFrame = [];
          return;
        }

        const frame = evaluateScene(p().store.doc, scene, t, resolver, {
          hairDeforms: collectDeforms(scene),
        });
        lastFrame = frame;

        const seen = new Set<string>();
        elLayer.removeChildren(); // z順を毎フレーム反映(要素数は少ない)

        for (const item of frame) {
          seen.add(item.elementId);
          let view = views.get(item.elementId);
          if (!view) {
            view = { container: new Container() };
            views.set(item.elementId, view);
          }
          applyItem(view, item);
          elLayer.addChild(view.container);
        }
        for (const [id, v] of [...views]) {
          if (!seen.has(id)) {
            v.container.destroy({ children: true });
            views.delete(id);
          }
        }

        drawSelection(frame);
      };

      app.ticker.add(() => {
        const cur = p();
        const scene = currentScene();
        const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 15);

        // 物理 seek の合図
        if (cur.seekNonce !== lastSeekNonce) {
          lastSeekNonce = cur.seekNonce;
          if (scene) pool.seek(cur.store.doc, scene, cur.tRef.current, resolver);
          prevT = cur.tRef.current;
        }

        if (cur.playMode && scene) {
          const t = cur.tRef.current + dt;
          if (t >= scene.duration) {
            cur.tRef.current = scene.duration;
            pool.advance(cur.store.doc, scene, prevT, scene.duration, resolver);
            prevT = scene.duration;
            renderFrame(scene, scene.duration);
            cur.onReachEnd(cur.playMode);
          } else {
            cur.tRef.current = t;
            pool.advance(cur.store.doc, scene, prevT, t, resolver);
            prevT = t;
            renderFrame(scene, t);
            throttleAcc += dt;
            if (throttleAcc >= 0.05) {
              throttleAcc = 0;
              cur.onTime(t);
            }
          }
        } else {
          // 非再生: 共有時刻で描画(scrub中も)
          prevT = cur.tRef.current;
          renderFrame(scene, cur.tRef.current);
        }
      });
    })();

    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
    // 初期化は一度だけ。状態は pRef 経由で読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      style={{
        width: VIEW_W,
        height: VIEW_H,
        touchAction: "none",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 要素の表示更新
// ---------------------------------------------------------------------------

function applyItem(view: ElView, item: SceneFrameItem): void {
  const c = view.container;
  const visual = item.visual;
  c.alpha = visual.alpha;

  if (item.payload.kind === "character") {
    if (!view.charView) {
      view.charView = new CharacterView();
      c.addChild(view.charView.container);
    }
    if (view.text) {
      view.text.destroy();
      view.text = undefined;
    }
    view.charView.update(item.payload.char, item.payload.items);
    const tf = item.payload.transform;
    const s = tf.scale * visual.scaleMul;
    c.position.set(tf.x + visual.offset[0], tf.y + visual.offset[1]);
    c.scale.set(item.payload.flipX ? -s : s, s);
  } else if (item.payload.kind === "text") {
    const el = item.payload.el;
    const stroke =
      el.strokeColor !== null
        ? { color: el.strokeColor, width: el.strokeWidth, join: "round" as const }
        : undefined;
    if (!view.text) {
      view.text = new Text({ text: el.text });
      view.text.anchor.set(0.5);
      c.addChild(view.text);
    }
    view.text.text = el.text;
    view.text.style = {
      fontFamily: "system-ui, sans-serif",
      fontSize: el.size,
      fill: el.color,
      ...(stroke ? { stroke } : {}),
      align: "center",
    };
    const tf = item.payload.transform;
    c.position.set(tf.x + visual.offset[0], tf.y + visual.offset[1]);
    c.scale.set(tf.scale * visual.scaleMul);
  } else {
    // placeholder
    const tf = item.payload.transform;
    if (!view.placeholder) {
      const g = new Graphics();
      const label = new Text({
        text: "未解決",
        style: { fontFamily: "system-ui", fontSize: 40, fill: "#888" },
      });
      label.anchor.set(0.5);
      c.addChild(g);
      c.addChild(label);
      view.placeholder = { g, label };
    }
    view.placeholder.g.clear();
    view.placeholder.g
      .rect(-120, -300, 240, 300)
      .fill({ color: 0xdddddd })
      .stroke({ color: 0x999999, width: 2 });
    view.placeholder.label.position.set(0, -150);
    c.position.set(tf.x + visual.offset[0], tf.y + visual.offset[1]);
    c.scale.set(tf.scale * visual.scaleMul);
  }
}
