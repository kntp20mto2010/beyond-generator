#!/usr/bin/env python3
"""moodboard ベース生成 PNG から家具領域を bbox 検出して crop。

Codex の透過 PNG 出力は実際にはチェッカー背景込み不透明であることが多い。
そのため alpha チャンネル直読みではなく、四隅から floodfill で背景つながり
の near-uniform 色 pixel を alpha=0 化してから bbox 取得 + crop する。

PX_PER_CELL=300 規約で cells 数 (ceil) を算出して報告する。
catalog 登録時の nativeW/nativeH/cells はこのスクリプトの出力をそのまま使う。

usage:
    python scripts/crop-alpha-bbox.py <input.png> <output.png>
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image

PX_PER_CELL = 300


def chromakey_grayscale_bg_to_alpha(
    img: Image.Image,
    min_brightness: int,
    max_saturation: int,
) -> Image.Image:
    """「明るくて彩度低い (= near-white grayscale)」pixel を alpha=0 に。

    Codex の透過 PNG 出力はチェッカー背景込み不透明であることが多い (背景は
    near-white の 2 色グレー互い違い)。floodfill は色拡張できないので grayscale
    chromakey で対応。cream pillow など彩度のある near-white は max_saturation で
    保持される。
    """
    rgba = img.convert("RGBA")
    w, h = rgba.size
    pixels = bytearray(rgba.tobytes())
    for i in range(0, len(pixels), 4):
        r, g, b = pixels[i], pixels[i + 1], pixels[i + 2]
        mx, mn = max(r, g, b), min(r, g, b)
        if mx >= min_brightness and (mx - mn) < max_saturation:
            pixels[i + 3] = 0
    return Image.frombytes("RGBA", (w, h), bytes(pixels))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument(
        "--alpha-threshold",
        type=int,
        default=10,
        help="bbox 検出時に alpha がこの値未満の pixel は背景扱い (default=10)",
    )
    p.add_argument(
        "--bg-min-brightness",
        type=int,
        default=220,
        help="grayscale chromakey: max(R,G,B) がこの値以上なら背景候補 (default=220)",
    )
    p.add_argument(
        "--bg-max-saturation",
        type=int,
        default=15,
        help="grayscale chromakey: max-min がこの値未満なら無彩色 = 背景 (default=15)",
    )
    p.add_argument(
        "--flip-h",
        action="store_true",
        help="保存前に左右反転 (右壁オリエント家具を catalog の左壁オリエントに揃える時に使う)",
    )
    args = p.parse_args()

    img = Image.open(args.input).convert("RGBA")
    alpha = img.split()[-1]
    hist = alpha.histogram()
    total = sum(hist)
    transparent_ratio = hist[0] / total if total else 0
    # alpha=0 pixel が殆ど無い場合 = 不透明 PNG とみなして grayscale chromakey
    if transparent_ratio < 0.05:
        print(f"info   : alpha mostly opaque (transparent={transparent_ratio:.1%}); applying grayscale-bg chromakey")
        img = chromakey_grayscale_bg_to_alpha(img, args.bg_min_brightness, args.bg_max_saturation)
        alpha = img.split()[-1]
    bbox = alpha.point(lambda v: 255 if v >= args.alpha_threshold else 0).getbbox()
    if bbox is None:
        print("error: bbox empty after bg removal", file=sys.stderr)
        return 1

    cropped = img.crop(bbox)
    if args.flip_h:
        cropped = cropped.transpose(Image.FLIP_LEFT_RIGHT)
    w, h = cropped.size
    cells_w = math.ceil(w / PX_PER_CELL)
    cells_h = math.ceil(h / PX_PER_CELL)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(args.output, "PNG")

    print(f"input  : {args.input}")
    print(f"output : {args.output}")
    print(f"bbox   : {bbox}")
    print(f"native : {w}x{h}")
    print(f"cells  : {cells_w}x{cells_h}  (= ceil(native / {PX_PER_CELL}))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
