#!/usr/bin/env python3
"""Codex が「透明背景」を本物の alpha=0 ではなく塗りつぶし (チェッカー模様 / 白) で
返してきた画像から、背景を除去して本物の透過 PNG にする。任意 tight-crop + cells 算出も。

なぜ必要か:
    Codex に透過 PNG を依頼しても、背景を alpha=0 にせず「透明を表す灰白チェッカー模様」を
    *実ピクセルで描いて* 返すことがある (alpha 全面 255)。この achromatic (無彩色) かつ
    高明度の背景を、境界からの flood-fill で除去する。

判定:
    - 背景候補 = 無彩色 (max-min <= --chroma) かつ 高明度 (min >= --lightness)
      → チェッカー (≈242/254) も純白 (255) も拾う
    - 画像四辺から flood-fill し、外周と地続きの背景候補だけを alpha=0 にする
      (オブジェクト内部の明るい部分を誤って抜かない)

安全策:
    - 既に十分な透明 (alpha< thr の画素が --already-transparent-share 以上) があれば
      「最初から透過」とみなし背景除去はスキップ (tight-crop だけ行う)
    - オブジェクト自身が無彩色・高明度 (白い家具/枕など) の場合は誤抜きの恐れ → warn を出す

usage:
    python3 scripts/strip-fake-transparency.py <in.png> <out.png> \
        [--tight-crop] [--pad 12] [--lightness 230] [--chroma 12]
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PX_PER_CELL = 300


def flood_bg(bgcand: np.ndarray) -> np.ndarray:
    """bgcand (bool) のうち四辺と地続きの連結成分だけ True で返す。"""
    H, W = bgcand.shape
    try:
        from scipy import ndimage

        lbl, _ = ndimage.label(bgcand)
        border = set(
            np.unique(
                np.concatenate([lbl[0, :], lbl[H - 1, :], lbl[:, 0], lbl[:, W - 1]])
            )
        )
        border.discard(0)
        return np.isin(lbl, list(border))
    except Exception:
        from collections import deque

        bg = np.zeros((H, W), bool)
        dq: deque = deque()
        for x in range(W):
            for y in (0, H - 1):
                if bgcand[y, x] and not bg[y, x]:
                    bg[y, x] = True
                    dq.append((y, x))
        for y in range(H):
            for x in (0, W - 1):
                if bgcand[y, x] and not bg[y, x]:
                    bg[y, x] = True
                    dq.append((y, x))
        while dq:
            y, x = dq.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and bgcand[ny, nx] and not bg[ny, nx]:
                    bg[ny, nx] = True
                    dq.append((ny, nx))
        return bg


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("inp", type=Path)
    p.add_argument("out", type=Path)
    p.add_argument("--lightness", type=int, default=230, help="背景候補の min channel 下限 (default=230)")
    p.add_argument("--chroma", type=int, default=12, help="背景候補の max-min 上限 (default=12)")
    p.add_argument("--alpha-threshold", type=int, default=16)
    p.add_argument(
        "--already-transparent-share",
        type=float,
        default=0.03,
        help="alpha<thr 画素がこの割合以上なら『最初から透過』とみなし背景除去をスキップ (default=0.03)",
    )
    p.add_argument("--tight-crop", action="store_true", help="alpha bbox + pad で tight crop")
    p.add_argument("--pad", type=int, default=12, help="tight-crop 時の透明余白 px (default=12)")
    args = p.parse_args()

    im = Image.open(args.inp).convert("RGBA")
    arr = np.array(im)
    rgb = arr[..., :3].astype(int)
    alpha = arr[..., 3]
    H, W = alpha.shape

    transparent_share = float((alpha <= args.alpha_threshold).mean())
    if transparent_share >= args.already_transparent_share:
        print(f"info: 既に透過あり (alpha<= {args.alpha_threshold} が {transparent_share*100:.1f}%) → 背景除去スキップ")
        out = arr.copy()
    else:
        mx = rgb.max(2)
        mn = rgb.min(2)
        bgcand = ((mx - mn) <= args.chroma) & (mn >= args.lightness)
        bg = flood_bg(bgcand)
        new_alpha = np.where(bg, 0, 255).astype(np.uint8)
        out = np.dstack([arr[..., :3], new_alpha])

        # 誤抜き警告: オブジェクト内部に無彩色・高明度が多いと白い家具を抜く恐れ
        kept = new_alpha > args.alpha_threshold
        kept_lightachroma = (((mx - mn) <= args.chroma) & (mn >= args.lightness) & kept).sum()
        share = kept_lightachroma / max(1, kept.sum())
        print(f"info: 背景除去 removed={int(bg.sum())} ({bg.mean()*100:.1f}%) kept={int(kept.sum())}")
        if share > 0.15:
            print(
                f"warn: オブジェクト内に無彩色・高明度が {share*100:.0f}% — 白系オブジェクトだと誤抜きの可能性。"
                f"--lightness を上げる/--chroma を下げて再調整を検討",
                file=sys.stderr,
            )

    img = Image.fromarray(out, "RGBA")

    if args.tight_crop:
        a = np.array(img)[..., 3] > args.alpha_threshold
        if not a.any():
            print("error: tight-crop 後に不透明画素なし", file=sys.stderr)
            return 1
        ys, xs = np.where(a)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
        x0 = max(0, x0 - args.pad)
        y0 = max(0, y0 - args.pad)
        x1 = min(img.width, x1 + 1 + args.pad)
        y1 = min(img.height, y1 + 1 + args.pad)
        img = img.crop((x0, y0, x1, y1))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    img.save(args.out, "PNG")
    w, h = img.size
    print(f"out    : {args.out}")
    print(f"native : {w}x{h}  aspect={w/h:.2f}:1")
    print(f"cells  : {math.ceil(w/PX_PER_CELL)}x{math.ceil(h/PX_PER_CELL)}  (= ceil(native/{PX_PER_CELL}))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
