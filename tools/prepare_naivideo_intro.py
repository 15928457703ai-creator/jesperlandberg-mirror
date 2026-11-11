"""Replace Naivideo's introduction image and place it before its motion slide."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/Users/soul/Downloads/Naivideo-01/1. 海外AI创作工具Naivideo-APP.jpg')
dest = root / 'site/naivideo'
meta_path = root / 'raw/project_images/naivideo.json'
meta = json.loads(meta_path.read_text())
intro = next(m for m in meta if m['main']['file'] == '1.jpg')
for suffix, width in [('', 1600), ('_card', 1200), ('_small', 640)]:
    subprocess.run(['sips', '--resampleWidth', str(width), str(source), '--out', str(dest / ('1' + suffix + '.jpg'))], check=True, capture_output=True)
shutil.copyfile(source, dest / 'originals' / source.name)
intro['source'] = source.name
meta = [intro] + [m for m in meta if m is not intro]
meta_path.write_text(json.dumps(meta, indent=1, ensure_ascii=False) + '\n')
print('Naivideo detail starts with:', intro['source'])
