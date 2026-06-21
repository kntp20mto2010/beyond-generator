#!/usr/bin/env python3
"""moodboard 原画 + Codex 緑マスク画像から、緑領域を切り抜いて透過 PNG を生成。

Codex 単体生成だと cabinet bias で pose/形状が崩れる家具向け。
Codex には「moodboard 部屋全体を保持 + 該当家具位置だけ緑塗り」を依頼し、
出力された緑マスクで moodboard 原画から該当領域を切り抜く。
結果は pose/内容 100% moodboard 一致。

usage:
    python3 scripts/apply-green-mask.py <moodboard.png> <mask.png> <output.png> [--flip-h]
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
    p.add_argument("moodboard", type=Path, help="原画 (例 assets/generated/sakura-room-ideal-layout-...png)")
    p.add_argument("mask", type=Path, help="Codex 緑マスク画像 (該当家具位置だけ緑塗り版)")
    p.add_argument("output", type=Path)
    p.add_argument(
        "--green-tolerance",
        type=int,
        default=80,
        help="緑判定: G - max(R,B) >= 該当値 なら緑 (default=80)",
    )
    p.add_argument(
        "--exclude-blue",
        action="store_true",
        help="青領域 (B - max(R,G) >= blue-tolerance) を緑マスクから除外 (2 色マスク用、対象の境界を tighten)",
    )
    p.add_argument(
        "--blue-tolerance",
        type=int,
        default=80,
        help="青判定: B - max(R,G) >= 該当値 なら青 (default=80)",
    )
    p.add_argument(
        "--flip-h",
        action="store_true",
        help="保存前に左右反転 (右壁オリエント家具を catalog の左壁オリエントに揃える時)",
    )
    p.add_argument(
        "--padding-ratio",
        type=float,
        default=0.0,
        help="crop 後に透明余白を追加する比率 (= max(cw, ch) * ratio 分を四方に追加)。 "
             "Codex cleanup などの後段で家具を「商品撮影風中央余白」に解釈変換されるのを防ぐ目的で 0.1 等を指定 (default=0.0)",
    )
    args = p.parse_args()

    mb = Image.open(args.moodboard).convert("RGBA")
    mk = Image.open(args.mask).convert("RGB")
    if mb.size != mk.size:
        print(f"error: size mismatch moodboard={mb.size} mask={mk.size}", file=sys.stderr)
        return 1

    mb_a = np.array(mb)  # H x W x 4
    mk_a = np.array(mk).astype(int)  # H x W x 3

    # 緑判定: G - max(R, B) >= tolerance
    g_mask = (mk_a[..., 1] - np.maximum(mk_a[..., 0], mk_a[..., 2])) >= args.green_tolerance

    if args.exclude_blue:
        # 青判定: B - max(R, G) >= tolerance
        b_mask = (mk_a[..., 2] - np.maximum(mk_a[..., 0], mk_a[..., 1])) >= args.blue_tolerance
        # 緑 ∧ ¬青 (青に被ってる緑は除外、対象の境界 tighten)
        g_mask = g_mask & ~b_mask
        print(f"info     : excluded blue pixels from green mask ({int(b_mask.sum())} blue px)")

    if not g_mask.any():
        print("error: no green pixels found in mask", file=sys.stderr)
        return 1

    # 緑領域だけ moodboard pixel + alpha=255、それ以外は (0,0,0,0)
    out_a = np.zeros_like(mb_a)
    out_a[g_mask, :3] = mb_a[g_mask, :3]
    out_a[g_mask, 3] = 255

    # bbox
    ys, xs = np.where(g_mask)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

    full = Image.fromarray(out_a, "RGBA")
    cropped = full.crop(bbox)
    if args.flip_h:
        cropped = cropped.transpose(Image.FLIP_LEFT_RIGHT)
    if args.padding_ratio > 0:
        cw0, ch0 = cropped.size
        pad = int(max(cw0, ch0) * args.padding_ratio)
        canvas = Image.new("RGBA", (cw0 + pad * 2, ch0 + pad * 2), (0, 0, 0, 0))
        canvas.paste(cropped, (pad, pad))
        cropped = canvas
    cw, ch = cropped.size
    cells_w = math.ceil(cw / PX_PER_CELL)
    cells_h = math.ceil(ch / PX_PER_CELL)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(args.output, "PNG")
    print(f"moodboard: {args.moodboard}")
    print(f"mask     : {args.mask}")
    print(f"output   : {args.output}")
    print(f"bbox     : {bbox}")
    print(f"native   : {cw}x{ch}")
    print(f"cells    : {cells_w}x{cells_h}  (= ceil(native / {PX_PER_CELL}))")
    print(f"green_px : {int(g_mask.sum())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
