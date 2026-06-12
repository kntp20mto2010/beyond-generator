import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { DocStore } from "../../core/doc-store.js";
import {
  PAPER_COLOR,
  type BalloonElement,
  type ProjectDoc,
  type SceneDoc,
} from "../../core/schema/project.js";
import { CharacterView } from "../../render/character-pixi.js";
import { drawBalloon } from "../../render/balloon.js";
import {
  evaluateCamera,
  evaluateScene,
  STAGE_H,
  STAGE_W,
  type CameraState,
  type CharResolver,
  type SceneFrameItem,
} from "../../runtime/scene-eval.js";
import type { Mat2D } from "../../runtime/mat2d.js";
import { ScenePhysicsPool } from "../../runtime/scene-physics.js";
import type { AssetResolver } from "../../io/asset-resolver.js";
import { setBalloonTail, updateElementTransform } from "../../core/commands-project.js";
import {
  STAGE_SCALE,
  VIEW_H,
  VIEW_W,
  screenToStage,
  stageToScreen,
} from "./stage-coords.js";
import { computeSnap, type Edges } from "./snap.js";
import { withPixiInitLock } from "../../render/pixi-init-lock.js";

const SNAP_THRESHOLD = 12;

export type PlayMode = "scene" | "all";

// ScenePage から Pixi bounds を参照するための命令的API(整列・カメラ寄せで使用)
export interface StageApi {
  // 要素のステージ座標bounds。{ l,r,t,b,cx,cy }。未描画なら null
  getStageEdges(elementId: string): Edges | null;
}

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
  // グリッド+セーフエリア常時表示
  showGrid: boolean;
  // カメラモード(ON中は要素ヒットテスト/ドラッグ/ホバー/ハンドルを無効化しカメラ枠を表示)
  cameraEdit: boolean;
  // 右クリックメニュー要求(clientX/Y, ステージ座標, 対象elementId | null)
  onContextMenu: (info: {
    clientX: number;
    clientY: number;
    stageX: number;
    stageY: number;
    elementId: string | null;
  }) => void;
  // キャラのダブルクリック → クイックアクションPopover要求
  onQuickAction: (info: { clientX: number; clientY: number; elementId: string }) => void;
  // カメラ枠ドラッグ確定(pointerup)。現在tでのキー更新/追加は ScenePage が担う
  onCameraCommit: (cam: CameraState) => void;
  // 整列用に Pixi bounds を公開する命令的API
  apiRef: React.MutableRefObject<StageApi | null>;
}

interface ElView {
  container: Container;
  charView?: CharacterView;
  text?: Text;
  balloon?: { g: Graphics; text: Text };
  placeholder?: { g: Graphics; label: Text };
}

// シーン境界トランジションの一時状態(snapshot方式)
interface TransitionState {
  sprite: Sprite;
  tex: Texture;
  mask: Graphics | null;
  type: "fade" | "wipe" | "slide";
  dur: number;
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
      await withPixiInitLock(() =>
        app.init({
          width: VIEW_W,
          height: VIEW_H,
          background: PAPER_COLOR,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        }),
      );
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
      // 表示中のキー = "パス|URL"。パスとURL有無の両方で再評価する
      let bgImgKey: string | null = null;
      const updateBgImage = (scene: SceneDoc | undefined) => {
        const path = scene?.background?.image ?? null;
        const url = path ? pRef.current.resolver.getImageUrl(path) : undefined;
        const key = path ? `${path}|${url ?? ""}` : null;
        if (key === bgImgKey) return;
        bgImgKey = key;
        for (const c of bgImageLayer.removeChildren()) c.destroy();
        // 未解決(URL未取得)の間はスキップ。解決後 resolverRev が変わり再試行される
        if (!path || !url) return;
        const want = key;
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
        imgEl.src = url;
      };

      // グリッド+セーフエリア(bgの上・要素の下、ステージ座標で描画)
      const gridLayer = new Graphics();
      root.addChild(gridLayer);

      const elLayer = new Container();
      root.addChild(elLayer);

      // 選択枠は app.stage 直下(zoomしても太さ一定、snapshotにも写らない)
      const selection = new Graphics();
      app.stage.addChild(selection);

      // スナップガイド線(app.stage直下、スクリーン座標)
      const guides = new Graphics();
      app.stage.addChild(guides);

