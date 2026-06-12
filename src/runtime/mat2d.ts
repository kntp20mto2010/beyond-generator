import type { Vec2 } from "../core/schema/geometry.js";

// 2x3アフィン行列。列ベクトル規約: x' = a*x + c*y + tx, y' = b*x + d*y + ty
// y-down座標系のため、正の回転角は画面上で時計回り
export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Mat2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export function translation(x: number, y: number): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y };
}

export function rotationDeg(deg: number): Mat2D {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 };
}

export const MIRROR_X: Mat2D = { a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export function scaling(sx: number, sy: number): Mat2D {
  return { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
}

// mul(A, B) = A ∘ B(Bを先に適用)
export function mul(A: Mat2D, B: Mat2D): Mat2D {
  return {
    a: A.a * B.a + A.c * B.b,
    b: A.b * B.a + A.d * B.b,
    c: A.a * B.c + A.c * B.d,
    d: A.b * B.c + A.d * B.d,
    tx: A.a * B.tx + A.c * B.ty + A.tx,
    ty: A.b * B.tx + A.d * B.ty + A.ty,
  };
}

export function apply(m: Mat2D, v: Vec2): Vec2 {
  return [m.a * v[0] + m.c * v[1] + m.tx, m.b * v[0] + m.d * v[1] + m.ty];
}
