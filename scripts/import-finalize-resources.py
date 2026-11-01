#!/usr/bin/env python3
"""Audit/localize render dependencies, export code attachments, localize course links.
Runs from the imported snapshot; never refetches the course corpus.
"""
import collections,concurrent.futures,hashlib,html,json,mimetypes,pathlib,re,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'public/content';PUBLIC=ROOT/'public'
manifest=json.loads((OUT/'manifest.json').read_text());files=[*OUT.joinpath('pages').glob('*.json'),*OUT.joinpath('challenges').glob('*.json')]
objects={p:json.loads(p.read_text()) for p in files};before={p:json.dumps(v,ensure_ascii=False,separators=(',',':'))+'\n' for p,v in objects.items()}
(OUT/'attachments').mkdir(exist_ok=True);(OUT/'fixtures').mkdir(exist_ok=True);(OUT/'dependencies').mkdir(exist_ok=True)
attachments={};byname=collections.defaultdict(list);count=0;candidates=set();used_by=collections.defaultdict(set)
attrs=re.compile(r'<(?:img|image|video|audio|source|script|iframe|link)\b[^>]*?\b(?:src|href|xlink:href)\s*=\s*["\x27]((?:https?:)?//[^"\x27]+)',re.I)
mdimages=re.compile(r'!\[[^\]]*\]\(((?:https?:)?//[^\s)]+)')
cssurls=re.compile(r'url\(\s*["\x27]?([^\s)"\x27]+)')
fixtures={}
def scan(obj,path):
 global count
 if isinstance(obj,list):
  for v in obj:scan(v,path)
 elif isinstance(obj,dict):
  for key in ('additional_content','additional_files'):
   for a in obj.get(key,[]) if isinstance(obj.get(key,[]),list) else []:
    if isinstance(a,dict) and isinstance(a.get('content'),str) and a.get('file_name'):
     name=pathlib.PurePosixPath(a['file_name']).name;digest=hashlib.sha256(a['content'].encode()).hexdigest()[:20];local=f'/content/attachments/{digest}-{name}'
     (PUBLIC/local.lstrip('/')).write_text(a['content']);a['download_url']=local;attachments[local]={'file_name':a['file_name'],'sha256':hashlib.sha256(a['content'].encode()).hexdigest(),'bytes':len(a['content'].encode())};byname[name].append(local);count+=1
  typ=obj.get('type');content=obj.get('content',{})
  texts=[]
  if isinstance(content,dict):
   if typ in ('MarkdownEditor','Note','SpoilerEditor'):
    texts=[re.sub(r'```.*?```','',content.get('text',''),flags=re.S)]
   elif typ=='JsHtml':texts=[content.get(k,'') for k in ('html_code','css_code','js_code')]
   elif typ=='Code' and content.get('language','').lower() in ('html','css','javascript','js'):
    texts=[content.get('content','')]
    if content.get('comp_id')=='385251ae-5d0c-3646-a8b6-e56dfe04bdff':fixtures['http://api.pythontip.com/course/fake_baidu']={'path':'/content/fixtures/fake-baidu.html','source':'024-1327 / Code 385251ae-5d0c-3646-a8b6-e56dfe04bdff','content':content['content']}
   elif typ=='RunJS':texts=[v.get('content','') for v in content.get('jotted',{}).get('files',[]) if v.get('type') in ('html','css','js')]
  for text in texts:
   for url in attrs.findall(text)+mdimages.findall(text):
    url=html.unescape(url);url='https:'+url if url.startswith('//') else url;candidates.add(url);used_by[url].add(path.name)
   for url in cssurls.findall(text):
    if url.startswith(('https://','http://','//')):
     url='https:'+url if url.startswith('//') else url;candidates.add(url);used_by[url].add(path.name)
  for v in obj.values():scan(v,path)
for path,obj in objects.items():scan(obj,path)
known={x['url']:x for x in manifest.get('failures',[])};resources={};failures=[];css_sources={}
def fetch(url):
 if url in known:return url,None,known[url]['reason']
 existing=manifest.get('assets',{}).get(url)
 if existing and existing.startswith(('/content/','/api/media/')):return url,existing,None
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Brclio-EDU public course importer/1.0'}),timeout=15) as r:data=r.read();mime=r.headers.get_content_type()
  suffix=pathlib.PurePosixPath(urllib.parse.urlsplit(url).path).suffix or mimetypes.guess_extension(mime) or '.bin'
  name=hashlib.sha256(url.encode()).hexdigest()[:20]+suffix;local='/content/dependencies/'+name
  (PUBLIC/local.lstrip('/')).write_bytes(data)
  if mime=='text/css' or suffix=='.css':css_sources[url]=data.decode(errors='replace')
  return url,local,None
 except Exception as e:return url,None,str(e)
