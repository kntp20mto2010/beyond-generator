import type { Graphics } from "pixi.js";
import type { BalloonElement } from "../core/schema/project.js";

// 吹き出し本体 + しっぽを中心(0,0)に w×h で描く。
// 線の継ぎ目を消す定石: ①しっぽを fill+stroke → ②本体を fill+stroke
// → ③しっぽを本体fill色で fill のみ(本体側の線を消し、しっぽ外側2辺の線だけ残す)。
export function drawBalloon(g: Graphics, el: BalloonElement): void {
  const { w, fill, lineColor, lineWidth, tail } = el;

  // しっぽ頂点: 先端 + 基部2点(中心→先端方向に垂直)
  const tip: [number, number] = [tail.x, tail.y];
  const len = Math.hypot(tip[0], tip[1]) || 1;
  const dirX = tip[0] / len;
  const dirY = tip[1] / len;
  // 中心寄り(中心から先端へ30%)に基部、半幅 = max(18, w*0.06)
  const half = Math.max(18, w * 0.06);
  const baseCx = tip[0] * 0.3;
  const baseCy = tip[1] * 0.3;
  // 進行方向に垂直なベクトル(-dirY, dirX)
  const b1: [number, number] = [baseCx - dirY * half, baseCy + dirX * half];
  const b2: [number, number] = [baseCx + dirY * half, baseCy - dirX * half];

  const drawTail = (withStroke: boolean) => {
    g.poly([b1[0], b1[1], tip[0], tip[1], b2[0], b2[1]]);
    g.fill({ color: fill });
    if (withStroke) g.stroke({ color: lineColor, width: lineWidth, join: "round" });
  };

  // ① しっぽ(fill + stroke)
  drawTail(true);

  // ② 本体(fill + stroke)
  drawBody(g, el);

  // ③ しっぽを本体fill色で上塗り(本体側の線を消す)
  drawTail(false);
}

function drawBody(g: Graphics, el: BalloonElement): void {
  const { shape, w, h, fill, lineColor, lineWidth } = el;
  const hw = w / 2;
  const hh = h / 2;

  switch (shape) {
    case "round": {
      const r = Math.min(w, h) * 0.22;
      g.roundRect(-hw, -hh, w, h, r);
      g.fill({ color: fill });
      g.stroke({ color: lineColor, width: lineWidth, join: "round" });
      break;
    }
    case "cloud": {
      // こぶ円を本体楕円の輪郭沿いに fill+stroke で先に描き、
      // 最後に楕円本体を fill のみで上塗り(内側の線を消す)
      const bumps = 10;
      const br = Math.min(hw, hh) * 0.42;
      for (let i = 0; i < bumps; i++) {
        const a = (i / bumps) * Math.PI * 2;
        const cx = Math.cos(a) * (hw - br * 0.5);
        const cy = Math.sin(a) * (hh - br * 0.5);
        g.circle(cx, cy, br);
        g.fill({ color: fill });
        g.stroke({ color: lineColor, width: lineWidth, join: "round" });
      }
      g.ellipse(0, 0, hw, hh);
      g.fill({ color: fill });
      break;
    }
    case "spike": {
      // 16頂点の星形(外接 hw,hh、内側 ×0.78)
      const spikes = 16;
      const pts: number[] = [];
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 === 0 ? 1 : 0.78;
        pts.push(Math.cos(a) * hw * rad, Math.sin(a) * hh * rad);
      }
      g.poly(pts);
      g.fill({ color: fill });
      g.stroke({ color: lineColor, width: lineWidth, join: "round" });
      break;
    }
  }
}
