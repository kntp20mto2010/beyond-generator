#!/usr/bin/env python3
"""緑マスク画像から、緑領域 + 周囲の部屋レイアウト context を crop して 2nd 参照を作る。

なぜ:
    Codex cleanup タスクで「机がどう配置されていたか・どの角度で見ているか」の
    grounding 情報を 2 つ目の参照画像で渡す。前段で生成した緑マスク (例
    sakura-study-desk-front-mask-r1-20260622.png 1920×1080) をそのまま渡すと
    トークンが重い (~2800 tok)。一方 PIL downscale すると緑境界が粗くなり、
    Codex が 3D pose (角度) を読み取れなくなり、結果が input と別物になる
    (2026-06-22 desk 実証: aspect 数値は近くても angle が崩れる)。

    解決策: 実寸大のまま緑領域の周囲だけを crop する。緑シルエットの境界精度を
    保ったまま、周辺コンテキスト (壁・床・隣家具・ラグ) も適度に含む。

使い方:
    python3 scripts/crop-mask-with-roomctx.py <input-mask.png> <output.png> [--margin-ratio 0.30]

オプション:
    --margin-ratio R   緑領域の bbox 各軸 × R を四方マージンとして含める (default 0.30)
                       canvas からはみ出す分は自動的にクランプする
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path, help="緑マスク PNG (例 assets/generated/sakura-<obj>-mask.png)")
    p.add_argument("output", type=Path, help="crop 結果の出力先 (2nd 参照として Codex に渡す)")
    p.add_argument(
        "--margin-ratio",
        type=float,
        default=0.30,
        help="緑領域 bbox 各軸 × R 分を四方マージンに足す (default 0.30 = 周囲 30%%)",
    )
    p.add_argument(
        "--green-tolerance",
        type=int,
        default=80,
        help="緑判定: G - max(R,B) >= 該当値 なら緑 (default 80)",
    )
    args = p.parse_args()

    im = Image.open(args.input).convert("RGB")
    arr = np.array(im).astype(int)
    g_mask = (arr[..., 1] - np.maximum(arr[..., 0], arr[..., 2])) >= args.green_tolerance
    if not g_mask.any():
        print(f"error: no green pixels in {args.input}", file=sys.stderr)
        return 1

    ys, xs = np.where(g_mask)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    bw, bh = x1 - x0 + 1, y1 - y0 + 1

    W, H = im.size
    mx = int(round(bw * args.margin_ratio))
    my = int(round(bh * args.margin_ratio))
    cx0 = max(0, x0 - mx)
    cy0 = max(0, y0 - my)
    cx1 = min(W, x1 + 1 + mx)
    cy1 = min(H, y1 + 1 + my)

    crop = im.crop((cx0, cy0, cx1, cy1))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    crop.save(args.output, optimize=True)

    cw, ch = crop.size
    print(f"in       : {args.input} ({W}x{H})")
    print(f"out      : {args.output}")
    print(f"green box: ({x0},{y0})-({x1},{y1}) size {bw}x{bh}")
    print(f"margin   : x={mx} y={my} (ratio={args.margin_ratio})")
    print(f"crop box : ({cx0},{cy0})-({cx1},{cy1}) size {cw}x{ch}")
    print(f"px ratio : {cw*ch} / {W*H} = {cw*ch/(W*H)*100:.1f}% of input")
    return 0


if __name__ == "__main__":
    sys.exit(main())
