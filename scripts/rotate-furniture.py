#!/usr/bin/env python3
"""
家具 PNG を画像 2D 回転で「左壁/右壁付け」バリアントを作るユーティリティ。

Codex が「ヘッドボードを傾いた壁に立てかける」「長軸を perpendicular に伸ばす」
ような 3D yaw 変更を理解しないので、既存の front-LEFT 3/4 view PNG を
2D で `angle°` 回転して対角構図を作る hack。

L1b フラット規約だと 3D パース不整合は目立たない(角度が浅ければ)。

回転 pivot は **底面の左端**(=ヘッドボード接地点)を既定。回転後に bbox crop。

使い方:
    # 左壁付け: ベッドの場合、ヘッドボード(底面の LEFT 端)を pivot に 20° CCW
    python3 scripts/rotate-furniture.py \
        assets/objects/sakura-bed-pink-single.png \
        assets/objects/sakura-bed-pink-single-leftwall.png \
        --angle 20 --pivot bottom-left

    # 右壁付けは出力先を別にして --pivot bottom-right --angle -20、
    # もしくは左壁版を flip 上書きする(オブジェクトタブの flip ボタン)

オプション:
    --angle DEG       回転角度。CCW を正(既定 20)
    --pivot           pivot 位置("bottom-left" | "bottom-right" | "bottom-center")
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


def find_pivot(arr: np.ndarray, pivot_name: str) -> tuple[int, int]:
    """底面の opaque ピクセル分布から pivot 座標を選ぶ。"""
    op = arr[:, :, 3] > 64
    ys, xs = np.where(op)
    if len(xs) == 0:
        raise SystemExit("opaque ピクセルなし")
    # 底面 5% に注目
    H = arr.shape[0]
    y_floor = int(H * 0.95)
    bottom_mask = (ys >= y_floor)
    if bottom_mask.any():
        xs_bot = xs[bottom_mask]
    else:
        xs_bot = xs  # 底面5%が空なら全体で
    if pivot_name == "bottom-left":
        x = int(xs_bot.min())
    elif pivot_name == "bottom-right":
        x = int(xs_bot.max())
    elif pivot_name == "bottom-center":
        x = int((xs_bot.min() + xs_bot.max()) // 2)
    else:
        raise SystemExit(f"不明な pivot: {pivot_name}")
    y = int(ys.max())
    return (x, y)


def rotate(input_path: Path, output_path: Path, angle: float, pivot_name: str) -> None:
    im = Image.open(input_path).convert("RGBA")
    arr = np.array(im)
    px, py = find_pivot(arr, pivot_name)
    rotated = im.rotate(angle, resample=Image.BICUBIC, center=(px, py), expand=True, fillcolor=(0, 0, 0, 0))
    bbox = rotated.getbbox()
    if bbox is None:
        raise SystemExit("回転後に opaque ピクセルなし")
    cropped = rotated.crop(bbox)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(output_path)
    print(f"{input_path} ({im.size[0]}x{im.size[1]}) "
          f"-> {output_path} ({cropped.size[0]}x{cropped.size[1]}, "
          f"angle={angle}°, pivot={pivot_name}=({px},{py}))")


def main() -> None:
    ap = argparse.ArgumentParser(description="家具 PNG を 2D 回転して壁付けバリアントを作る")
    ap.add_argument("input", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--angle", type=float, default=20.0, help="回転角度(CCW を正、既定 20)")
    ap.add_argument("--pivot", default="bottom-left",
                    choices=["bottom-left", "bottom-right", "bottom-center"],
                    help="回転 pivot 位置(既定 bottom-left = ヘッドボード接地点)")
    args = ap.parse_args()
    rotate(args.input, args.output, args.angle, args.pivot)


if __name__ == "__main__":
    main()
