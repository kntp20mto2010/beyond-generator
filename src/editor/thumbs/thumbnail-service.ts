import type { CharacterDoc } from "../../core/schema/character.js";
import {
  PAPER_COLOR,
  type BalloonElement,
  type ProjectDoc,
  type SceneDoc,
  type TextElement,
} from "../../core/schema/project.js";
import { computeBoneWorld, buildRenderList } from "../../runtime/pose.js";
import { resolveFace } from "../../runtime/expression.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { CLIPS } from "../../presets/clips/index.js";
import {
  evaluateScene,
  STAGE_H,
  STAGE_W,
  type CharResolver,
} from "../../runtime/scene-eval.js";
import {
  drawItemsToCanvas,
  itemsBounds,
} from "../../render/character-canvas2d.js";

// サムネ描画はWebGL(Pixi)を使わない。Pixiのレンダラーを増やすと
// StageCanvasと内部プールが混線し本番ステージが描画されなくなるため、
// Canvas 2D(character-canvas2d.ts)で同一形状を描く。

// デフォルトサイズ定数
const CHAR_W = 72;
const CHAR_H = 108;
const FACE_W = 56;
const FACE_H = 56;
const SCENE_W = 128;
const SCENE_H = 72;

// 画像参照の解決(背景画像用)。シーンサムネのみ使用
export interface SceneResolver extends CharResolver {
  getImageUrl(path: string): string | undefined;
}

// 顔クロップ: bboxの上端側を正方形で切り出す
// (このリグはボーン行列が回転のみでheadDecalMatrixの並進は原点=腰。頭の位置はbboxから推定する)
function faceBase(
  bounds: { x: number; y: number; width: number; height: number },
  w: number,
  h: number,
): { scale: number; tx: number; ty: number } {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height * 0.17;
  const side = Math.max(1, bounds.height * 0.36);
  const scale = Math.min(w, h) / side;
  return { scale, tx: w / 2 - cx * scale, ty: h / 2 - cy * scale };
}

// キャッシュキー生成(純関数 — テスト可能)
export function makeCacheKey(
  ref: string,
  opts: { expression?: string; clip?: string; phase?: number; face?: boolean; w?: number; h?: number },
): string {
  return `${ref}|${opts.expression ?? ""}|${opts.clip ?? ""}|${opts.phase ?? ""}|${opts.face ? "f" : ""}|${opts.w ?? ""}|${opts.h ?? ""}`;
}

// bounds内フィット計算(純関数 — テスト可能)
export function fitInBounds(
  localBounds: { x: number; y: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
  margin = 0.08,
): { scale: number; tx: number; ty: number } {
  const pw = localBounds.width;
  const ph = localBounds.height;
  if (pw <= 0 || ph <= 0) {
    return { scale: 1, tx: canvasW / 2, ty: canvasH / 2 };
  }
  const available = 1 - margin * 2;
  const scale = Math.min((canvasW * available) / pw, (canvasH * available) / ph);
  const tx = canvasW / 2 - (localBounds.x + pw / 2) * scale;
  const ty = canvasH / 2 - (localBounds.y + ph / 2) * scale;
  return { scale, tx, ty };
}

// ステージ(STAGE_W×STAGE_H)→ サムネ(w×h)の縮小率(純関数 — テスト可能)
export function stageThumbScale(w: number, h: number): number {
  return Math.min(w / STAGE_W, h / STAGE_H);
}

// 背景画像の cover 配置(画像をw×hいっぱいに、はみ出しは中央クロップ。純関数 — テスト可能)
export interface CoverRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}
export function coverFit(imgW: number, imgH: number, w: number, h: number): CoverRect {
  if (imgW <= 0 || imgH <= 0) return { dx: 0, dy: 0, dw: w, dh: h };
  const s = Math.max(w / imgW, h / imgH);
  const dw = imgW * s;
  const dh = imgH * s;
  return { dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh };
}

