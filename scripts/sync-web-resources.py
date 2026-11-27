#!/usr/bin/env python3
"""Root is canonical. beta-v3.4 is a generated compatibility distribution."""
from pathlib import Path
import shutil,sys
root=Path(__file__).resolve().parents[1]
paths=[p for folder in ['core','editor','live','lab','config'] for p in (root/folder).rglob('*') if p.is_file()]
paths += [root/name for name in ['index.html','v03.html','privacy.html','privacy-en.html','terms.html','terms-en.html']]
for source in paths:
 target=root/'beta-v3.4'/source.relative_to(root)
 if '--check' in sys.argv:
  if not target.exists() or target.read_bytes()!=source.read_bytes():raise SystemExit('Stale generated resource: '+str(target))
 else:
  target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
live=root/'v03.html'
ble_entry=root/'v03-ble-test.html'
if '--check' in sys.argv:
 if ble_entry.read_bytes()!=live.read_bytes():raise SystemExit('Stale generated Android LIVE entry: '+str(ble_entry))
else:shutil.copy2(live,ble_entry)
print(f'{len(paths)} shared web resources verified' if '--check' in sys.argv else f'{len(paths)} shared web resources generated')
