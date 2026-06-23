#!/usr/bin/env python3
"""クロマキー: 単色ベタ背景 (緑 #00FF00 / マゼンタ #FF00FF) を抜いて透過 PNG にする。

背景=チェッカー (明るいグレー/白) だと strip-fake-transparency で家具の明色 (cream/白) を
食ったり残渣が出る。背景を「家具に出ない単色」にして Codex に出させ、ここで chroma key すれば
残渣なくスパッと抜ける (KEN 提案, 2026-06-24)。

- green   : G - max(R,B) >= tol を背景とみなす。家具に緑 (植物/緑クッション/緑本) があると食う。
- magenta : min(R,B) - G >= tol を背景。家具にマゼンタはほぼ無いので汎用的に安全。

despill: 前景の縁に乗った背景色かぶり (緑かぶり/マゼンタかぶり) を中和する。

usage:
    key-chroma-bg.py inp out [--color green|magenta] [--tol N] [--tight-crop] [--pad N] [--no-despill]
"""
from __future__ import annotations

import argparse

import numpy as np
from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("inp")
    ap.add_argument("out")
    ap.add_argument("--color", choices=["green", "magenta"], default="green")
    ap.add_argument("--tol", type=int, default=60, help="背景判定の chroma 閾値")
    ap.add_argument("--tight-crop", action="store_true")
    ap.add_argument("--pad", type=int, default=4)
    ap.add_argument("--no-despill", action="store_true")
    a = ap.parse_args()

    im = Image.open(a.inp).convert("RGBA")
    arr = np.array(im).astype(int)
    R, G, B = arr[..., 0], arr[..., 1], arr[..., 2]

    if a.color == "green":
        chroma = G - np.maximum(R, B)            # 緑らしさ
    else:  # magenta
        chroma = np.minimum(R, B) - G            # マゼンタらしさ

    bg = chroma >= a.tol
    out = arr.copy()
    out[..., 3] = np.where(bg, 0, 255)

    if not a.no_despill:
        fg = ~bg
        if a.color == "green":
            # 前景で G が突出している画素 (緑かぶり) を max(R,B) にクランプ
            spill = fg & (chroma > 0)
            out[..., 1] = np.where(spill, np.maximum(R, B), G)
        else:
            # マゼンタかぶり: G が落ち込んだ画素を min(R,B) まで引き上げ
            spill = fg & (chroma > 0)
            out[..., 1] = np.where(spill, np.minimum(R, B), G)

    out = np.clip(out, 0, 255).astype(np.uint8)
    res = Image.fromarray(out, "RGBA")

    if a.tight_crop:
        al = np.array(res)[..., 3]
        ys, xs = np.where(al > 16)
        if len(xs):
            x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
            p = a.pad
            res = res.crop((max(0, x0 - p), max(0, y0 - p), min(res.width, x1 + 1 + p), min(res.height, y1 + 1 + p)))

    res.save(a.out)
    rem = int(bg.sum())
    print(f"out: {a.out}  color={a.color} tol={a.tol}  removed {rem}/{bg.size} ({100 * rem / bg.size:.1f}%)  size {res.size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
