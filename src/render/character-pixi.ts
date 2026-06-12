import { Container, Graphics, Matrix } from "pixi.js";
import type { CharacterDoc } from "../core/schema/character.js";
import { resolveFill, type Shape } from "../core/schema/geometry.js";
import type { RenderItem } from "../runtime/pose.js";

function drawShape(
  g: Graphics,
  shape: Shape,
  palette: Record<string, string>,
): void {
  switch (shape.kind) {
    case "rect": {
      const r = Math.min(shape.r ?? 0, shape.w / 2, shape.h / 2);
      if (r > 0) {
        g.roundRect(shape.x, shape.y, shape.w, shape.h, r);
      } else {
        g.rect(shape.x, shape.y, shape.w, shape.h);
      }
      break;
    }
    case "ellipse":
      g.ellipse(shape.cx, shape.cy, shape.rx, shape.ry);
      break;
    case "polygon":
      g.poly(shape.points.flat());
      break;
    case "path":
      for (const cmd of shape.d) {
        switch (cmd.c) {
          case "M":
            g.moveTo(cmd.p[0], cmd.p[1]);
            break;
          case "L":
            g.lineTo(cmd.p[0], cmd.p[1]);
            break;
          case "Q":
            g.quadraticCurveTo(cmd.cp[0], cmd.cp[1], cmd.p[0], cmd.p[1]);
            break;
          case "C":
            g.bezierCurveTo(
              cmd.cp1[0], cmd.cp1[1],
              cmd.cp2[0], cmd.cp2[1],
              cmd.p[0], cmd.p[1],
            );
            break;
          case "Z":
            g.closePath();
            break;
        }
      }
      break;
  }
  if (shape.fill !== undefined) {
    g.fill({ color: resolveFill(shape.fill, palette) });
  }
  if (shape.stroke !== undefined) {
    g.stroke({
      color: resolveFill(shape.stroke.color, palette),
      width: shape.stroke.width,
      cap: "round",
      join: "round",
    });
  }
}

// RenderItem列(z昇順ソート済み)→ Pixiコンテナ
export function buildCharacterContainer(
  char: CharacterDoc,
  items: readonly RenderItem[],
): Container {
  const container = new Container();
  for (const item of items) {
    const g = new Graphics();
    for (const shape of item.shapes) {
      drawShape(g, shape, char.palette);
    }
    const m = item.matrix;
    g.setFromMatrix(new Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty));
    container.addChild(g);
  }
  return container;
}

// アニメ用: キー単位でGraphicsを再利用するビュー。
// 形状参照・パレット・キー列が同じ間は行列更新のみ(毎フレームの再テッセレーション回避)
export class CharacterView {
  readonly container = new Container();
  #keys: string[] = [];
  #shapes: (readonly Shape[])[] = [];
  #graphics: Graphics[] = [];
  #palette: Record<string, string> | null = null;

  update(char: CharacterDoc, items: readonly RenderItem[]): void {
    const structural =
      this.#palette !== char.palette ||
      items.length !== this.#keys.length ||
      items.some((it, i) => it.key !== this.#keys[i] || it.shapes !== this.#shapes[i]);

    if (structural) {
      for (const c of this.container.removeChildren()) c.destroy();
      this.#graphics = items.map((it) => {
        const g = new Graphics();
        for (const shape of it.shapes) drawShape(g, shape, char.palette);
        this.container.addChild(g);
        return g;
      });
      this.#keys = items.map((it) => it.key);
      this.#shapes = items.map((it) => it.shapes);
      this.#palette = char.palette;
    }

    items.forEach((it, i) => {
      const g = this.#graphics[i];
      if (!g) return;
      const m = it.matrix;
      g.setFromMatrix(new Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty));
    });
  }
}
