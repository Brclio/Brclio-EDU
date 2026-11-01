#!/usr/bin/env python3
"""Resolve image dependencies inside SVG assets/animation frames as data URIs.
Only observed, explicit <image href> / <img src> media references are fetched.
The result is safe for SVG displayed through an img or a data URL, where browsers
otherwise block external image dependencies. Original vector artwork is retained.
"""
import base64,concurrent.futures,hashlib,html,json,mimetypes,pathlib,re,urllib.error,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'public/content';PUBLIC=ROOT/'public'
MANIFEST=OUT/'manifest.json';manifest=json.loads(MANIFEST.read_text());assets=manifest['assets'];failures=[]
failure_cache=ROOT/'data/source/svg-failures.json'
known_failures=json.loads(failure_cache.read_text()) if failure_cache.exists() else {}
known_failures.update({x['url']:x for x in manifest.get('failures',[]) if x.get('kind')=='svg_dependency'})
allowed={'cdn.py2fun.com','python2fun.oss-cn-beijing.aliyuncs.com','img.icons8.com','www.educative.io','190621-dot-educative-hesive.appspot.com','programiz-pro-spaces.sfo3.digitaloceanspaces.com','upload.wikimedia.org','api.sololearn.com','www.sololearn.com'}
image_ref=re.compile(r'(<(?:image|img)\b[^>]*?\b(?:xlink:href|href|src)\s*=\s*)(["\x27])(.*?)\2',re.I|re.S)
normalize=lambda u:'https:'+u if u.startswith('//') else u
lookup={normalize(k):v for k,v in assets.items()};checked=set();svgtexts={}
rawdir=ROOT/'data/source/svg-assets';rawdir.mkdir(parents=True,exist_ok=True)

def image_urls(text):
 return [html.unescape(m.group(3)) for m in image_ref.finditer(text)]
def collect_refs(obj):
 if isinstance(obj,str) and '<svg' in obj:
  return image_urls(obj)
 if isinstance(obj,list):return [u for v in obj for u in collect_refs(v)]
 if isinstance(obj,dict):return [u for v in obj.values() for u in collect_refs(v)]
 return []
jsonfiles=[*OUT.joinpath('pages').glob('*.json'),*OUT.joinpath('challenges').glob('*.json')]
jsonobjects={p:json.loads(p.read_text()) for p in jsonfiles}
def prefer_embedded_frames(obj):
 if isinstance(obj,list):
  for v in obj:prefer_embedded_frames(v)
 elif isinstance(obj,dict):
  if obj.get('svg_xml') and 'canvas_json' in obj:obj['svg_string']=obj['svg_xml']
  for v in obj.values():prefer_embedded_frames(v)
for obj in jsonobjects.values():prefer_embedded_frames(obj)
pending=set(u for obj in jsonobjects.values() for u in collect_refs(obj))

def fetch_image(url):
 normalized=normalize(url)
 if normalized in lookup:return url,lookup[normalized]
 if normalized in known_failures:return url,known_failures[normalized]
 parsed=urllib.parse.urlparse(normalized)
 if parsed.scheme not in ('http','https') or parsed.netloc not in allowed:return url,None
 try:
  req=urllib.request.Request(urllib.parse.quote(normalized,safe=':/%?=&+'),headers={'User-Agent':'Brclio-EDU public course importer/1.0'})
  with urllib.request.urlopen(req,timeout=20) as r:data=r.read();mime=r.headers.get_content_type()
  if mime not in ('image/svg+xml','image/png','image/jpeg','image/gif','image/webp','image/avif'):raise ValueError('Not an image: '+mime)
  ext={'image/svg+xml':'.svg','image/jpeg':'.jpg'}.get(mime,mimetypes.guess_extension(mime) or '.img')
  name=hashlib.sha256(normalized.encode()).hexdigest()[:20]+ext;path=OUT/'assets'/name;path.write_bytes(data)
  return url,'/content/assets/'+name
 except Exception as e:return url,{'url':normalized,'reason':str(e),'kind':'svg_dependency'}

for depth in range(6):
 for path in OUT.joinpath('assets').glob('*.svg'):
  if path not in svgtexts:
   raw=rawdir/path.name
   if not raw.exists():raw.write_bytes(path.read_bytes())
   text=raw.read_text(errors='replace');svgtexts[path]=text;pending.update(image_urls(text))
 pending={normalize(u) for u in pending if normalize(u) not in checked and not u.startswith(('data:','/content/'))}
 if not pending:break
 print('SVG image dependencies:',len(pending),flush=True)
 with concurrent.futures.ThreadPoolExecutor(6) as pool:
  for url,result in pool.map(fetch_image,sorted(pending)):
   checked.add(normalize(url))
   if isinstance(result,str):lookup[normalize(url)]=result;assets[url]=result
   elif isinstance(result,dict):failures.append(result)
 pending=set()

