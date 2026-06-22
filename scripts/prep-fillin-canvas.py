#!/usr/bin/env python3
"""任意サイズの切り抜きを、Codex 補完 (虫食い fill-in) 用に「アスペクト比を保ったまま」整える。

なぜ必要か:
    過去に crop を固定 canonical サイズ (例 1536×1024) へ pad したところ、
    横長ラグ (3.8:1) が 1.5:1 canvas に置かれ、空いた大きな余白を Codex が
    「埋めるべき空間」と解釈してオブジェクトを正方形に描き直す失敗が出た。

対策 (このスクリプト):
    - オブジェクトの alpha bbox を検出
    - 各軸に *比例した* 薄い余白だけを足す → canvas のアスペクト比 ≈ オブジェクトのアスペクト比
    - 余白が薄いので Codex に「埋める空白」が無く、形状を勝手に拡大・正方形化しない
    - Codex には「この出力サイズと完全一致で返せ」と指示する (印字される値を requirements に入れる)

固定 canonical へ寄せないのが肝。Codex 内部 canonical resize による多少の細部劣化より、
アスペクト比崩れ (= 描き直し誘発) の方が致命的なため。

usage:
    python3 scripts/prep-fillin-canvas.py <crop.png> <out.png> [--margin-ratio 0.08] [--even]
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PX_PER_CELL = 300


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("crop", type=Path, help="切り抜き済み透過 PNG (穴あり可)")
    p.add_argument("out", type=Path, help="補完依頼用に整えた透過 PNG の出力先")
    p.add_argument(
        "--margin-ratio",
        type=float,
        default=0.08,
        help="各軸に足す余白の比率 (= bbox 各辺 * ratio)。アスペクト比は保たれる (default=0.08)",
    )
    p.add_argument(
        "--alpha-threshold",
        type=int,
        default=16,
        help="この alpha 超を不透明とみなして bbox を取る (default=16)",
    )
    p.add_argument(
        "--even",
        action="store_true",
        help="出力 W/H を偶数に丸める (一部 encoder 対策)",
    )
    args = p.parse_args()

    im = Image.open(args.crop).convert("RGBA")
    a = np.array(im)[..., 3] > args.alpha_threshold
    if not a.any():
        print("error: no opaque pixels in crop", file=sys.stderr)
        return 1

    ys, xs = np.where(a)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    bw, bh = x1 - x0 + 1, y1 - y0 + 1

    # 各軸比例の余白 = アスペクト比を厳密に保つ
    mx = round(bw * args.margin_ratio)
    my = round(bh * args.margin_ratio)
    cw, ch = bw + 2 * mx, bh + 2 * my
    if args.even:
        cw += cw % 2
        ch += ch % 2

    obj = im.crop((x0, y0, x1 + 1, y1 + 1))
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(obj, ((cw - bw) // 2, (ch - bh) // 2))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.out, "PNG")

    print(f"crop      : {args.crop}")
    print(f"out       : {args.out}")
    print(f"obj bbox  : {bw}x{bh}  aspect={bw/bh:.2f}:1")
    print(f"canvas    : {cw}x{ch}  aspect={cw/ch:.2f}:1  (margin x={mx} y={my})")
    print(f"cells(obj): {math.ceil(bw/PX_PER_CELL)}x{math.ceil(bh/PX_PER_CELL)}")
    print()
    print(f">>> Codex 補完依頼の requirements.width={cw} height={ch} で出し、")
    print(f">>> 「出力サイズは {cw}x{ch} と完全一致・拡大/正方形化 禁止」を最上位ルールに入れること。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
