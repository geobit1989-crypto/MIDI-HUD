#!/usr/bin/env python3
"""Empaqueta la misma beta, sin dependencias remotas ni otra copia del editor."""
from pathlib import Path
import hashlib
import json
import shutil

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / "beta-v3.4"
TARGET = HERE / "Web"


def prepare():
    TARGET.mkdir(exist_ok=True)
    for child in TARGET.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        elif child.name != "README.txt":
            child.unlink()
    for name in ("core", "editor", "live", "lab", "config"):
        shutil.copytree(SOURCE / name, TARGET / name)
    for name in ("index.html", "v03.html"):
        shutil.copy2(SOURCE / name, TARGET / name)
    manifest = {
        str(path.relative_to(TARGET)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(TARGET.rglob("*")) if path.is_file()
    }
    (TARGET / "bundle-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Recursos iOS: {len(manifest)} archivos incluidos.")


if __name__ == "__main__":
    prepare()
