#!/usr/bin/env python3
"""
Codex 生成画像 → 透過 PNG への変換ユーティリティ。

Codex は `transparentBackground:true` を指定しても alpha=255 で塗りつぶした
PNG を返すことが多い。このスクリプトは:

  1. 白系背景(R≈G≈B かつ明るい)を chroma-key で alpha=0 にする
  2. 接続成分(connected components)を見て、最大成分の bbox にクロップする
     (隣の小さなノイズを除去)
  3. 結果を出力パスに書き出す

使い方:
    python3 scripts/chromakey-import.py INPUT OUTPUT
    python3 scripts/chromakey-import.py assets/generated/foo.png assets/objects/foo.png

オプション:
    --bright N          BG 判定の明度閾値(既定 235)。低くするとより多くを BG 扱い
    --saturation N      BG 判定の彩度閾値(既定 10)。max(R,G,B) - min(R,G,B) <= N を BG
    --no-crop           bbox クロップしない(透過化のみ)
    --largest-only      最大成分1個のみ採用(他の小さな成分はノイズとして除去)
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


def chromakey(arr: np.ndarray, bright_thresh: int, sat_thresh: int, bg_color: tuple[int, int, int] | None = None, color_tol: int = 60, flood: bool = True) -> np.ndarray:
    """BG を alpha=0 にする。arr は HxWx4 RGBA。

    flood=True(既定): 画像端から flood-fill で連続してる BG 候補ピクセルだけを
        透明化する。家具内部の「真っ白なクラウド」「クリーム panel」などは
        画像端と連結していないので維持される。
    flood=False: BG 候補に該当する全ピクセルを透明化する。内部の空洞(脚の間、
        座面と背もたれの間など)も透明化したい家具で使う。内部に白系のディテール
        がある家具では使わないこと。

    bg_color=None: 白系(低彩度+高明度)を BG 候補にする。
    bg_color=(R,G,B): 指定色との RGB 距離が color_tol 以内のピクセルを BG 候補にする。
                       Codex が緑/マゼンタの BG で出してきた場合に使う。
    """
    from collections import deque

    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)

    if bg_color is None:
        # 既定: 白系(低彩度 + 高明度)
        maxch = np.maximum(np.maximum(r, g), b)
        minch = np.minimum(np.minimum(r, g), b)
        sat = maxch - minch
        bright = (r + g + b) // 3
        bg_candidate = (bright >= bright_thresh) & (sat <= sat_thresh)
    else:
        # 指定色との距離が color_tol 以内
        br, bg, bb = bg_color
        dist = np.maximum(np.maximum(np.abs(r - br), np.abs(g - bg)), np.abs(b - bb))
        bg_candidate = dist <= color_tol

    H, W = bg_candidate.shape

    if not flood:
        out = arr.copy()
        out[bg_candidate, 3] = 0
        return out

    bg_mask = np.zeros_like(bg_candidate, dtype=bool)
    q: deque[tuple[int, int]] = deque()

    # Seed: 全ての画像端ピクセルが BG 候補なら追加
    for x in range(W):
        if bg_candidate[0, x]:
            q.append((x, 0)); bg_mask[0, x] = True
        if bg_candidate[H - 1, x]:
            q.append((x, H - 1)); bg_mask[H - 1, x] = True
    for y in range(H):
        if bg_candidate[y, 0]:
            q.append((0, y)); bg_mask[y, 0] = True
        if bg_candidate[y, W - 1]:
            q.append((W - 1, y)); bg_mask[y, W - 1] = True

    # 4-connected flood-fill
    while q:
        x, y = q.popleft()
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and bg_candidate[ny, nx] and not bg_mask[ny, nx]:
                bg_mask[ny, nx] = True
                q.append((nx, ny))

    out = arr.copy()
    out[bg_mask, 3] = 0
    return out


def opaque_bbox(alpha: np.ndarray) -> tuple[int, int, int, int] | None:
    """alpha mask の全 opaque 領域を包む bbox を返す(複数の独立パーツも全て含む)。"""
    binary = alpha > 64
    if not binary.any():
        return None
    ys, xs = np.where(binary)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def isolate_largest(arr: np.ndarray) -> np.ndarray:
    """最大連結成分以外を alpha=0 にする。"""
    from collections import deque

    binary = arr[:, :, 3] > 64
    H, W = binary.shape
    visited = np.zeros_like(binary, dtype=np.int32)
    n_comp = 0
    comp_size = {}
    for y0 in range(H):
        for x0 in range(W):
            if not binary[y0, x0] or visited[y0, x0]:
                continue
            n_comp += 1
            q = deque([(x0, y0)])
            visited[y0, x0] = n_comp
            size = 0
            while q:
                x, y = q.popleft()
                size += 1
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and binary[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = n_comp
                        q.append((nx, ny))
            comp_size[n_comp] = size
    if not comp_size:
        return arr
    largest_id = max(comp_size, key=comp_size.get)
    keep = visited == largest_id
    out = arr.copy()
    out[~keep, 3] = 0
    return out


def process(input_path: Path, output_path: Path, bright: int, sat: int, do_crop: bool, largest_only: bool, bg_color: tuple[int, int, int] | None = None, color_tol: int = 60, flood: bool = True) -> None:
    im = Image.open(input_path).convert("RGBA")
    arr = np.array(im)
    initial_size = im.size

    keyed = chromakey(arr, bright, sat, bg_color, color_tol, flood)
    if largest_only:
        keyed = isolate_largest(keyed)

    if do_crop:
        bbox = opaque_bbox(keyed[:, :, 3])
        if bbox is None:
            print(f"WARN: {input_path}: 連結成分が見つからない。透過化のみで保存", file=sys.stderr)
            cropped_arr = keyed
        else:
            cropped_arr = keyed[bbox[1]:bbox[3], bbox[0]:bbox[2]]
    else:
        cropped_arr = keyed

    out_im = Image.fromarray(cropped_arr, "RGBA")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out_im.save(output_path)
    transparent_pct = 100 * (cropped_arr[:, :, 3] < 32).sum() / cropped_arr[:, :, 3].size
    print(f"{input_path} ({initial_size[0]}x{initial_size[1]}) -> {output_path} ({out_im.size[0]}x{out_im.size[1]}, {transparent_pct:.1f}% transparent)")


def main() -> None:
    ap = argparse.ArgumentParser(description="Codex 生成画像を chroma-key + bbox クロップして透過 PNG に変換")
    ap.add_argument("input", type=Path, help="入力 PNG パス")
    ap.add_argument("output", type=Path, help="出力 PNG パス")
    ap.add_argument("--bright", type=int, default=235, help="BG 判定明度閾値(既定 235)")
    ap.add_argument("--saturation", type=int, default=10, help="BG 判定彩度閾値(既定 10)")
    ap.add_argument("--no-crop", action="store_true", help="bbox クロップしない")
    ap.add_argument("--largest-only", action="store_true", help="最大連結成分以外を除去")
    ap.add_argument("--bg-color", type=str, help="BG 色を直接指定: 'R,G,B'(例: '0,255,0' で純緑)。指定時は明度/彩度判定を上書き")
    ap.add_argument("--color-tol", type=int, default=60, help="--bg-color 指定時の色距離トレランス(既定 60)")
    ap.add_argument("--no-flood", action="store_true", help="端からの flood-fill を無効化し、BG 候補に該当する全ピクセルを透明化する(脚の間など内部空洞を抜きたい家具用)")
    args = ap.parse_args()
    bg_color = None
    if args.bg_color:
        parts = [int(c) for c in args.bg_color.split(",")]
        if len(parts) != 3:
            print("--bg-color は R,G,B 形式", file=sys.stderr); sys.exit(1)
        bg_color = (parts[0], parts[1], parts[2])
    process(args.input, args.output, args.bright, args.saturation, not args.no_crop, args.largest_only, bg_color, args.color_tol, not args.no_flood)


if __name__ == "__main__":
    main()
