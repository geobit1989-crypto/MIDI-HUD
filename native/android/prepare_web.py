"""Package canonical root resources into the Android build directory; never alter source."""
from pathlib import Path
import hashlib, json, shutil, sys

ROOT = Path(__file__).resolve().parents[2]
target = Path(sys.argv[1]).resolve()
# Refuse arbitrary source locations, even if the script is misconfigured.
expected = (Path(__file__).resolve().parent / "app" / "build" / "generated" / "hudAssets").resolve()
if target != expected:
    raise SystemExit("Refusing to replace anything outside the Android generated assets directory")
if target.exists():
    shutil.rmtree(target)
target.mkdir(parents=True)
for name in ("core", "editor", "live", "config"):
    shutil.copytree(ROOT / name, target / name)
for name in ("index.html", "v03.html", "v03-ble-test.html", "README.md", "privacy.html", "privacy-en.html", "terms.html", "terms-en.html"):
    shutil.copy2(ROOT / name, target / name)
manifest = {str(p.relative_to(target)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(target.rglob("*")) if p.is_file()}
(target / "bundle-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Android QA: {len(manifest)} canonical resources")
