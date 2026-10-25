"""Pre-commit check of a repo that receives files from Meddeb_dev (03_platforms.md §3): every file listed in
EXPORTED_FROM.json must still have the SHA-256 it was exported with. Such files are changed in Meddeb_dev and
exported again (python tools/export_app.py --target <repo>), never edited in place.

    python tools/check_exported.py [repo_root]      # exit 1 and the list of edited / missing files
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


def problems(root: Path) -> list[str]:
    stamp = root / "EXPORTED_FROM.json"
    if not stamp.exists():
        return []
    out = []
    for rel, sha in json.loads(stamp.read_text(encoding="utf-8"))["files"].items():
        p = root / rel
        if not p.is_file():
            out.append(f"missing: {rel}")
        elif hashlib.sha256(p.read_bytes()).hexdigest() != sha:
            out.append(f"edited: {rel}")
    return out


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path(__file__).resolve().parents[1]
    bad = problems(root)
    for line in bad:
        print(line)
    if bad:
        print("These files come from Meddeb_dev: change them there and re-export (tools/export_app.py).")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
