import re,json,hashlib,concurrent.futures,urllib.request
from pathlib import Path
out=Path('output/reference-fonts');out.mkdir(parents=True,exist_ok=True)
manifest=out/'map.json'
known=json.loads(manifest.read_text()) if manifest.exists() else {}
files=[Path('output/article-reference/vendor.css'),Path('output/quiz-visual/source-article-vendor.css'),Path('output/quiz-visual/source-solo.css')]
urls=set()
for f in files:urls.update(u.strip('\"\'')for u in re.findall(r'url\(([^)]+)\)',f.read_text())if'KaTeX'in u and'.woff2'in u and u.strip('\"\'').startswith(('https:', '//')))
def get(u):
 url=('https:'+u)if u.startswith('//')else u
 name=hashlib.sha256(url.encode()).hexdigest()[:12]+'.woff2';p=out/name
 if not p.exists():
  with urllib.request.urlopen(url,timeout=20)as r:p.write_bytes(r.read())
 return u,'/'+str(p)
with concurrent.futures.ThreadPoolExecutor(max_workers=6)as ex:
 pairs=list(ex.map(get,urls))
for f in files:
 s=f.read_text()
 for old,new in pairs:s=s.replace(old,new)
 f.write_text(s)
known.update(dict(pairs))
manifest.write_text(json.dumps(known,indent=2))
print('Cached',len(pairs),'original font files')
