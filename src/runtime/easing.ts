export type EasingName =
  | "linear"
  | "sineInOut"
  | "quadIn"
  | "quadOut"
  | "quadInOut"
  | "backOut"
  | "bounceOut";

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  quadIn: (t) => t * t,
  quadOut: (t) => 1 - (1 - t) * (1 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  backOut: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  bounceOut: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export function ease(name: EasingName | undefined, t: number): number {
  return (EASINGS[name ?? "linear"] ?? EASINGS.linear)(t);
}