encoded={};count=0

def embed_svg(text,chain=()):
 global count
 def replace(match):
  global count
  url=html.unescape(match.group(3));normalized=normalize(url)
  if normalized.startswith('data:'):return match.group(0)
  local=url if url.startswith('/content/') else lookup.get(normalized)
  if not local or not local.startswith('/content/assets/'):return match.group(0)
  path=PUBLIC/local.lstrip('/')
  if not path.is_file() or path in chain:return match.group(0)
  if path not in encoded:
   if path.suffix=='.svg':
    raw=rawdir/path.name
    if not raw.exists():raw.write_bytes(path.read_bytes())
    data=embed_svg(raw.read_text(errors='replace'),chain+(path,)).encode();mime='image/svg+xml'
   else:data=path.read_bytes();mime=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
   encoded[path]='data:'+mime+';base64,'+base64.b64encode(data).decode()
  count+=1
  return match.group(1)+match.group(2)+encoded[path]+match.group(2)
 return image_ref.sub(replace,text)

for path,text in svgtexts.items():path.write_text(embed_svg(text,(path,)))
def transform(obj):
 if isinstance(obj,str):return embed_svg(obj) if '<svg' in obj else obj
 if isinstance(obj,list):return [transform(v) for v in obj]
 if isinstance(obj,dict):
  if 'canvas_json' in obj and (obj.get('svg_xml') or obj.get('svg_string')):
   svg=embed_svg(obj.get('svg_xml') or obj['svg_string'])
   local=obj.get('file','')
   if not local.startswith('/content/assets/') or not (PUBLIC/local.lstrip('/')).is_file():
    name=hashlib.sha256(svg.encode()).hexdigest()[:20]+'.svg';local='/content/assets/'+name
    (OUT/'assets'/name).write_text(svg)
    assets['embedded-frame:'+name]=local
   return {**{k:transform(v) for k,v in obj.items() if k not in ('svg_string','svg_xml','file')},'file':local}
  return {k:transform(v) for k,v in obj.items()}
 return obj
for path,obj in jsonobjects.items():path.write_text(json.dumps(transform(obj),ensure_ascii=False,separators=(',',':'))+'\n')
# Preserve earlier failed requests, deduplicating repeated maintenance runs.
merged={x['url']:x for x in manifest.get('failures',[]) if x.get('kind')!='svg_dependency'}
merged.update({x['url']:x for x in failures})
known_failures.update({x['url']:x for x in failures})
failure_cache.write_text(json.dumps(known_failures,ensure_ascii=False,separators=(',',':'))+'\n')
manifest['failures']=list(merged.values());manifest['svg_embedded_references']=count;manifest['assets']=assets
manifest['asset_count']=len(set(v for v in assets.values() if v.startswith(('/content/','/api/media/'))))
MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
audit=ROOT/'docs/content-audit.md';text=audit.read_text().split('\n## SVG 图像依赖审计')[0]
text=re.sub(r'- 本地媒体：\d+',f'- 本地媒体：{manifest["asset_count"]}',text)
text=re.sub(r'- 未成功资源：\d+',f'- 未成功资源：{len(manifest["failures"])}',text)
text+='\n## SVG 图像依赖审计\n\n图解SVG及动画帧中嵌入 '+str(count)+' 处图像引用，使其不依赖源站加载子图像。保留原始SVG于 `data/source/svg-assets/`。\n\n'
text+='超24MiB视频按8MiB分块，原始文件保存在 `data/source/media/`，`media-index.json` 保留完整字节长度与SHA-256，无转码。通过 `/api/media/{id}` 的 Range 接口播放。\n\n'
text+='动画帧SVG外置为独立本地文件，`canvas_objects[].file` 是显示路径，其余帧元数据保留；原始内嵌SVG可从 `data/source/api/` 恢复。\n\n'
text+='SVG依赖失败：'+str(len(failures))+'\n'
for failure in failures:text+='- '+str(failure)+'\n'
audit.write_text(text)
print(json.dumps({'svg_assets':len(svgtexts),'embedded_references':count,'failure_count':len(failures),'asset_count':manifest['asset_count']},ensure_ascii=False,indent=2))
