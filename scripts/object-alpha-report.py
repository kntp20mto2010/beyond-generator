#!/usr/bin/env python3
"""assets/objects/*.png の alpha 透過状況を JSON で報告する。

ObjectPage(オブジェクトタブ)が「透過済み/要透過」バッジ・フィルタ・件数を出すために使う。
各 PNG の透明画素率(alpha < 32 の割合)を返す。完全不透明(0%)= 背景が透過されていない
(Codex の白塗り/チェッカー塗り等)= 要透過、と判定できる。

出力(stdout, JSON):
    {"files": [{"src": "assets/objects/foo.png", "w": 800, "h": 600,
                "transparentPct": 34.2, "opaque": false}], "count": N}

usage:
    python3 scripts/object-alpha-report.py [--dir assets/objects] [--opaque-threshold 0.5]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dir", type=Path, default=Path("assets/objects"))
    p.add_argument(
        "--opaque-threshold",
        type=float,
        default=0.1,
        help="透明画素率(パーセント)がこの値未満なら opaque=true (= 要透過) とする (default=0.1)。"
             "矩形の額/ラグ等は角だけ透明で率が低いので、真に alpha 全面不透明だけを弾く低めの値にする。",
    )
    args = p.parse_args()

    files = []
    if args.dir.is_dir():
        for png in sorted(args.dir.glob("*.png")):
            # 影 PNG (*.shadow.png) は対象外
            if png.name.endswith(".shadow.png"):
                continue
            try:
                im = Image.open(png).convert("RGBA")
                a = np.array(im)[..., 3]
                transparent_pct = float((a < 32).mean() * 100.0)
                files.append({
                    "src": f"{args.dir.as_posix()}/{png.name}",
                    "w": im.width,
                    "h": im.height,
                    "transparentPct": round(transparent_pct, 2),
                    "opaque": transparent_pct < args.opaque_threshold,
                })
            except Exception as e:  # 壊れた PNG はスキップして報告
                files.append({
                    "src": f"{args.dir.as_posix()}/{png.name}",
                    "error": str(e),
                })

    json.dump({"files": files, "count": len(files)}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