      // ホバーハイライト(選択枠より下・スクリーン座標)
      const hover = new Graphics();
      app.stage.addChildAt(hover, app.stage.getChildIndex(selection));

      // カメラモードのオーバーレイ(最前面)
      const camOverlay = new Graphics();
      app.stage.addChild(camOverlay);

      // カメラ枠ドラッグ中のローカル値(確定はpointerup)。null=非ドラッグ
      let camLive: CameraState | null = null;
      // ドラッグ中(要素 or スケール or カメラ)はホバーを抑止
      let dragging = false;

      const views = new Map<string, ElView>();
      const pool = new ScenePhysicsPool();
      let prevT = pRef.current.tRef.current;
      let lastSeekNonce = -1;
      let throttleAcc = 0;
      let lastFrame: SceneFrameItem[] = [];
      let lastCam: CameraState = { x: 960, y: 540, zoom: 1 };
      // カメラ枠が示すカメラ(camera-edit中はidentity表示でも枠はこの値で描く)
      let camFrameValue: CameraState = { x: 960, y: 540, zoom: 1 };
      let transition: TransitionState | null = null;

      const p = () => pRef.current;
      const currentScene = (): SceneDoc | undefined =>
        p().store.doc.scenes.find((s) => s.id === p().sceneId);

      const resolver: CharResolver = {
        getCharacter: (ref) => pRef.current.resolver.getCharacter(ref),
      };

      const disposeTransition = () => {
        if (!transition) return;
        transition.sprite.destroy();
        if (transition.mask) transition.mask.destroy();
        transition.tex.destroy(true);
        transition = null;
      };

      // root(world)へカメラ変換を適用。slidePush は新シーン押し込み量(px)
      const applyCamera = (cam: CameraState, slidePush = 0) => {
        const z = STAGE_SCALE * cam.zoom;
        root.scale.set(z);
        root.position.set(
          VIEW_W / 2 - cam.x * z + slidePush,
          VIEW_H / 2 - cam.y * z,
        );
      };

      // === ヒットテスト / 座標補助 ===
      const canvas = app.canvas;

      // clientX/Y → canvas内ピクセル座標(VIEW_W×VIEW_H系)
      const toCanvasPx = (clientX: number, clientY: number): [number, number] => {
        const r = canvas.getBoundingClientRect();
        return [((clientX - r.left) / r.width) * VIEW_W, ((clientY - r.top) / r.height) * VIEW_H];
      };

      // viewのbounds(app.stage=screen座標のAABB)をステージ座標のEdgesへ変換
      const viewStageEdges = (view: ElView): Edges => {
        const b = view.container.getBounds();
        const [l, t] = screenToStage(b.x, b.y, lastCam);
        const [r, bot] = screenToStage(b.x + b.width, b.y + b.height, lastCam);
        return { l, r, t, b: bot, cx: (l + r) / 2, cy: (t + bot) / 2 };
      };

      // z降順で最初に当たった要素(locked除外)。bounds は screen座標
      const hitTest = (sx: number, sy: number): string | null => {
        const frame = lastFrame;
        const scene = currentScene();
        for (let i = frame.length - 1; i >= 0; i--) {
          const item = frame[i]!;
          const el = scene?.elements.find((e) => e.id === item.elementId);
          if (el?.locked) continue; // locked はヒット対象外
          const view = views.get(item.elementId);
          if (!view) continue;
          const b = view.container.getBounds();
          if (sx >= b.x && sx <= b.x + b.width && sy >= b.y && sy <= b.y + b.height) {
            return item.elementId;
          }
        }
        return null;
      };

      // 選択中balloonのしっぽ先端ハンドル(スクリーン座標)。無ければnull
      const tailHandleScreen = (): { x: number; y: number; el: BalloonElement } | null => {
        const id = p().selectedId;
        if (!id) return null;
        const scene = currentScene();
        const el = scene?.elements.find((e) => e.id === id);
        if (!el || el.kind !== "balloon" || el.locked) return null;
        // tailはローカル座標 → ステージ座標(transform適用、flipX無し) → スクリーン
        const sxStage = el.transform.x + el.tail.x * el.transform.scale;
        const syStage = el.transform.y + el.tail.y * el.transform.scale;
        const [hx, hy] = stageToScreen(sxStage, syStage, lastCam);
        return { x: hx, y: hy, el };
      };

