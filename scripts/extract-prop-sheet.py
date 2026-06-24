#!/usr/bin/env python3
"""マゼンタ背景のプロップシートを列ギャップで個別プロップに分割し、各々を
マゼンタ chroma-key + despill + tight-crop で透過 PNG に切り出す。

各プロップは横方向にマゼンタ余白で分離されている前提 (extract-prop-sheet 用に生成)。
左→右の順に --names で与えた名前で assets/objects/<prefix>-<name>-<view>.png に保存。

usage:
    extract-prop-sheet.py sheet.png --names tree,bush,bench,stairs,lamp \
        --prefix riverside --view front [--tol 60] [--pad 8] [--min-gap 24] [--min-width 24]
"""
from __future__ import annotations

import argparse

import numpy as np
from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("inp")
    ap.add_argument("--outdir", default="assets/objects")
    ap.add_argument("--prefix", default="riverside")
    ap.add_argument("--view", default="front")
    ap.add_argument("--names", required=True, help="カンマ区切り 左→右 のプロップ名")
    ap.add_argument("--tol", type=int, default=60, help="マゼンタ判定 chroma 閾値")
    ap.add_argument("--pad", type=int, default=8)
    ap.add_argument("--min-gap", type=int, default=24, help="プロップ間ギャップとみなす最小連続マゼンタ列数")
    ap.add_argument("--min-width", type=int, default=24, help="これ未満幅のセグメントはノイズとして無視")
    ap.add_argument("--dry-run", action="store_true", help="分割結果だけ表示して保存しない")
    a = ap.parse_args()
    names = [n.strip() for n in a.names.split(",")]

    arr = np.array(Image.open(a.inp).convert("RGBA")).astype(int)
    R, G, B = arr[..., 0], arr[..., 1], arr[..., 2]
    chroma = np.minimum(R, B) - G  # マゼンタらしさ
    fg = chroma < a.tol  # 前景 = マゼンタでない
    colfg = fg.any(axis=0)  # 列ごとに前景があるか

    # 連続前景列を 1 セグメントに。min_gap 未満のギャップは同一プロップとして連結。
    segs: list[list[int]] = []
    x, W = 0, len(colfg)
    while x < W:
        if colfg[x]:
            x0 = x
            while x < W and colfg[x]:
                x += 1
            if segs and x0 - segs[-1][1] < a.min_gap:
                segs[-1][1] = x
            else:
                segs.append([x0, x])
        else:
            x += 1
    segs = [s for s in segs if s[1] - s[0] >= a.min_width]

    print(f"segments: {len(segs)} (expected {len(names)})")
    for i, (x0, x1) in enumerate(segs):
        nm = names[i] if i < len(names) else f"prop{i}"
        print(f"  [{i}] x {x0}..{x1} w={x1 - x0}  -> {nm}")
    if len(segs) != len(names):
        print("WARN: セグメント数と名前数が不一致。--min-gap/--min-width を調整するか名前を見直す。")
    if a.dry_run:
        return 0

    for i, (x0, x1) in enumerate(segs):
        nm = names[i] if i < len(names) else f"prop{i}"
        sub = arr[:, x0:x1, :].copy()
        sR, sB, sG = sub[..., 0], sub[..., 2], sub[..., 1]
        sch = np.minimum(sR, sB) - sG
        sbg = sch >= a.tol
        sub[..., 3] = np.where(sbg, 0, 255)
        # despill: 前景に乗ったマゼンタかぶり (G が落ちた画素) を min(R,B) まで引き上げ
        spill = (~sbg) & (sch > 0)
        sub[..., 1] = np.where(spill, np.minimum(sR, sB), sG)
        res = Image.fromarray(np.clip(sub, 0, 255).astype(np.uint8), "RGBA")
        # alpha で tight-crop
        al = np.array(res)[..., 3]
        ys, xs = np.where(al > 16)
        if len(xs):
            bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max(), ys.max()
            p = a.pad
            res = res.crop((max(0, bx0 - p), max(0, by0 - p),
                            min(res.width, bx1 + 1 + p), min(res.height, by1 + 1 + p)))
        out = f"{a.outdir}/{a.prefix}-{nm}-{a.view}.png"
        res.save(out)
        print(f"  saved {out}  {res.size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
