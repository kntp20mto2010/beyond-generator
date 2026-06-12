import type { CharacterDoc } from "../../core/schema/character.js";
import type { ProjectDoc, SceneDoc } from "../../core/schema/project.js";
import { computeBoneWorld, buildRenderList } from "../../runtime/pose.js";
import { resolveFace } from "../../runtime/expression.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { CLIPS } from "../../presets/clips/index.js";
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

export class ThumbnailService {
  #canvas: HTMLCanvasElement | null = null;
  #cache = new Map<string, string>();
  #listeners = new Set<() => void>();

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

  // シーンサムネ(4c-3で実装: 背景色/画像+キャラ+テキストをCanvas 2Dで合成)
  renderScene(
    _project: ProjectDoc,
    _scene: SceneDoc,
    _w?: number,
    _h?: number,
  ): Promise<string | null> {
    return Promise.resolve(null);
  }

  invalidateScene(_sceneId: string): void {
    // TODO(4c-3): シーンサムネキャッシュの破棄
  }

  subscribe(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  }

  #notify(): void {
    for (const cb of this.#listeners) cb();
  }
}