      // 選択枠の四隅ハンドル(スクリーン座標)。locked/カメラモード中はnull
      const HANDLE = 8;
      const scaleHandles = (): { corners: [number, number][]; centerScreen: [number, number] } | null => {
        if (p().cameraEdit || p().playMode) return null;
        const id = p().selectedId;
        if (!id) return null;
        const scene = currentScene();
        const el = scene?.elements.find((e) => e.id === id);
        if (!el || el.locked) return null;
        const view = views.get(id);
        if (!view) return null;
        const b = view.container.getBounds();
        const corners: [number, number][] = [
          [b.x - 6, b.y - 6],
          [b.x + b.width + 6, b.y - 6],
          [b.x - 6, b.y + b.height + 6],
          [b.x + b.width + 6, b.y + b.height + 6],
        ];
        // 要素中心(transform.x/y)のスクリーン座標 = scale基準点
        const cs = stageToScreen(el.transform.x, el.transform.y, lastCam);
        return { corners, centerScreen: cs };
      };

      // カメラがクロップするステージ矩形(16:9固定)を、identity視点でスクリーン座標に。
      // カメラモード中はステージをidentity表示するため、ここは常にIDENTITY換算。
      const cameraFrameScreen = (cam: CameraState) => {
        const halfW = STAGE_W / 2 / cam.zoom;
        const halfH = STAGE_H / 2 / cam.zoom;
        const [l, t] = stageToScreen(cam.x - halfW, cam.y - halfH);
        const [r, b] = stageToScreen(cam.x + halfW, cam.y + halfH);
        return { l, t, r, b };
      };

      // ガイド線を描画(guides: SnapGuide[]、ステージ座標 → スクリーン)
      const drawGuides = (gs: { axis: "v" | "h"; pos: number }[]) => {
        guides.clear();
        for (const g of gs) {
          if (g.axis === "v") {
            const [sx] = stageToScreen(g.pos, 0, lastCam);
            guides.moveTo(sx, 0).lineTo(sx, VIEW_H);
          } else {
            const [, sy] = stageToScreen(0, g.pos, lastCam);
            guides.moveTo(0, sy).lineTo(VIEW_W, sy);
          }
        }
        if (gs.length > 0) guides.stroke({ color: 0xe64a8d, width: 1 });
      };

      // === ステージのドラッグ移動(開始transform + 生デルタ + スナップ補正) ===
      canvas.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        const cur = pRef.current;
        if (cur.playMode) return; // 再生中はドラッグしない
        const scene = cur.store.doc.scenes.find((s) => s.id === cur.sceneId);
        if (!scene) return;
        const [sx, sy] = toCanvasPx(ev.clientX, ev.clientY);

        // (0) カメラモード: 枠ドラッグ=x/y、四隅=zoom。pointerupで onCameraCommit 1回
        if (cur.cameraEdit) {
          startCameraDrag(ev, sx, sy);
          return;
        }

        // (0.5) 拡縮ハンドル上ならscaleドラッグ(要素ドラッグより優先)
        const handles = scaleHandles();
        if (handles) {
          const hitCorner = handles.corners.find(([hx, hy]) => Math.hypot(sx - hx, sy - hy) <= 10);
          if (hitCorner) {
            startScaleDrag(ev, sx, sy, handles.centerScreen);
            return;
          }
        }

        // (1) しっぽハンドル上ならtailドラッグ(要素ドラッグより優先)
        const handle = tailHandleScreen();
        if (handle && Math.hypot(sx - handle.x, sy - handle.y) <= 10) {
          const bEl = handle.el;
          canvas.setPointerCapture(ev.pointerId);
          const onTailMove = (me: PointerEvent) => {
            const [mx, my] = toCanvasPx(me.clientX, me.clientY);
            const [gx, gy] = screenToStage(mx, my, lastCam);
            // ステージ座標 → 要素ローカル: (stage - transform.xy) / scale(flipX無し)
            const sc = bEl.transform.scale || 1;
            setBalloonTail(p().store, scene.id, bEl.id, {
              x: (gx - bEl.transform.x) / sc,
              y: (gy - bEl.transform.y) / sc,
            });
          };
          const onTailUp = () => {
            canvas.removeEventListener("pointermove", onTailMove);
            canvas.removeEventListener("pointerup", onTailUp);
          };
          canvas.addEventListener("pointermove", onTailMove);
          canvas.addEventListener("pointerup", onTailUp);
          return;
        }