for depth in range(4):
 pending=sorted(candidates-set(resources)-{x['url'] for x in failures})
 if not pending:break
 with concurrent.futures.ThreadPoolExecutor(5) as pool:
  for url,local,error in pool.map(fetch,pending):
   if error:failures.append({'url':url,'reason':error,'kind':'render_dependency','pages':sorted(used_by[url])})
   else:resources[url]=local
 for url,css in css_sources.items():
  for dependency in cssurls.findall(css):
   if dependency.startswith(('data:','#')):continue
   absolute=urllib.parse.urljoin(url,dependency);candidates.add(absolute);used_by[absolute].update(used_by[url])
for url,css in css_sources.items():
 def sub(match):
  dep=match.group(1);absolute=urllib.parse.urljoin(url,dep)
  return match.group(0).replace(dep,resources.get(absolute,dep))
 (PUBLIC/resources[url].lstrip('/')).write_text(cssurls.sub(sub,css))
# Intra-course navigation stays on this clone. Source metadata and crawling
# examples remain exact; only teaching prose and HTML link destinations change.
lesson=re.compile(r'https?://edu\.py2fun\.com/(?:learn#)?/?course/(\d+)/page/(\d+)')
course=re.compile(r'https?://edu\.py2fun\.com/(?:learn#)?/?course/(\d+)/(?:overviewn?|catalog)')
changes=collections.Counter()
def rewrite(obj,key=''):
 if isinstance(obj,str):
  result=obj
  if key not in ('source_url','source_api','canvas_json','xml','prev_xml','prev_svg','xml_string'):
   for url,local in resources.items():result=result.replace(url,local)
  if key in ('text','text_html','question_text','question_text_html'):
   result,n=lesson.subn(lambda m:f'#/course/{m[1]}/page/{m[2]}',result);changes['lesson_links']+=n
   result,n=course.subn(lambda m:f'#/course/{m[1]}/catalog',result);changes['course_links']+=n
   result=result.replace('http://archive.ics.uci.edu/ml/machine-learning-databases/auto-mpg/auto-mpg.data',byname['auto-mpg.data'][0])
  return result
 if isinstance(obj,list):return [rewrite(v,key) for v in obj]
 if isinstance(obj,dict):return {k:rewrite(v,k) for k,v in obj.items()}
 return obj
for path,obj in objects.items():
 obj=rewrite(obj);serialized=json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n'
 if serialized!=before[path]:path.write_text(serialized);changes['changed_pages_or_challenges']+=1
# Reproduce the fake-baidu fixture from its complete, supplied lesson HTML.
for original,fixture in fixtures.items():
 content=fixture.pop('content')
 for url,local in resources.items():content=content.replace(url,local)
 (PUBLIC/fixture['path'].lstrip('/')).write_text(content)
(OUT/'fixture-map.json').write_text(json.dumps(fixtures,ensure_ascii=False,indent=2)+'\n')
(OUT/'attachment-index.json').write_text(json.dumps({'attachment_instances':count,'files':attachments},ensure_ascii=False,indent=2)+'\n')
# Known source-template endpoints cannot be copied when unavailable. Keep exact
# code and report the limitation; no synthetic replacement is represented as source.
endpoint_failures=[{'url':'http://api.pythontip.com/course/hello_html','reason':'HTTP 502 Bad Gateway','kind':'exercise_fixture'},{'url':'http://api.pythontip.com/course/fake_baidu','reason':'HTTP 502; identical lesson-supplied HTML is available locally','kind':'exercise_fixture','local_fixture':'/content/fixtures/fake-baidu.html'}]
report={'attachment_instances':count,'unique_attachment_files':len(attachments),'attachment_names':sorted(byname),'render_dependency_candidates':len(candidates),'new_local_dependencies':len(resources),'render_failures':failures,'fixture_map':fixtures,'fixture_endpoint_status':endpoint_failures,'changes':dict(changes),'external_crawling_examples':'Original web-scraping targets (Baidu, Douban, novel and wallpaper sites), package installation instructions and knowledge reference hyperlinks are preserved. They are exercise targets or references, not remotely stored course content.'}
(OUT/'resource-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
manifest['assets'].update(resources)
for local in attachments:manifest['assets']['attachment:'+local]=local
manifest['resource_audit']={k:report[k] for k in ('attachment_instances','unique_attachment_files','new_local_dependencies')}
merged={x['url']:x for x in manifest['failures']};merged.update({x['url']:x for x in failures});merged.update({x['url']:x for x in endpoint_failures if not x.get('local_fixture')});manifest['failures']=list(merged.values())
manifest['asset_count']=len(set(v for v in manifest['assets'].values() if v.startswith(('/content/','/api/media/'))))
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
audit=ROOT/'docs/content-audit.md';text=audit.read_text().split('\n## 最终运行资源审计')[0];text+='\n## 最终运行资源审计\n\n'+json.dumps(report,ensure_ascii=False,indent=2)+'\n';text=re.sub(r'- 本地媒体：\d+',f'- 本地媒体：{manifest["asset_count"]}',text);text=re.sub(r'- 未成功资源：\d+',f'- 未成功资源：{len(manifest["failures"])}',text);audit.write_text(text)
print(json.dumps({**report,'render_failures':len(failures),'fixture_map':list(fixtures)},ensure_ascii=False,indent=2))
