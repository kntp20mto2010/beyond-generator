#!/usr/bin/env python3
"""透過 PNG の輪郭を smooth にする。RGB は変更せず alpha のみ修正。

モード:
- shape (default): Gaussian blur + threshold で binary な smooth shape。
  シルエット形状そのものの段差/凹凸を削って曲線化する。alpha は binary のまま。
- aa: Gaussian blur のみで anti-aliased な soft edge。形状は変わらず、
  境界 pixel が半透明になる。

用途: OCCLUDERS: none + silhouette 完全可視 で Codex cleanup を
スキップした applied PNG の輪郭整形。
"""
import argparse
from PIL import Image, ImageFilter


def main():
    p = argparse.ArgumentParser()
    p.add_argument("inp")
    p.add_argument("out")
    p.add_argument(
        "--mode",
        choices=["shape", "aa"],
        default="shape",
        help="shape=blur+threshold で形を smooth (default), aa=blur のみで半透明 anti-alias",
    )
    p.add_argument(
        "--blur-radius",
        type=float,
        default=1.5,
        help="alpha に適用する Gaussian blur 半径 (default=1.5、大きいほど形が削れる)",
    )
    p.add_argument(
        "--threshold",
        type=int,
        default=128,
        help="shape mode の binarize 閾値 (default=128)",
    )
    args = p.parse_args()

    img = Image.open(args.inp).convert("RGBA")
    alpha = img.split()[3]

    blurred = alpha.filter(ImageFilter.GaussianBlur(radius=args.blur_radius))
    if args.mode == "shape":
        thr = args.threshold
        smoothed = blurred.point(lambda v: 255 if v > thr else 0)
    else:
        smoothed = blurred

    out = img.copy()
    out.putalpha(smoothed)
    out.save(args.out)

    hist = smoothed.histogram()
    semi = sum(hist[1:255])
    total = sum(hist)
    print(f"in       : {args.inp}")
    print(f"out      : {args.out}")
    print(f"size     : {img.size}")
    print(f"mode     : {args.mode}")
    print(f"blur     : {args.blur_radius}")
    if args.mode == "shape":
        print(f"threshold: {args.threshold}")
    print(f"semi-alpha after: {semi}/{total} = {100 * semi / total:.1f}%")


if __name__ == "__main__":
    main()
