import type { CharacterDoc } from "../core/schema/character.js";
import { resolveFill, type Shape } from "../core/schema/geometry.js";
import type { RenderItem } from "../runtime/pose.js";

// サムネイル用のCanvas 2D描画。
// Pixiレンダラーを増やすとStageCanvasと内部プールが混線するため(pixi-init-lock.tsの経緯参照)、
// サムネはWebGLを使わずこの2D実装で描く。character-pixi.tsのdrawShapeと同一の形状解釈を保つこと。

function tracePath(ctx: CanvasRenderingContext2D, shape: Shape): void {
  ctx.beginPath();
  switch (shape.kind) {
    case "rect": {
      const r = Math.min(shape.r ?? 0, shape.w / 2, shape.h / 2);
      if (r > 0) ctx.roundRect(shape.x, shape.y, shape.w, shape.h, r);
      else ctx.rect(shape.x, shape.y, shape.w, shape.h);
      break;
    }
    case "ellipse":
      ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
      break;
    case "polygon": {
      shape.points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      break;
    }
    case "path":
      for (const cmd of shape.d) {
        switch (cmd.c) {
          case "M":
            ctx.moveTo(cmd.p[0], cmd.p[1]);
            break;
          case "L":
            ctx.lineTo(cmd.p[0], cmd.p[1]);
            break;
          case "Q":
            ctx.quadraticCurveTo(cmd.cp[0], cmd.cp[1], cmd.p[0], cmd.p[1]);
            break;
          case "C":
            ctx.bezierCurveTo(cmd.cp1[0], cmd.cp1[1], cmd.cp2[0], cmd.cp2[1], cmd.p[0], cmd.p[1]);
            break;
          case "Z":
            ctx.closePath();
            break;
        }
      }
      break;
  }
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// shapeのローカルbbox近似(曲線は制御点込みの点包含で近似 — サムネのfit用途には十分)
export function shapeLocalBounds(shape: Shape): Box {
  const pts: [number, number][] = [];
  switch (shape.kind) {
    case "rect":
      pts.push([shape.x, shape.y], [shape.x + shape.w, shape.y + shape.h]);
      break;
    case "ellipse":
      pts.push([shape.cx - shape.rx, shape.cy - shape.ry], [shape.cx + shape.rx, shape.cy + shape.ry]);
      break;
    case "polygon":
      for (const p of shape.points) pts.push([p[0], p[1]]);
      break;
    case "path":
      for (const cmd of shape.d) {
        if (cmd.c === "Z") continue;
        pts.push([cmd.p[0], cmd.p[1]]);
        if (cmd.c === "Q") pts.push([cmd.cp[0], cmd.cp[1]]);
        if (cmd.c === "C") pts.push([cmd.cp1[0], cmd.cp1[1]], [cmd.cp2[0], cmd.cp2[1]]);
      }
      break;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const pad = shape.stroke ? shape.stroke.width / 2 : 0;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

// アイテム列のワールドbbox(各shapeのbbox4隅を行列変換して合成)
export function itemsBounds(
  items: readonly RenderItem[],
): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const item of items) {
    const m = item.matrix;
    for (const shape of item.shapes) {
      const b = shapeLocalBounds(shape);
      if (!Number.isFinite(b.x0)) continue;
      for (const [lx, ly] of [
        [b.x0, b.y0],
        [b.x1, b.y0],
        [b.x0, b.y1],
        [b.x1, b.y1],
      ] as const) {
        const wx = m.a * lx + m.c * ly + m.tx;
        const wy = m.b * lx + m.d * ly + m.ty;
        x0 = Math.min(x0, wx);
        y0 = Math.min(y0, wy);
        x1 = Math.max(x1, wx);
        y1 = Math.max(y1, wy);
      }
    }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// items(z昇順ソート済み)をキャンバスへ描画。base = fit変換(scale + 平行移動)
export function drawItemsToCanvas(
  ctx: CanvasRenderingContext2D,
  char: CharacterDoc,
  items: readonly RenderItem[],
  base: { scale: number; tx: number; ty: number },
): void {
  for (const item of items) {
    const m = item.matrix;
    ctx.setTransform(base.scale, 0, 0, base.scale, base.tx, base.ty);
    ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    for (const shape of item.shapes) {
      tracePath(ctx, shape);
      if (shape.fill !== undefined) {
        ctx.fillStyle = resolveFill(shape.fill, char.palette);
        ctx.fill();
      }
      if (shape.stroke !== undefined) {
        ctx.strokeStyle = resolveFill(shape.stroke.color, char.palette);
        ctx.lineWidth = shape.stroke.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
