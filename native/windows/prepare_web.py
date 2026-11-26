"""Generate the offline bundle directly from canonical root resources."""
from pathlib import Path
import shutil, hashlib, json
here = Path(__file__).resolve().parent
root = here.parents[1]
target = here / 'obj' / 'hud-assets' / 'windows-qa'
if target.exists(): shutil.rmtree(target)
target.mkdir(parents=True)
for name in ('core','editor','live','config'):
    shutil.copytree(root/name,target/name)
for name in ('index.html','v03.html','README.md','privacy.html','privacy-en.html','terms.html','terms-en.html'):
    shutil.copy2(root/name,target/name)
manifest = {p.relative_to(target).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(target.rglob('*')) if p.is_file()}
(target/'bundle-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(f'Windows QA: {len(manifest)} canonical resources')