        // (2) 要素ヒットテスト(locked除外)
        const hitId = hitTest(sx, sy);
        cur.onSelect(hitId);
        if (!hitId) return;

        const el = scene.elements.find((e) => e.id === hitId);
        if (!el || el.locked) return; // locked はドラッグ開始を無視
        const startX = el.transform.x;
        const startY = el.transform.y;
        const [startStageX, startStageY] = screenToStage(sx, sy, lastCam);
        // スナップ用: 開始bounds(ステージ座標)と他要素エッジ(自分・locked除外)
        const startView = views.get(hitId);
        const startEdges = startView ? viewStageEdges(startView) : null;
        const otherEdges: Edges[] = [];
        for (const item of lastFrame) {
          if (item.elementId === hitId) continue;
          const oe = scene.elements.find((e) => e.id === item.elementId);
          if (oe?.locked) continue;
          const ov = views.get(item.elementId);
          if (ov) otherEdges.push(viewStageEdges(ov));
        }
        canvas.setPointerCapture(ev.pointerId);
        dragging = true;
        drawHover(null);

        const onMove = (me: PointerEvent) => {
          const [mx, my] = toCanvasPx(me.clientX, me.clientY);
          const [gx, gy] = screenToStage(mx, my, lastCam);
          const rawDx = gx - startStageX;
          const rawDy = gy - startStageY;
          let snapDx = 0;
          let snapDy = 0;
          if (!me.shiftKey && startEdges) {
            // 予測bounds = 開始bounds + 生デルタ
            const predicted: Edges = {
              l: startEdges.l + rawDx,
              r: startEdges.r + rawDx,
              cx: startEdges.cx + rawDx,
              t: startEdges.t + rawDy,
              b: startEdges.b + rawDy,
              cy: startEdges.cy + rawDy,
            };
            const snap = computeSnap(predicted, otherEdges, SNAP_THRESHOLD);
            snapDx = snap.dx;
            snapDy = snap.dy;
            drawGuides(snap.guides);
          } else {
            guides.clear();
          }
          // 常に開始値起点(複利禁止)
          updateElementTransform(p().store, scene.id, hitId, {
            x: startX + rawDx + snapDx,
            y: startY + rawDy + snapDy,
          });
        };
        const onUp = () => {
          guides.clear();
          dragging = false;
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp);
        };
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
      });

      // === 拡縮ハンドルドラッグ: 新scale = 開始scale × (現在→中心距離 / 開始→中心距離) ===
      const startScaleDrag = (
        ev: PointerEvent,
        sx: number,
        sy: number,
        centerScreen: [number, number],
      ) => {
        const cur = pRef.current;
        const scene = cur.store.doc.scenes.find((s) => s.id === cur.sceneId);
        const id = cur.selectedId;
        if (!scene || !id) return;
        const el = scene.elements.find((e) => e.id === id);
        if (!el || el.locked) return;
        const startScale = el.transform.scale;
        const startDist = Math.max(1e-3, Math.hypot(sx - centerScreen[0], sy - centerScreen[1]));
        canvas.setPointerCapture(ev.pointerId);
        dragging = true;
        drawHover(null);
        const onMove = (me: PointerEvent) => {
          const [mx, my] = toCanvasPx(me.clientX, me.clientY);
          const curDist = Math.hypot(mx - centerScreen[0], my - centerScreen[1]);
          const raw = startScale * (curDist / startDist);
          const next = Math.min(5, Math.max(0.1, raw));
          updateElementTransform(p().store, scene.id, id, { scale: next });
        };
        const onUp = () => {
          dragging = false;
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp);
        };
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
      };

      // === カメラ枠ドラッグ: 枠内=x/y移動、四隅=zoom。pointerupで onCameraCommit 1回 ===
      const startCameraDrag = (ev: PointerEvent, sx: number, sy: number) => {
        // 開始時点のカメラを固定(ドラッグ中にカメラ自身が動くのでデルタ基準を固定)
        const startCam: CameraState = { ...camFrameValue };
        const f = cameraFrameScreen(startCam);
        const corners: [number, number][] = [
          [f.l, f.t],
          [f.r, f.t],
          [f.l, f.b],
          [f.r, f.b],
        ];
        const onCorner = corners.some(([hx, hy]) => Math.hypot(sx - hx, sy - hy) <= 10);
        // 中心(スクリーン)= 枠中心。zoom基準の対角距離
        const cxScreen = (f.l + f.r) / 2;
        const cyScreen = (f.t + f.b) / 2;
        const startDiag = Math.max(1e-3, Math.hypot(sx - cxScreen, sy - cyScreen));
        // 枠内ドラッグの開始ステージ座標(identity視点)
        const [startStageX, startStageY] = screenToStage(sx, sy);
        canvas.setPointerCapture(ev.pointerId);
        dragging = true;

        const onMove = (me: PointerEvent) => {
          const [mx, my] = toCanvasPx(me.clientX, me.clientY);
          if (onCorner) {
            // 四隅: zoom = 開始zoom × (開始対角 / 現在対角)、クランプ0.5〜4(枠中心固定)
            const curDiag = Math.hypot(mx - cxScreen, my - cyScreen);
            const z = startCam.zoom * (startDiag / Math.max(1e-3, curDiag));
            camLive = { x: startCam.x, y: startCam.y, zoom: Math.min(4, Math.max(0.5, z)) };
          } else {
            // 枠内: 中心x/y移動(開始カメラ基準のデルタ)
            const [gx, gy] = screenToStage(mx, my);
            camLive = {
              x: startCam.x + (gx - startStageX),
              y: startCam.y + (gy - startStageY),
              zoom: startCam.zoom,
            };
          }
        };
        const onUp = () => {
          dragging = false;
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp);
          const committed = camLive;
          camLive = null;
          if (committed) pRef.current.onCameraCommit(committed);
        };
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
      };

      // === ホバーハイライト(非ドラッグ・非カメラ・非再生時) ===
      canvas.addEventListener("pointermove", (ev: PointerEvent) => {
        const cur = pRef.current;
        if (dragging || cur.cameraEdit || cur.playMode) {
          drawHover(null);
          return;
        }
        const [sx, sy] = toCanvasPx(ev.clientX, ev.clientY);
        drawHover(hitTest(sx, sy));
      });
      canvas.addEventListener("pointerleave", () => drawHover(null));

      // === ダブルクリック → クイックアクション(キャラのみ) ===
      canvas.addEventListener("dblclick", (ev: MouseEvent) => {
        const cur = pRef.current;
        if (cur.playMode || cur.cameraEdit) return;
        const [sx, sy] = toCanvasPx(ev.clientX, ev.clientY);
        const hitId = hitTest(sx, sy);
        if (!hitId) return;
        const scene = cur.store.doc.scenes.find((s) => s.id === cur.sceneId);
        const el = scene?.elements.find((e) => e.id === hitId);
        if (el?.kind === "character") {
          cur.onQuickAction({ clientX: ev.clientX, clientY: ev.clientY, elementId: hitId });
        }
      });

      // === 右クリックメニュー ===
      canvas.addEventListener("contextmenu", (ev: MouseEvent) => {
        ev.preventDefault();
        const cur = pRef.current;
        if (cur.playMode) return;
        const [sx, sy] = toCanvasPx(ev.clientX, ev.clientY);
        const hitId = hitTest(sx, sy);
        if (hitId) cur.onSelect(hitId);
        const [stageX, stageY] = screenToStage(sx, sy, lastCam);
        cur.onContextMenu({
          clientX: ev.clientX,
          clientY: ev.clientY,
          stageX,
          stageY,
          elementId: hitId,
        });
      });

      // 整列用: 要素のステージ座標boundsを公開
      pRef.current.apiRef.current = {
        getStageEdges: (elementId) => {
          const v = views.get(elementId);
          return v ? viewStageEdges(v) : null;
        },
      };

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
        // 通し再生中・カメラモード中は選択枠を描かない
        if (p().playMode === "all" || p().cameraEdit) return;
        const id = p().selectedId;
        if (!id) return;
        const item = frame.find((f) => f.elementId === id);
        const view = item ? views.get(id) : undefined;
        if (!view) return;
        // bounds は app.stage(screen)座標なのでそのまま使う
        const b = view.container.getBounds();
        selection
          .rect(b.x - 6, b.y - 6, b.width + 12, b.height + 12)
          .stroke({ color: 0x5b7db1, width: 3 });
        // 四隅の拡縮ハンドル(8px白角・青枠)。locked要素には出さない
        const handles = scaleHandles();
        if (handles) {
          for (const [hx, hy] of handles.corners) {
            selection
              .rect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE)
              .fill({ color: 0xffffff })
              .stroke({ color: 0x5b7db1, width: 2 });
          }
        }
        // balloon選択中: しっぽ先端ハンドル(白丸+青枠、半径7px スクリーン)
        const handle = tailHandleScreen();
        if (handle) {
          selection
            .circle(handle.x, handle.y, 7)
            .fill({ color: 0xffffff })
            .stroke({ color: 0x5b7db1, width: 2 });
        }
      };

      // ホバーハイライト(薄い1px枠)。ドラッグ中・カメラモード中・再生中は消す
      const drawHover = (elementId: string | null) => {
        hover.clear();
        if (elementId === null) return;
        const view = views.get(elementId);
        if (!view) return;
        const b = view.container.getBounds();
        hover
          .rect(b.x - 4, b.y - 4, b.width + 8, b.height + 8)
          .stroke({ color: 0x5b7db1, width: 1, alpha: 0.5 });
      };

      // カメラオーバーレイ: 枠(16:9)+ 外側グレーアウト + 四隅zoomハンドル
      const drawCameraOverlay = () => {
        camOverlay.clear();
        if (!p().cameraEdit) return;
        const f = cameraFrameScreen(camFrameValue);
        // 外側グレーアウト(4枚の矩形で枠の外を覆う)
        const ga = { color: 0x000000, alpha: 0.35 };
        camOverlay.rect(0, 0, VIEW_W, Math.max(0, f.t)).fill(ga);
        camOverlay.rect(0, f.b, VIEW_W, Math.max(0, VIEW_H - f.b)).fill(ga);
        camOverlay.rect(0, f.t, Math.max(0, f.l), Math.max(0, f.b - f.t)).fill(ga);
        camOverlay.rect(f.r, f.t, Math.max(0, VIEW_W - f.r), Math.max(0, f.b - f.t)).fill(ga);
        // 枠線
        camOverlay.rect(f.l, f.t, f.r - f.l, f.b - f.t).stroke({ color: 0x5b7db1, width: 2 });
        // 四隅ハンドル(zoom)
        for (const [hx, hy] of [
          [f.l, f.t],
          [f.r, f.t],
          [f.l, f.b],
          [f.r, f.b],
        ] as const) {
          camOverlay
            .rect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE)
            .fill({ color: 0xffffff })
            .stroke({ color: 0x5b7db1, width: 2 });
        }
      };

      const drawGrid = () => {
        gridLayer.clear();
        if (!p().showGrid) return;
        // 3分割線+中央線(細線)
        for (const x of [640, 960, 1280]) {
          gridLayer.moveTo(x, 0).lineTo(x, 1080);
        }
        for (const y of [360, 540, 720]) {
          gridLayer.moveTo(0, y).lineTo(1920, y);
        }
        gridLayer.stroke({ color: 0x5b7db1, width: 2, alpha: 0.25 });
        // セーフエリア矩形(1828×972 中央)
        gridLayer.rect((1920 - 1828) / 2, (1080 - 972) / 2, 1828, 972);
        gridLayer.stroke({ color: 0x5b7db1, width: 2, alpha: 0.35 });
      };

      const renderFrame = (scene: SceneDoc | undefined, t: number) => {
        bg.clear();
        const color = scene?.background?.color ?? PAPER_COLOR;
        bg.rect(0, 0, 1920, 1080).fill({ color });
        updateBgImage(scene);
        drawGrid();

        // カメラ評価。枠が示すカメラ = ドラッグ中ローカル値 ?? 評価値
        const evalCam = scene ? evaluateCamera(scene.camera, t) : { x: 960, y: 540, zoom: 1 };
        camFrameValue = camLive ?? evalCam;
        // トランジション slide の押し込み量
        let slidePush = 0;
        if (transition && transition.type === "slide") {
          const prog = transition.dur > 0 ? Math.min(t / transition.dur, 1) : 1;
          slidePush = (1 - prog) * VIEW_W;
        }
        // カメラモード中はステージをidentity表示(枠でクロップを示す)。
        // lastCam(ヒットテスト/座標基準)もidentityに合わせる。
        if (p().cameraEdit) {
          lastCam = { x: 960, y: 540, zoom: 1 };
          applyCamera(lastCam, 0);
        } else {
          lastCam = camFrameValue;
          applyCamera(lastCam, slidePush);
        }
        drawCameraOverlay();

        if (!scene) {
          for (const [, v] of views) v.container.destroy({ children: true });
          views.clear();
          selection.clear();
          lastFrame = [];
          return;
        }

        const frame = evaluateScene(p().store.doc, scene, t, resolver, {
          hairDeforms: collectDeforms(scene),
          // 口パク: 再生中もスクラブ中も同じエンベロープ参照(音は鳴らずとも口は動く)
          audio: { lookup: (path) => pRef.current.resolver.getAudio(path) },
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

      // トランジション進行(新シーン再生中)。snapshot を p に応じて変形/消去
      const advanceTransition = (t: number) => {
        if (!transition) return;
        const prog = transition.dur > 0 ? Math.min(t / transition.dur, 1) : 1;
        const snap = transition.sprite;
        if (transition.type === "fade") {
          snap.alpha = 1 - prog;
        } else if (transition.type === "wipe" && transition.mask) {
          transition.mask.clear();
          transition.mask
            .rect(prog * VIEW_W, 0, VIEW_W - prog * VIEW_W, VIEW_H)
            .fill({ color: 0xffffff });
        } else if (transition.type === "slide") {
          snap.x = -prog * VIEW_W;
        }
        if (prog >= 1) disposeTransition();
      };

      // 次シーンへ切り替わる直前: 現stageをsnapshot化(transitionがcut以外なら)
      const beginTransitionIfNeeded = () => {
        const cur = p();
        const doc = cur.store.doc;
        const idx = doc.scenes.findIndex((s) => s.id === cur.sceneId);
        const next = doc.scenes[idx + 1];
        if (!next) return;
        const trans = next.transition;
        if (!trans || trans.type === "cut") return;
        disposeTransition();
        const tex = app.renderer.extract.texture(app.stage);
        const sprite = new Sprite(tex);
        sprite.position.set(0, 0);
        let mask: Graphics | null = null;
        if (trans.type === "wipe") {
          mask = new Graphics();
          mask.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff });
          app.stage.addChild(mask);
          sprite.mask = mask;
        }
        // 選択枠より前面(最前面)へ
        app.stage.addChild(sprite);
        transition = { sprite, tex, mask, type: trans.type, dur: trans.dur };
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
            // 通し再生のみ: 次シーンへ切替前に snapshot を取る
            if (cur.playMode === "all") beginTransitionIfNeeded();
            cur.onReachEnd(cur.playMode);
          } else {
            cur.tRef.current = t;
            pool.advance(cur.store.doc, scene, prevT, t, resolver);
            prevT = t;
            renderFrame(scene, t);
            if (transition && cur.playMode === "all") advanceTransition(t);
            throttleAcc += dt;
            if (throttleAcc >= 0.05) {
              throttleAcc = 0;
              cur.onTime(t);
            }
          }
        } else {
          // 非再生: 共有時刻で描画(scrub中も)。トランジションは描かない
          if (transition) disposeTransition();
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
  } else if (item.payload.kind === "balloon") {
    const el = item.payload.el;
    if (!view.balloon) {
      const g = new Graphics();
      const text = new Text({ text: el.text });
      text.anchor.set(0.5);
      c.addChild(g);
      c.addChild(text);
      view.balloon = { g, text };
    }
    const { g, text } = view.balloon;
    g.clear();
    drawBalloon(g, el);
    text.text = el.text;
    text.style = {
      fontFamily: "system-ui, sans-serif",
      fontSize: el.size,
      fill: el.textColor,
      wordWrap: true,
      wordWrapWidth: el.w - 48,
      breakWords: true,
      align: "center",
    };
    const tf = item.payload.transform;
    c.position.set(tf.x + visual.offset[0], tf.y + visual.offset[1]);
    // balloon は flipX を適用しない(テキスト同様)
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
