import type { CharacterDoc, StrandPhysics } from "../core/schema/character.js";
import type { Shape, Vec2 } from "../core/schema/geometry.js";
import { apply, mul, rotationDeg, translation, type Mat2D } from "./mat2d.js";

// === チューニング定数(視覚調整はここに集約) ===
const SUBSTEP = 1 / 120;
const K_MIN = 25;
const K_MAX = 230; // stiffness 0..1 → ばね定数 [rad/s^2 per rad]
const DAMP_CRIT_RATIO = 1.5; // damping 1.0 で臨界減衰の0.75倍(揺れ残りを許す)
const INERTIA_GAIN = 1.1; // ピン加速度の結合
const DRAG_GAIN = 3.2; // 速度抗力(等速移動でなびく成分)
const GRAVITY = 1600; // u/s^2
const SEG2_K_FACTOR = 1.7;
const SEG2_INPUT = 0.6; // 1節目の角加速度→2節目への入力
const MAX_SHEAR = 0.65; // 先端しなりのtanクランプ
const MAX_FRAME_DT = 1 / 15; // 巨大dtの暴発防止

function shapesBounds(shapes: readonly Shape[]): { cx: number; cy: number; far: number; pin: Vec2 } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  for (const s of shapes) {
    switch (s.kind) {
      case "rect": extend(s.x, s.y); extend(s.x + s.w, s.y + s.h); break;
      case "ellipse": extend(s.cx - s.rx, s.cy - s.ry); extend(s.cx + s.rx, s.cy + s.ry); break;
      case "polygon": for (const p of s.points) extend(p[0], p[1]); break;
      case "path":
        for (const c of s.d) {
          if (c.c === "Z") continue;
          extend(c.p[0], c.p[1]);
          if (c.c === "Q") extend(c.cp[0], c.cp[1]);
          if (c.c === "C") { extend(c.cp1[0], c.cp1[1]); extend(c.cp2[0], c.cp2[1]); }
        }
        break;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, far: Math.hypot(maxX - minX, maxY - minY) / 2, pin: [0, 0] };
}

interface StrandSim {
  key: string;
  pin: Vec2; // キャラ空間
  restDir: Vec2; // 単位ベクトル(キャラ空間、根元→重心)
  length: number; // 振り子長 [u]
  params: StrandPhysics;
  k: number;
  c: number;
  theta1: number;
  omega1: number;
  theta2: number;
  omega2: number;
}

export class HairSimulator {
  #strands: StrandSim[] = [];
  #prevPin: Map<string, Vec2> = new Map();
  #prevVel: Map<string, Vec2> = new Map();
  #acc = 0; // サブステップ積算

