#!/usr/bin/env python3
"""
objects-catalog.ts の nativeW / nativeH を実画像の実サイズに同期する。

chromakey-import.py で画像をクロップすると元の dims (1500x900 など)から
snug-fit サイズに変わるので、catalog 側もそれに追従する。
"""

import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow が必要です: pip install pillow", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "src/editor/scene/objects-catalog.ts"

# 各エントリは { id: "...", label: "...", src: "...", ..., nativeW: NNN, nativeH: NNN, ...
# の構造。id をキャプチャしつつその直後の src と nativeW/nativeH を更新する。
ENTRY_RE = re.compile(
    r'(id:\s*"(?P<id>[^"]+)"(?:[^}]*?))'  # group(1): id 行
    r'src:\s*"(?P<src>[^"]+)"'             # src 行
    r'(?P<between1>(?:[^}]*?))'            # group("between1"): src と nativeW の間
    r'nativeW:\s*(?P<w>\d+)'               # nativeW
    r'(?P<between2>(?:[^}]*?))'            # group("between2"): nativeW と nativeH の間
    r'nativeH:\s*(?P<h>\d+)',
    re.DOTALL,
)


def main() -> None:
    if not CATALOG.exists():
        print(f"catalog not found: {CATALOG}", file=sys.stderr)
        sys.exit(1)

    text = CATALOG.read_text()
    changes: list[str] = []

    def replace(m: re.Match) -> str:
        src = m.group("src")
        oid = m.group("id")
        img_path = ROOT / src
        if not img_path.exists():
            changes.append(f"  ! {oid}: image not found ({src}), skipping")
            return m.group(0)
        with Image.open(img_path) as im:
            w, h = im.size
        old_w = int(m.group("w"))
        old_h = int(m.group("h"))
        if w == old_w and h == old_h:
            return m.group(0)
        changes.append(f"  {oid}: {old_w}x{old_h} -> {w}x{h}")
        return (
            f'{m.group(1)}src: "{src}"'
            f'{m.group("between1")}nativeW: {w}'
            f'{m.group("between2")}nativeH: {h}'
        )

    new_text = ENTRY_RE.sub(replace, text)
    if new_text != text:
        CATALOG.write_text(new_text)
        print(f"updated {CATALOG.relative_to(ROOT)}:")
        for c in changes:
            print(c)
    else:
        print("no changes")


if __name__ == "__main__":
    main()
