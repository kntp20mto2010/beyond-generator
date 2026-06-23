#!/usr/bin/env python3
"""
家具 PNG から影レイヤを分離するユーティリティ。

L1b 家具(ベッド・デスク・チェア等)は底面に soft な「グレーの drop shadow」が
焼き付いていることが多い。これを別 PNG に切り出し、レンダ時に multiply で
床と合成できるようにする。

検出ヒューリスティック:
  - 低彩度(max-min RGB <= sat_thresh): グレー寄り
  - 中明度(min_bright <= bright <= max_bright): 真っ白でも真っ黒でもない
  - 半透明〜不透明(alpha > 64)
  - 画像下部 (seed_band_pct から下)に種を撒き、連結する gray ピクセルだけを影と判定
    → 上部のグレー(例: 椅子のクローム脚など)を誤検出しない

使い方:
    python3 scripts/split-shadow.py INPUT OUT_FG OUT_SHADOW [--options...]

出力:
    OUT_FG     : 影ピクセルを alpha=0 にした本体
    OUT_SHADOW : 影ピクセルだけを残した透過 PNG(他は alpha=0)

オプション:
    --sat N        彩度閾値(既定 20)。低くするほど厳しく(無彩色のみ)
    --min-bright N 影の明度下限(既定 80)
    --max-bright N 影の明度上限(既定 200)。これを超える明るさは shadow と見なさない
    --seed-band F  下部の何 % を seed band にするか(既定 0.30 = 下 30%)
    --invert-alpha 影 alpha を 「明るさ → 不透明度」反転(暗いほど濃い影)
"""

import argparse
import sys
from pathlib import Path
from collections import deque

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("Pillow + numpy が必要です: pip install pillow numpy", file=sys.stderr)
    sys.exit(2)