  constructor(char: CharacterDoc) {
    for (const layer of ["back", "mid", "front"] as const) {
      char.hair[layer].forEach((strand, i) => {
        const b = shapesBounds(strand.shapes);
        const pin = strand.pin;
        let dir: Vec2 = [0, 1];
        let length = 40;
        if (b) {
          const dx = b.cx - pin[0];
          const dy = b.cy - pin[1];
          const d = Math.hypot(dx, dy);
          if (d > 1) dir = [dx / d, dy / d];
          length = Math.max(20, d + b.far * 0.5);
        }
        const k = K_MIN + (K_MAX - K_MIN) * strand.physics.stiffness;
        const c = strand.physics.damping * DAMP_CRIT_RATIO * Math.sqrt(k);
        this.#strands.push({
          key: `hair:${layer}:${i}`,
          pin,
          restDir: dir,
          length,
          params: strand.physics,
          k,
          c,
          theta1: 0,
          omega1: 0,
          theta2: 0,
          omega2: 0,
        });
      });
    }
  }

  reset(): void {
    for (const s of this.#strands) {
      s.theta1 = 0; s.omega1 = 0; s.theta2 = 0; s.omega2 = 0;
    }
    this.#prevPin.clear();
    this.#prevVel.clear();
    this.#acc = 0;
  }

  // headMatrix: キャラ空間→ワールドのデカール行列(W_head ∘ T(-origin))
  // extraVelocity: その場アニメ用の仮想移動速度 [u/s](トレッドミル)
  step(headMatrix: Mat2D, frameDt: number, extraVelocity: Vec2 = [0, 0]): void {
    const dt = Math.min(frameDt, MAX_FRAME_DT);
    if (dt <= 0) return;

    // フレーム単位でピンの速度・加速度を見積もり、サブステップでは一定とみなす
    const inputs = this.#strands.map((s) => {
      const p = apply(headMatrix, s.pin);
      const prev = this.#prevPin.get(s.key);
      const vel: Vec2 = prev ? [(p[0] - prev[0]) / dt, (p[1] - prev[1]) / dt] : [0, 0];
      const pv = this.#prevVel.get(s.key);
      const acc: Vec2 = pv ? [(vel[0] - pv[0]) / dt, (vel[1] - pv[1]) / dt] : [0, 0];
      this.#prevPin.set(s.key, p);
      this.#prevVel.set(s.key, vel);
      return { vel, acc };
    });

    const headRot = Math.atan2(headMatrix.b, headMatrix.a);

    this.#acc += dt;
    while (this.#acc >= SUBSTEP) {
      this.#acc -= SUBSTEP;
      this.#strands.forEach((s, idx) => {
        const input = inputs[idx];
        if (!input) return;
        const inertia = s.params.inertia;

        // 現在のワールド方向 = restDir を (headRot + θ1) 回転(+θ=時計回り規約)
        const ang = headRot + s.theta1;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const d: Vec2 = [
          s.restDir[0] * cosA - s.restDir[1] * sinA,
          s.restDir[0] * sinA + s.restDir[1] * cosA,
        ];
        // +θ方向の接線 t̂ = R(90°)·d = (-d_y, d_x)
        const tx = -d[1];
        const ty = d[0];

        // 合力(ワールド): 慣性(-a) + 抗力(-v) + 重力
        const vx = input.vel[0] + extraVelocity[0];
        const vy = input.vel[1] + extraVelocity[1];
        const f: Vec2 = [
          -input.acc[0] * inertia * INERTIA_GAIN - vx * inertia * DRAG_GAIN,
          -input.acc[1] * inertia * INERTIA_GAIN - vy * inertia * DRAG_GAIN + s.params.gravity * GRAVITY,
        ];
        // 接線方向トルク: (f·t̂) / L
        const torque = (f[0] * tx + f[1] * ty) / s.length;

        const alpha1 = torque - s.k * s.theta1 - s.c * s.omega1;
        s.omega1 += alpha1 * SUBSTEP;
        s.theta1 += s.omega1 * SUBSTEP;

        const maxA = (s.params.maxAngle * Math.PI) / 180;
        if (s.theta1 > maxA) { s.theta1 = maxA; s.omega1 *= -0.2; }
        else if (s.theta1 < -maxA) { s.theta1 = -maxA; s.omega1 *= -0.2; }

        if (s.params.segments >= 2) {
          const k2 = s.k * SEG2_K_FACTOR;
          const c2 = s.params.damping * DAMP_CRIT_RATIO * Math.sqrt(k2);
          const alpha2 = -k2 * s.theta2 - c2 * s.omega2 - alpha1 * SEG2_INPUT;
          s.omega2 += alpha2 * SUBSTEP;
          s.theta2 += s.omega2 * SUBSTEP;
          const maxA2 = maxA * 0.8;
          if (s.theta2 > maxA2) { s.theta2 = maxA2; s.omega2 *= -0.2; }
          else if (s.theta2 < -maxA2) { s.theta2 = -maxA2; s.omega2 *= -0.2; }
        }
      });
    }
  }

  // キャラ空間でのストランド変形行列(ピン周りの回転 + レスト軸シアー)
  getDeforms(): Map<string, Mat2D> {
    const REST_EPS = 0.002; // 視認不能な微小角(重力平衡の残差)は出力しない
    const out = new Map<string, Mat2D>();
    for (const s of this.#strands) {
      if (Math.abs(s.theta1) < REST_EPS && Math.abs(s.theta2) < REST_EPS) continue;
      const deg1 = (s.theta1 * 180) / Math.PI;
      let m = rotationDeg(deg1);
      if (s.params.segments >= 2 && s.theta2 !== 0) {
        const shear = Math.max(-MAX_SHEAR, Math.min(MAX_SHEAR, Math.tan(s.theta2)));
        // レスト方向を+yに揃えた座標系で x' = x + shear*y
        const rho = (Math.atan2(s.restDir[0], s.restDir[1]) * 180) / Math.PI;
        const sh: Mat2D = { a: 1, b: 0, c: shear, d: 1, tx: 0, ty: 0 };
        m = mul(m, mul(rotationDeg(-rho), mul(sh, rotationDeg(rho))));
      }
      out.set(
        s.key,
        mul(translation(s.pin[0], s.pin[1]), mul(m, translation(-s.pin[0], -s.pin[1]))),
      );
    }
    return out;
  }
}