// 画像ロード(背景用)。失敗時は null
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export class ThumbnailService {
  #canvas: HTMLCanvasElement | null = null;
  #cache = new Map<string, string>();
  #listeners = new Set<() => void>();

  // シーンサムネ: sceneId → dataURL
  #sceneCache = new Map<string, string>();
  // 再生成が必要(doc変更)なシーン。古いdataURLは保持したまま新規生成で置換する
  #sceneStale = new Set<string>();
  // 直列レンダリング用キュー(同時多発を避ける)
  #sceneQueue: Array<() => Promise<void>> = [];
  #sceneRunning = false;
  // キューに積み済みのシーン(二重投入防止)
  #sceneQueued = new Set<string>();

  #ctx(w: number, h: number): CanvasRenderingContext2D {
    if (!this.#canvas) this.#canvas = document.createElement("canvas");
    this.#canvas.width = w;
    this.#canvas.height = h;
    const ctx = this.#canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }

  // キャラ立ち絵サムネ(同期描画だがAPIはPromiseのまま維持)
  renderCharacter(
    char: CharacterDoc,
    opts: {
      expression?: string;
      clip?: string;
      phase?: number;
      face?: boolean;
      w?: number;
      h?: number;
    } = {},
  ): Promise<string> {
    const cacheKey = makeCacheKey(char.id ?? char.name, opts);
    const cached = this.#cache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    try {
      const isFace = opts.face === true;
      const w = opts.w ?? (isFace ? FACE_W : CHAR_W);
      const h = opts.h ?? (isFace ? FACE_H : CHAR_H);

      let pose = { rotations: {}, rootOffset: [0, 0] as [number, number] };
      if (opts.clip != null) {
        const clipDoc = CLIPS[opts.clip];
        if (clipDoc) {
          const frame = sampleClip(clipDoc, opts.phase ?? 0);
          pose = frame.pose as typeof pose;
        }
      }

      const bones = computeBoneWorld(char, pose);
      const face = resolveFace(char, { preset: opts.expression ?? "neutral" });
      const items = buildRenderList(char, bones, { face });

      const ctx = this.#ctx(w, h);
      const base = isFace
        ? faceBase(itemsBounds(items), w, h)
        : fitInBounds(itemsBounds(items), w, h);
      drawItemsToCanvas(ctx, char, items, base);

      const url = this.#canvas!.toDataURL("image/png");
      this.#cache.set(cacheKey, url);
      this.#notify();
      return Promise.resolve(url);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // シーンサムネ。キャッシュ済み(かつ非stale)なら即返す。
  // 未生成 or stale なら直列キューに積む。古いdataURLがあればそれを即返し、完了後 subscribe で置換通知。
  renderScene(
    project: ProjectDoc,
    scene: SceneDoc,
    resolver: SceneResolver,
    w = SCENE_W,
    h = SCENE_H,
  ): Promise<string | null> {
    const cached = this.#sceneCache.get(scene.id);
    const stale = this.#sceneStale.has(scene.id);
    if (cached && !stale) return Promise.resolve(cached);

    if (!this.#sceneQueued.has(scene.id)) {
      this.#sceneQueued.add(scene.id);
      this.#sceneQueue.push(async () => {
        this.#sceneQueued.delete(scene.id);
        this.#sceneStale.delete(scene.id);
        try {
          const url = await this.#paintScene(project, scene, resolver, w, h);
          this.#sceneCache.set(scene.id, url);
          this.#notify();
        } catch {
          /* 生成失敗は黙殺(古いキャッシュを維持) */
        }
      });
      void this.#drainSceneQueue();
    }
    // 生成中も古いdataURL(あれば)を返してチラつきを防ぐ
    return Promise.resolve(cached ?? null);
  }

  async #drainSceneQueue(): Promise<void> {
    if (this.#sceneRunning) return;
    this.#sceneRunning = true;
    try {
      while (this.#sceneQueue.length > 0) {
        const job = this.#sceneQueue.shift()!;
        await job();
      }
    } finally {
      this.#sceneRunning = false;
    }
  }

  // Canvas 2D でシーンを合成して dataURL を返す(背景→z順に要素)
  async #paintScene(
    project: ProjectDoc,
    scene: SceneDoc,
    resolver: SceneResolver,
    w: number,
    h: number,
  ): Promise<string> {
    const ctx = this.#ctx(w, h);
    const s = stageThumbScale(w, h);

    // 1) 背景色(なければ紙色)
    ctx.fillStyle = scene.background?.color ?? PAPER_COLOR;
    ctx.fillRect(0, 0, w, h);

    // 2) 背景画像(cover配置、未解決はスキップ)
    const imgPath = scene.background?.image;
    if (imgPath) {
      const url = resolver.getImageUrl(imgPath);
      if (url) {
        const img = await loadImage(url);
        if (img) {
          const r = coverFit(img.naturalWidth, img.naturalHeight, w, h);
          ctx.drawImage(img, r.dx, r.dy, r.dw, r.dh);
        }
      }
    }

    // 3) 要素(z昇順)を t = duration/2 で評価して描画
    const frame = evaluateScene(project, scene, scene.duration / 2, resolver);
    for (const item of frame) {
      const pay = item.payload;
      ctx.globalAlpha = item.visual.alpha;
      const off = item.visual.offset;
      if (pay.kind === "character") {
        const tf = pay.transform;
        const sc = tf.scale * item.visual.scaleMul;
        const sx = (pay.flipX ? -sc : sc) * s;
        const sy = sc * s;
        const tx = (tf.x + off[0]) * s;
        const ty = (tf.y + off[1]) * s;
        drawItemsToCanvas(ctx, pay.char, pay.items, { scaleX: sx, scaleY: sy, tx, ty });
        ctx.globalAlpha = 1;
      } else if (pay.kind === "text") {
        this.#drawText(ctx, pay.el, pay.transform.x + off[0], pay.transform.y + off[1], pay.transform.scale * item.visual.scaleMul, s);
      } else if (pay.kind === "balloon") {
        this.#drawBalloon(ctx, pay.el, pay.transform.x + off[0], pay.transform.y + off[1], pay.transform.scale * item.visual.scaleMul, s);
      } else {
        // placeholder(未解決キャラ)はグレー矩形
        const tf = pay.transform;
        const sc = tf.scale * item.visual.scaleMul * s;
        ctx.fillStyle = "#dddddd";
        ctx.strokeStyle = "#999999";
        ctx.lineWidth = 2;
        const px = (tf.x + off[0]) * s;
        const py = (tf.y + off[1]) * s;
        ctx.fillRect(px - 120 * sc, py - 300 * sc, 240 * sc, 300 * sc);
        ctx.strokeRect(px - 120 * sc, py - 300 * sc, 240 * sc, 300 * sc);
      }
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    return this.#canvas!.toDataURL("image/png");
  }

  // テキスト要素: 中央anchor。縁取り → 塗り
  #drawText(
    ctx: CanvasRenderingContext2D,
    el: TextElement,
    x: number,
    y: number,
    scale: number,
    s: number,
  ): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${el.size * scale * s}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = x * s;
    const cy = y * s;
    if (el.strokeColor !== null && el.strokeWidth > 0) {
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth * scale * s;
      ctx.lineJoin = "round";
      ctx.strokeText(el.text, cx, cy);
    }
    ctx.fillStyle = el.color;
    ctx.fillText(el.text, cx, cy);
    ctx.restore();
  }

  // 吹き出し: 角丸rect + 三角しっぽの簡易描画(雲/トゲも角丸代用)
  #drawBalloon(
    ctx: CanvasRenderingContext2D,
    el: BalloonElement,
    x: number,
    y: number,
    scale: number,
    s: number,
  ): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const u = scale * s; // 要素ローカル → サムネpx
    const cx = x * s;
    const cy = y * s;
    const bw = el.w * u;
    const bh = el.h * u;
    const r = Math.min(bw, bh) * 0.22;
    ctx.lineWidth = Math.max(1, el.lineWidth * u);
    ctx.lineJoin = "round";

    // しっぽ三角(中心→先端、基部は中心寄り30%)
    const tipX = cx + el.tail.x * u;
    const tipY = cy + el.tail.y * u;
    const len = Math.hypot(el.tail.x, el.tail.y) || 1;
    const dirX = (el.tail.x / len) * u;
    const dirY = (el.tail.y / len) * u;
    const half = Math.max(18, el.w * 0.06) * u;
    const baseCx = cx + el.tail.x * 0.3 * u;
    const baseCy = cy + el.tail.y * 0.3 * u;
    const nx = -dirY / u;
    const ny = dirX / u;
    ctx.fillStyle = el.fill;
    ctx.strokeStyle = el.lineColor;
    ctx.beginPath();
    ctx.moveTo(baseCx - nx * half, baseCy - ny * half);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(baseCx + nx * half, baseCy + ny * half);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 本体(角丸rect)
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, r);
    ctx.fill();
    ctx.stroke();

    // テキスト
    if (el.text) {
      ctx.fillStyle = el.textColor;
      ctx.font = `${el.size * u}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(el.text, cx, cy);
    }
    ctx.restore();
  }

  getScene(sceneId: string): string | undefined {
    return this.#sceneCache.get(sceneId);
  }

  // doc変更時: 既存dataURLは即削除せず(チラつき防止)staleフラグを立て、
  // 次の renderScene 呼び出しで再生成 → 完了時に置換させる。
  invalidateScene(sceneId: string): void {
    this.#sceneStale.add(sceneId);
  }

  // invalidateScene 群の後に呼ぶ。購読者(SceneStrip)へ再 renderScene を促す
  notifyScenes(): void {
    this.#notify();
  }

  subscribe(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  }

  #notify(): void {
    for (const cb of this.#listeners) cb();
  }
}

export { STAGE_W, STAGE_H };