def detect_shadow(arr: np.ndarray, sat_thresh: int, min_bright: int, max_bright: int, seed_band: float, min_component: int) -> np.ndarray:
    """影ピクセルの bool マスクを返す。

    検出ステップ:
      1. 候補ピクセル(低彩度 + 中明度 + 不透明)
      2. 画像下部 seed_band 比率からの flood-fill で連結だけを採用
      3. min_component より小さい連結成分は孤立ノイズとして除去
    """
    H, W = arr.shape[:2]
    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)
    a = arr[:, :, 3]
    bright = (r + g + b) // 3
    maxch = np.maximum(np.maximum(r, g), b)
    minch = np.minimum(np.minimum(r, g), b)
    sat = maxch - minch
    candidate = (a > 64) & (sat <= sat_thresh) & (bright >= min_bright) & (bright <= max_bright)

    seed_y = max(0, int(H * (1 - seed_band)))
    in_shadow = np.zeros_like(candidate, dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for y in range(seed_y, H):
        row = candidate[y]
        xs = np.where(row & ~in_shadow[y])[0]
        for x in xs:
            in_shadow[y, x] = True
            q.append((int(x), y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and candidate[ny, nx] and not in_shadow[ny, nx]:
                in_shadow[ny, nx] = True
                q.append((nx, ny))

    # 連結成分サイズフィルタ: min_component 未満は除去(孤立ノイズ対策)
    if min_component > 1:
        in_shadow = _drop_small_components(in_shadow, min_component)
    return in_shadow


def _drop_small_components(mask: np.ndarray, min_size: int) -> np.ndarray:
    """4-連結成分の中でサイズが min_size 未満のものを False に落とす。"""
    H, W = mask.shape
    visited = np.zeros((H, W), dtype=np.int32)
    n = 0
    sizes: dict[int, int] = {}
    pixels: dict[int, list[tuple[int, int]]] = {}
    for y0 in range(H):
        for x0 in range(W):
            if not mask[y0, x0] or visited[y0, x0]:
                continue
            n += 1
            q: deque[tuple[int, int]] = deque([(x0, y0)])
            visited[y0, x0] = n
            comp_px: list[tuple[int, int]] = []
            while q:
                x, y = q.popleft()
                comp_px.append((x, y))
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = n
                        q.append((nx, ny))
            sizes[n] = len(comp_px)
            pixels[n] = comp_px

    out = np.zeros_like(mask)
    for cid, sz in sizes.items():
        if sz >= min_size:
            for x, y in pixels[cid]:
                out[y, x] = True
    return out


def split(arr: np.ndarray, mask: np.ndarray, invert_alpha: bool) -> tuple[np.ndarray, np.ndarray]:
    """foreground (影抜き) / shadow (影のみ) の 2 配列を返す。

    invert_alpha=True なら shadow の alpha を「明るさが暗いほど不透明」に変換。
    multiply ブレンドで使うと、明るい灰色は弱い影、暗い灰色は濃い影として効く。
    """
    foreground = arr.copy()
    foreground[mask, 3] = 0

    shadow = arr.copy()
    shadow[~mask, 3] = 0

    if invert_alpha:
        # 影マスク内のピクセルだけ、明るさを使って alpha を再計算
        # bright 0  -> alpha 255 (黒い影)
        # bright 200 -> alpha 0
        # bright 100 -> alpha ~128
        r = shadow[:, :, 0].astype(int)
        g = shadow[:, :, 1].astype(int)
        b = shadow[:, :, 2].astype(int)
        bright = (r + g + b) // 3
        ramp = np.clip(255 - bright * (255 / 200), 0, 255).astype(np.uint8)
        # multiply 用に、影の色を常に「黒」にしておくと、不透明度=暗さで床を darken できる
        shadow[mask, 0] = 0
        shadow[mask, 1] = 0
        shadow[mask, 2] = 0
        shadow[mask, 3] = ramp[mask]

    return foreground, shadow


def process(input_path: Path, out_fg: Path, out_shadow: Path,
            sat: int, min_b: int, max_b: int, seed_band: float, invert: bool, min_component: int) -> None:
    im = Image.open(input_path).convert("RGBA")
    arr = np.array(im)
    mask = detect_shadow(arr, sat, min_b, max_b, seed_band, min_component)
    fg_arr, sh_arr = split(arr, mask, invert)

    fg_count = int((arr[:, :, 3] > 64).sum())
    sh_count = int(mask.sum())
    print(f"{input_path}: total opaque {fg_count}, shadow {sh_count} ({100*sh_count/max(1,fg_count):.1f}% of opaque)")

    out_fg.parent.mkdir(parents=True, exist_ok=True)
    out_shadow.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(fg_arr, "RGBA").save(out_fg)
    Image.fromarray(sh_arr, "RGBA").save(out_shadow)
    print(f"  -> {out_fg}")
    print(f"  -> {out_shadow}")


def main() -> None:
    ap = argparse.ArgumentParser(description="家具 PNG から影レイヤを分離")
    ap.add_argument("input", type=Path, help="入力 PNG パス(影付き本体)")
    ap.add_argument("out_fg", type=Path, help="影抜き本体の出力パス")
    ap.add_argument("out_shadow", type=Path, help="影レイヤの出力パス(透過 PNG)")
    ap.add_argument("--sat", type=int, default=20, help="彩度閾値(既定 20)")
    ap.add_argument("--min-bright", type=int, default=80, help="影候補の明度下限(既定 80)")
    ap.add_argument("--max-bright", type=int, default=200, help="影候補の明度上限(既定 200)")
    ap.add_argument("--seed-band", type=float, default=0.30, help="下部 seed band 比率(既定 0.30)")
    ap.add_argument("--invert-alpha", action="store_true", help="影 alpha を「明るさ → 不透明度」反転(multiply 用)")
    ap.add_argument("--min-component", type=int, default=500, help="孤立ノイズ除去: この px 未満の連結成分を捨てる(既定 500)")
    args = ap.parse_args()
    process(args.input, args.out_fg, args.out_shadow,
            args.sat, args.min_bright, args.max_bright, args.seed_band, args.invert_alpha, args.min_component)


if __name__ == "__main__":
    main()
