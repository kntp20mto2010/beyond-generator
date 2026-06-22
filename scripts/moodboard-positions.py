#!/usr/bin/env python3
"""assets/generated/sakura-*-mask-*.png から緑領域の bbox を抽出して JSON で報告する。

抽出元タブの QC プレビュー Step2 で「空背景に moodboard の配置で家具を並べる」のに使う。
各 mask ファイルから緑 bbox を読み、catalog 上の家具と紐付けるための情報を出力する。

ファイル名規則 (緩い):
    sakura-<stem>-mask-*.png         例 sakura-bookshelf-front-mask-r1-20260621.png
    sakura-<stem>-green-mask-*.png   例 sakura-sofa-green-mask-tight-r1b-20260621.png

出力 (stdout, JSON):
    {
      "masks": [
        {
          "file": "sakura-bookshelf-front-mask-r1-20260621.png",
          "stem": "sakura-bookshelf-front",
          "canvasW": 1920,
          "canvasH": 1080,
          "bbox": {"x": 1100, "y": 200, "w": 350, "h": 600},
          "mtime": 1719999999.0
        },
        ...
      ]
    }

usage:
    python3 scripts/moodboard-positions.py [--dir assets/generated]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def stem_of(filename: str) -> str:
    """sakura-bookshelf-front-mask-r1-20260621.png → sakura-bookshelf-front"""
    name = filename.removesuffix(".png")
    # remove revision tags
    name = re.sub(r"-r\d+[a-z]?$", "", name)
    # remove date suffix
    name = re.sub(r"-2026\d{4}$", "", name)
    # remove mask suffix
    name = re.sub(r"-mask(?:-tight)?(?:-only)?(?:-r\d+[a-z]?)?$", "", name)
    name = re.sub(r"-green-mask(?:-tight)?$", "", name)
    # remove other common suffixes that came in via -tight / -only
    name = re.sub(r"-(tight|only|complete|hidden-aware|occlusion|abspath|green-blue|green)$", "", name)
    return name


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dir", type=Path, default=Path("assets/generated"))
    p.add_argument("--green-tolerance", type=int, default=80)
    args = p.parse_args()

    out: list[dict] = []
    seen_stems: dict[str, dict] = {}  # stem → entry; later mtime wins

    pattern = re.compile(r"sakura-.*mask.*\.png$")
    for png in sorted(args.dir.glob("sakura-*mask*.png")):
        if not pattern.search(png.name):
            continue
        try:
            im = Image.open(png).convert("RGB")
            arr = np.array(im).astype(int)
            g = (arr[..., 1] - np.maximum(arr[..., 0], arr[..., 2])) >= args.green_tolerance
            if not g.any():
                continue
            ys, xs = np.where(g)
            bbox = {
                "x": int(xs.min()),
                "y": int(ys.min()),
                "w": int(xs.max() - xs.min() + 1),
                "h": int(ys.max() - ys.min() + 1),
            }
            stem = stem_of(png.name)
            entry = {
                "file": png.name,
                "stem": stem,
                "canvasW": im.size[0],
                "canvasH": im.size[1],
                "bbox": bbox,
                "mtime": png.stat().st_mtime,
            }
            # keep the latest mtime per stem
            if stem not in seen_stems or entry["mtime"] > seen_stems[stem]["mtime"]:
                seen_stems[stem] = entry
        except Exception as e:
            print(f"warn: skipped {png}: {e}", file=sys.stderr)

    out = sorted(seen_stems.values(), key=lambda e: e["stem"])
    json.dump({"masks": out}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
