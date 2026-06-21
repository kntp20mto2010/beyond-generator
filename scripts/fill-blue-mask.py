#!/usr/bin/env python3
"""透過 PNG 内の青マスク領域を、画像の主色 (青以外で最頻 or 平均色) で埋める。

家具切り抜き後の silhouette 抉れ補完用。
Codex に「抉れ部分を青塗りせよ」と依頼した出力を input にして、
青領域を周辺色で埋めて clean な silhouette PNG にする。

usage:
    python3 scripts/fill-blue-mask.py <input.png> <output.png>
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
    p.add_argument("input", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument(
        "--blue-tolerance",
        type=int,
        default=80,
        help="青判定: B - max(R,G) >= 該当値 なら青 (default=80)",
    )
    p.add_argument(
        "--fill-mode",
        choices=["sage-avg", "neighbor-color", "local-median"],
        default="local-median",
        help="埋める色: local-median=青 bbox 周辺の非青/非透明 pixel の中央値 (推奨)、sage-avg=画像内の緑寄り pixel の平均、neighbor-color=最寄り非青 (default=local-median)",
    )
    p.add_argument(
        "--local-pad",
        type=int,
        default=15,
        help="local-median モードで青 bbox 周辺を何 px 拡張して median を取るか (default=15)",
    )
    args = p.parse_args()

    img = Image.open(args.input).convert("RGBA")
    arr = np.array(img)
    rgb = arr[..., :3].astype(int)
    alpha = arr[..., 3]

    blue_mask = (rgb[..., 2] - np.maximum(rgb[..., 0], rgb[..., 1])) >= args.blue_tolerance
    if not blue_mask.any():
        print("info: no blue pixels, copying input as-is", file=sys.stderr)
        img.save(args.output, "PNG")
        return 0

    not_blue = ~blue_mask & (alpha > 0)

    if args.fill_mode == "local-median":
        # 青 mask の bbox を local-pad px 拡張、その範囲内の non-blue/non-transparent pixel の中央値を fill 色に
        ys, xs = np.where(blue_mask)
        y0 = max(0, int(ys.min()) - args.local_pad)
        y1 = min(arr.shape[0], int(ys.max()) + args.local_pad + 1)
        x0 = max(0, int(xs.min()) - args.local_pad)
        x1 = min(arr.shape[1], int(xs.max()) + args.local_pad + 1)
        region_rgb = rgb[y0:y1, x0:x1]
        region_alpha = alpha[y0:y1, x0:x1]
        region_blue = (region_rgb[..., 2] - np.maximum(region_rgb[..., 0], region_rgb[..., 1])) >= args.blue_tolerance
        region_not_blue = ~region_blue & (region_alpha > 0)
        if not region_not_blue.any():
            print("error: no non-blue pixels in local bbox; falling back to image-wide median", file=sys.stderr)
            sample = rgb[not_blue]
        else:
            sample = region_rgb[region_not_blue]
        fill_color = np.median(sample, axis=0).astype(np.uint8)
        print(f"fill: local-median = RGB{tuple(int(c) for c in fill_color)} (from {len(sample)} non-blue px in bbox+{args.local_pad}px)")
        arr_out = arr.copy()
        arr_out[blue_mask, 0] = fill_color[0]
        arr_out[blue_mask, 1] = fill_color[1]
        arr_out[blue_mask, 2] = fill_color[2]
        arr_out[blue_mask, 3] = 255
    elif args.fill_mode == "sage-avg":
        # 緑寄り pixel (G が他より高め) の平均色を取得
        green_dominant = not_blue & ((rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])) > 10)
        if green_dominant.any():
            fill_color = rgb[green_dominant].mean(axis=0).astype(np.uint8)
        else:
            # フォールバック: non-blue 全体の平均
            fill_color = rgb[not_blue].mean(axis=0).astype(np.uint8)
        print(f"fill: sage-avg = RGB{tuple(int(c) for c in fill_color)} (from {int(green_dominant.sum())} green-dominant px)")
        arr_out = arr.copy()
        arr_out[blue_mask, 0] = fill_color[0]
        arr_out[blue_mask, 1] = fill_color[1]
        arr_out[blue_mask, 2] = fill_color[2]
        arr_out[blue_mask, 3] = 255
    else:
        # neighbor-color: 各青 pixel の最寄り非青 pixel の色を採用 (簡易: y 軸方向に最寄りを探す)
        arr_out = arr.copy()
        h, w = blue_mask.shape
        for y in range(h):
            for x in range(w):
                if not blue_mask[y, x]:
                    continue
                # x 方向で最寄り非青を探す
                found = None
                for dx in range(1, w):
                    if x - dx >= 0 and not_blue[y, x - dx]:
                        found = rgb[y, x - dx]
                        break
                    if x + dx < w and not_blue[y, x + dx]:
                        found = rgb[y, x + dx]
                        break
                if found is not None:
                    arr_out[y, x, :3] = found
                    arr_out[y, x, 3] = 255
        print("fill: neighbor-color (per-pixel x-axis nearest)")

    img_out = Image.fromarray(arr_out, "RGBA")
    img_out.save(args.output, "PNG")

    # 結果サイズ + cells 報告 (catalog 用)
    w0, h0 = img_out.size
    cells_w = math.ceil(w0 / PX_PER_CELL)
    cells_h = math.ceil(h0 / PX_PER_CELL)
    print(f"input    : {args.input}")
    print(f"output   : {args.output}")
    print(f"size     : {w0}x{h0}")
    print(f"cells    : {cells_w}x{cells_h}  (= ceil(size / {PX_PER_CELL}))")
    print(f"blue_px  : {int(blue_mask.sum())} (filled)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
