#!/usr/bin/env python3
"""
家具 PNG の底面 footprint 下に楕円シャドウ PNG を生成する。

L1b 家具(desk, chair, wardrobe など)で元 PNG に明確なグレー drop shadow が
描かれていない場合に、人工的に楕円シャドウを別レイヤとして用意する。

入力 PNG の bottom 10% の非透明ピクセル領域から footprint 幅を推定し、
その下に soft 楕円(radial alpha falloff)を描画。出力は入力と同じサイズの
透過 PNG。レンダ時に本体と同じ anchor (0.5, 1) で重ねれば足元に正しく入る。

使い方:
    python3 scripts/gen-ellipse-shadow.py INPUT OUT_SHADOW [--options]

オプション:
    --width-mul F       楕円幅 = footprint 幅 × このマルチプライヤ(既定 1.1)
    --height-ratio F    楕円高さ = 画像高さ × 比率(既定 0.05)。または --height-px で固定 px 指定
    --height-px N       楕円高さ(px 固定)。指定時は --height-ratio を上書き
    --max-alpha N       楕円中心の最大 alpha(既定 90、0-255)
    --y-offset N        楕円中心の y を画像下端から上に N px(既定 0 = ellipse の下半分がクリップされ、上半分だけ見える)
    --color R,G,B       楕円の RGB(既定 0,0,0)
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("Pillow + numpy が必要です: pip install pillow numpy", file=sys.stderr)
    sys.exit(2)


def gen_shadow(input_path: Path, out_path: Path,
               width_mul: float, height_ratio: float, height_px: int | None,
               max_alpha: int, y_offset: int, color: tuple[int, int, int]) -> None:
    im = Image.open(input_path).convert("RGBA")
    W, H = im.size
    arr = np.array(im)

    # footprint: 画像下部 10% に存在する非透明ピクセルの横方向範囲
    bottom = arr[int(H * 0.90):]
    op = bottom[:, :, 3] > 64
    xs = np.where(op.any(axis=0))[0]
    if len(xs) == 0:
        print(f"WARN: {input_path}: bottom 10% に非透明ピクセル無し、footprint 推定失敗", file=sys.stderr)
        return
    foot_left = int(xs.min())
    foot_right = int(xs.max())
    foot_width = foot_right - foot_left
    foot_cx = (foot_left + foot_right) // 2

    ell_w = max(20, int(foot_width * width_mul))
    if height_px is not None:
        ell_h = height_px
    else:
        ell_h = max(10, int(H * height_ratio))

    # 楕円中心: y_offset=0 のとき下端に接する(楕円の上半分のみ可視)
    cy = H - y_offset - ell_h // 4
    cx = foot_cx

    # radial alpha falloff: norm < 1 が楕円内部
    yy, xx = np.ogrid[:H, :W]
    norm_x = (xx - cx) / max(1, ell_w / 2)
    norm_y = (yy - cy) / max(1, ell_h / 2)
    radial = norm_x * norm_x + norm_y * norm_y
    inside = radial <= 1.0
    # 中心 alpha=max_alpha、エッジで 0
    alpha = np.clip(max_alpha * (1.0 - radial), 0, 255).astype(np.uint8)

    canvas = np.zeros((H, W, 4), dtype=np.uint8)
    canvas[..., 0] = color[0]
    canvas[..., 1] = color[1]
    canvas[..., 2] = color[2]
    canvas[..., 3] = np.where(inside, alpha, 0)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(canvas, "RGBA").save(out_path)
    on = int(canvas[..., 3].astype(bool).sum())
    print(f"{input_path} ({W}x{H}) -> {out_path} (footprint x={foot_left}..{foot_right} w={foot_width}, ellipse {ell_w}x{ell_h} cy={cy}, opaque px={on})")


def main() -> None:
    ap = argparse.ArgumentParser(description="家具 PNG の底面下に人工楕円シャドウを生成")
    ap.add_argument("input", type=Path, help="入力 PNG パス")
    ap.add_argument("output", type=Path, help="出力影 PNG パス")
    ap.add_argument("--width-mul", type=float, default=1.1, help="楕円幅 = footprint × このマルチプライヤ(既定 1.1)")
    ap.add_argument("--height-ratio", type=float, default=0.05, help="楕円高さ = 画像高さ × 比率(既定 0.05)")
    ap.add_argument("--height-px", type=int, help="楕円高さ px 指定(--height-ratio を上書き)")
    ap.add_argument("--max-alpha", type=int, default=90, help="中心 alpha(既定 90、0-255)")
    ap.add_argument("--y-offset", type=int, default=0, help="楕円中心 y を下端から N px 上(既定 0)")
    ap.add_argument("--color", type=str, default="0,0,0", help="楕円 RGB(既定 0,0,0)")
    args = ap.parse_args()
    color = tuple(int(c) for c in args.color.split(","))
    if len(color) != 3:
        print("--color は R,G,B 形式", file=sys.stderr)
        sys.exit(1)
    gen_shadow(args.input, args.output, args.width_mul, args.height_ratio, args.height_px,
               args.max_alpha, args.y_offset, color)  # type: ignore[arg-type]


if __name__ == "__main__":
    main()
