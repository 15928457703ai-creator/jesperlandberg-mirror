"""Export the mirror, including cached media, for GitHub Pages or static hosting."""
import argparse
import html
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--base', default='/jesperlandberg-mirror/')
p.add_argument('--origin', default='https://15928457703ai-creator.github.io')
p.add_argument('--out', default='dist-pages')
a = p.parse_args()
base = '/' + a.base.strip('/') + '/' if a.base.strip('/') else '/'
out = Path(a.out).resolve()
if out == ROOT or ROOT in out.parents and out.name != 'dist-pages':
    raise SystemExit('Use dist-pages or a separate output directory')
if out.exists(): shutil.rmtree(out)
shutil.copytree(ROOT / 'site', out, ignore=shutil.ignore_patterns('originals'))
manifest = json.loads((ROOT / 'assets/manifest.json').read_text())
media = out / '__media'
media.mkdir()
for entry in manifest['byPath'].values():
    target = media / entry['file']
    if not target.exists(): shutil.copyfile(ROOT / 'assets' / entry['file'], target)
urlmap = {}
for source, entry in manifest['byPath'].items():
    urlmap[source] = base + '__media/' + entry['file']
    urlmap.setdefault(source.split('?')[0], base + '__media/' + entry['file'])
for source, entry in manifest['byUrl'].items():
    urlmap[source] = base + '__media/' + entry['file']

# Asset directories are prefixed; router route definitions remain base-relative.
asset_dirs = [d.name for d in (ROOT / 'site').iterdir() if d.is_dir() and d.name not in ('projects','full','newsletter')]
asset_names = [f.name for f in (ROOT / 'site').iterdir() if f.is_file() and f.suffix in ('.js','.css','.json')]
asset_pattern = re.compile(r'([\"\'`(])(/(?:' + '|'.join(map(re.escape, asset_dirs + asset_names)) + r')(?=/|[\"\'`)?#]))')
# Match complete quoted cache keys before rewriting asset prefixes.
quoted = re.compile(r'([\"\'])(/(?!/)[^\"\'<>\s]*|https?://[^\"\'<>\s]*)\1')

def transform(text, suffix):
    text = re.sub(r'http://127\.0\.0\.1:(?:__PORT__|\d+)', '', text)
    def cached(m):
        src = html.unescape(m.group(2))
        return m.group(1) + urlmap.get(src, m.group(2)) + m.group(1)
    text = quoted.sub(cached, text)
    text = asset_pattern.sub(lambda m: m.group(1) + base.rstrip('/') + m.group(2), text)
    if suffix == '.js':
        text = text.replace('window.location.pathname', 'window.__portfolioPath()').replace('location.pathname', 'window.__portfolioPath()')
        # Selectors target the resolved, base-prefixed hrefs in the rendered DOM.
        text = text.replace('a[href="/projects/', 'a[href="' + base + 'projects/')
    if suffix == '.css':
        text = re.sub(r'href="/(?!/)', 'href="' + base, text)
    if suffix == '.html':
        text = re.sub(r'((?:href|action|data-src)=[\"\'])/(?!/|' + re.escape(base.lstrip('/')) + ')', lambda m: m.group(1) + base, text)
        text = text.replace('baseURL:"/"', 'baseURL:' + json.dumps(base))
        text = re.sub(r'buildAssetsDir:"[^"]+"', 'buildAssetsDir:"/_nuxt/"', text)
        text = text.replace('<head>', '<head><script src="' + base + 'pages-runtime.js"></script>', 1)
    return text

for file in list(out.rglob('*')):
    if file.is_file() and file.suffix in ('.html','.js','.css','.json','.md','.txt','.xml'):
        file.write_text(transform(file.read_text(), file.suffix))

replay = json.loads(transform((ROOT / 'raw/graphql_localized.json').read_text(), '.json'))
(out / 'graphql.json').write_text(json.dumps(replay, ensure_ascii=False, separators=(',',':')))
# GitHub Pages serves routes from directories, including direct detail links.
for route in ['full','newsletter','oppo-wechat'] + ['projects/' + f.stem for f in (out / 'projects').glob('*.html')]:
    source = out / (route + '.html')
    if source.exists():
        destination = out / route / 'index.html'
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
(out / '.nojekyll').touch()
runtime = r'''(function(){
'use strict';
var base=BASE, assets=ASSETS;
window.__portfolioPath=function(){var p=location.pathname;return p.indexOf(base)===0?'/'+p.slice(base.length):p;};
function mapped(input){var url=new URL(input,location.href);if(!/^https?:$/.test(url.protocol))return input;var path=url.pathname;
if(path.indexOf(base)===0)path='/'+path.slice(base.length);
var key=path+url.search;
if(assets[key]||assets[path])return assets[key]||assets[path];
if(url.origin===location.origin&&url.pathname.indexOf(base)!==0)return base.replace(/\/$/,'')+url.pathname+url.search;
return url.href;}
var fetchOriginal=window.fetch.bind(window);
window.fetch=function(input,options){var raw=typeof input==='string'?input:input.url;
var url=new URL(raw,location.href);
if(url.pathname.endsWith('/__graphql'))return fetchOriginal(base+'graphql.json',{cache:'no-cache'});
if(url.pathname.endsWith('/api/subscribe'))return Promise.resolve(new Response('{"ok":true,"offline":true}',{headers:{'content-type':'application/json'}}));
return fetchOriginal(typeof input==='string'?mapped(raw):input,options);};
var descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,get:descriptor.get,set:function(value){descriptor.set.call(this,mapped(value));}});
var mediaDescriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');
Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,get:mediaDescriptor.get,set:function(value){mediaDescriptor.set.call(this,mapped(value));}});
})();'''.replace('BASE', json.dumps(base)).replace('ASSETS', json.dumps(urlmap, separators=(',',':')))
(out / 'pages-runtime.js').write_text(runtime)
# Use absolute public metadata; no loopback addresses survive the export.
print('Exported', sum(f.is_file() for f in out.rglob('*')), 'files to', out)
print('Public URL:', a.origin.rstrip('/') + base)
