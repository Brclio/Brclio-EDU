#!/usr/bin/env python3
"""Mirror publicly readable py2fun courses, never send cookies or authentication.
Run: python3 scripts/import-courses.py [--refresh] [--skip-assets]
Raw API responses are cached in data/source/api; shipped JSON is in public/content.
"""
import argparse, concurrent.futures as cf, datetime, hashlib, json, pathlib, re, subprocess, sys, threading, time, urllib.request, urllib.parse, urllib.error
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/content'
CACHE = ROOT / 'data/source/api'
BASE = 'https://edu.py2fun.com'
parser=argparse.ArgumentParser();parser.add_argument('--refresh',action='store_true');parser.add_argument('--skip-assets',action='store_true');args=parser.parse_args()
lock=threading.Lock(); failures=[]
for p in [OUT/'courses',OUT/'pages',OUT/'challenges',OUT/'assets',CACHE]:p.mkdir(parents=True,exist_ok=True)
def save(path,data):
 path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
def get(path):
 cache=CACHE/(path.strip('/').replace('/','--')+'.json')
 if cache.exists() and not args.refresh:
  return json.loads(cache.read_text())
 for attempt in range(3):
  try:
   req=urllib.request.Request(BASE+path,headers={'User-Agent':'Brclio-EDU public course importer/1.0','Accept':'application/json'})
   with urllib.request.urlopen(req,timeout=35) as res:j=json.load(res)
   if j.get('code') != 0:raise ValueError(str(j.get('msg')))
   save(cache,j['data']);return j['data']
  except urllib.error.HTTPError as e:
   if e.code in (401,403):
    with lock:failures.append({'url':BASE+path,'reason':'authorization_required','status':e.code})
    return None
   error=str(e)
  except Exception as e:error=str(e)
  time.sleep(.5*(attempt+1))
 with lock:failures.append({'url':BASE+path,'reason':error})
 return None

def run(tasks,fn,workers=6,label=''):
 results=[]
 with cf.ThreadPoolExecutor(workers) as pool:
  for i,result in enumerate(pool.map(fn,tasks),1):
   results.append(result)
   if i%50==0:print(f'{label}: {i}/{len(tasks)}',flush=True)
 return results

groups=get('/api/home_courses')
if not groups:raise SystemExit('Unable to retrieve course catalog')
allcourses={c['course_no']:c for g in groups for c in g['courses']}
print('Fetching',len(allcourses),'courses',flush=True)

def course_fetch(no):
 course=get(f'/api/course/{no}/overview')
 if course:
  course['source_url']=f'{BASE}/learn#/course/{no}/catalog'
  course['source_api']=f'{BASE}/api/course/{no}/overview'
 return no,course
courses=dict(run(list(allcourses),course_fetch,label='Courses'))
page_tasks=[];coachids=set()
for no,c in courses.items():
 if not c:continue
 for chapter in c.get('toc',{}).get('categories',[]):
  coachids.update(str(x['id']) for x in chapter.get('coaches',[]))
  for page in chapter.get('pages',[]):
   page_tasks.append((no,page['id']))
   coachids.update(str(x['id']) for x in page.get('coaches',[]))
print('Fetching',len(page_tasks),'lesson pages',flush=True)
def page_fetch(task):
 no,id=task;p=get(f'/api/course/{no}/page/{id}')
 if p:p.update(course_no=no,source_url=f'{BASE}/api/course/{no}/page/{id}')
 return f'{no}-{id}',p
pages=dict(run(page_tasks,page_fetch,label='Pages'))
refs=set()
def references(obj):
 if isinstance(obj,list):
  for v in obj:references(v)
 elif isinstance(obj,dict):
  typ=obj.get('type');c=obj.get('content',{})
  if isinstance(c,dict):
   if typ in ('QuizRef','QuestionRef') and c.get('question_id'):refs.add(('quiz',str(c['question_id'])))
   if typ=='Knowledge' and c.get('knowledge_id'):refs.add(('knowledge',str(c['knowledge_id'])))
   if typ in ('ChallengeRef','Coach') and c.get('challenge_id'):refs.add(('code',str(c['challenge_id'])))
  for v in obj.values():references(v)
for p in pages.values():references(p)
refs.update(('code',x) for x in coachids)
print('Resolving',len(refs),'referenced quizzes, knowledges and challenges',flush=True)
def ref_fetch(task):
 typ,id=task;path=f'/api/knowledge/{id}' if typ=='knowledge' else f'/api/challenge/quiz/v2/{id}' if typ=='quiz' else f'/api/challenge/code/{id}'
 return task,get(path)
resolved=dict(run(sorted(refs),ref_fetch,label='Components'))
while True:
 for obj in list(resolved.values()):references(obj)
 pending=refs-set(resolved)
 if not pending:break
 print('Resolving',len(pending),'nested references',flush=True)
 resolved.update(run(sorted(pending),ref_fetch,label='Nested components'))
def resolve(obj):
 if isinstance(obj,list):
  for v in obj:resolve(v)
 elif isinstance(obj,dict):
  typ=obj.get('type');c=obj.get('content',{});ref=None
  if isinstance(c,dict):
   if typ in ('QuizRef','QuestionRef'):ref=('quiz',str(c.get('question_id')))
   if typ=='Knowledge':ref=('knowledge',str(c.get('knowledge_id')))
   if typ in ('ChallengeRef','Coach'):ref=('code',str(c.get('challenge_id')))
  for v in list(obj.values()):resolve(v)
  if ref:
   obj['resolved']=resolved.get(ref)
   if obj['resolved'] is None:obj['unavailable']=True
for obj in resolved.values():resolve(obj)
for p in pages.values():resolve(p)

# Download only explicit media URLs on the original site's CDN hosts. Never
# follow links in prose, arbitrary origins, endpoints or script instructions.
allowed={'cdn.py2fun.com','python2fun.oss-cn-beijing.aliyuncs.com','pytip-unpkg.oss-cn-hangzhou.aliyuncs.com','api.sololearn.com','www.sololearn.com','programiz-pro-spaces.sfo3.digitaloceanspaces.com','upload.wikimedia.org','img.icons8.com'}
urlpattern=re.compile(r'(?:https?:)?//(?:'+ '|'.join(re.escape(host) for host in sorted(allowed)) +r')/[^\s<>"\x27`\\);]+')
urls=set()
def collect(obj):
 if isinstance(obj,str):
  for match in urlpattern.findall(obj):
   if urllib.parse.urlparse(match if match.startswith('http') else 'https:'+match).path.lower().endswith(('.png','.jpg','.jpeg','.gif','.webp','.svg','.mp4','.mp3','.webm','.avif','.csv','.zip','.txt','.json','.html')):urls.add(match)
 elif isinstance(obj,list):
  for v in obj:collect(v)
 elif isinstance(obj,dict):
  for v in obj.values():collect(v)
for obj in [courses,pages,resolved,list(allcourses.values())]:collect(obj)
assets={}
def download(original):
 url=original if original.startswith('http') else 'https:'+original
 suffix=pathlib.PurePosixPath(urllib.parse.urlparse(url).path).suffix.lower()
 name=hashlib.sha256(url.encode()).hexdigest()[:20]+suffix;dst=OUT/'assets'/name
 if dst.exists() and dst.stat().st_size>0:return original,'/content/assets/'+name
 archive=ROOT/'data/source/media'/name
 if archive.exists() and archive.stat().st_size>0:return original,'/content/assets/'+name
 for attempt in range(2):
  try:
   req=urllib.request.Request(urllib.parse.quote(url,safe=':/%?=&+'),headers={'User-Agent':'Brclio-EDU public course importer/1.0'})
   with urllib.request.urlopen(req,timeout=25) as response:data=response.read()
   if not data:raise ValueError('empty resource')
   dst.write_bytes(data);return original,'/content/assets/'+name
  except Exception as e:error=str(e)
 with lock:failures.append({'url':url,'reason':error,'kind':'asset'})
 return original,url
if not args.skip_assets:
 print('Mirroring',len(urls),'media resources',flush=True)
 assets=dict(run(sorted(urls),download,workers=8,label='Assets'))
media_index={}
for original,local in list(assets.items()):
 if not local.startswith('/content/assets/') or not local.endswith('.mp4'):continue
 name=local.rsplit('/',1)[1];source=OUT/'assets'/name;archive=ROOT/'data/source/media'/name
 if not source.exists():source=archive
 if not source.exists() or source.stat().st_size<=24*1024*1024:continue
 archive.parent.mkdir(parents=True,exist_ok=True)
 if source!=archive:
  source.replace(archive);source=archive
 media_id=source.stem;parts=[];digest=hashlib.sha256()
 (OUT/'media-parts').mkdir(exist_ok=True)
 with source.open('rb') as stream:
  part_no=0
  while chunk:=stream.read(8*1024*1024):
   part_name=f'{media_id}-{part_no}.bin';target=OUT/'media-parts'/part_name
   target.write_bytes(chunk);digest.update(chunk)
   parts.append({'path':'/content/media-parts/'+part_name,'size':len(chunk)})
   part_no+=1
 media_index[media_id]={'size':source.stat().st_size,'type':'video/mp4','parts':parts,'sha256':digest.hexdigest()}
 assets[original]='/api/media/'+media_id
save(OUT/'media-index.json',media_index)
def localize(obj):
 if isinstance(obj,str):
  return urlpattern.sub(lambda m:assets.get(m.group(),m.group() if m.group().startswith('http') else 'https:'+m.group()),obj)
 if isinstance(obj,list):return [localize(v) for v in obj]
 if isinstance(obj,dict):return {k:localize(v) for k,v in obj.items()}
 return obj
stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
counts={};types={};qtypes={}
for key,p in pages.items():
 if not p:continue
 no=p['course_no'];counts[no]=counts.get(no,0)+1
 save(OUT/'pages'/f'{key}.json',localize(p))
 def count(obj):
  if isinstance(obj,list):
   for v in obj:count(v)
  elif isinstance(obj,dict):
   if 'type'in obj and 'content'in obj:types[obj['type']]=types.get(obj['type'],0)+1
   if 'question_type'in obj:qtypes[obj['question_type']]=qtypes.get(obj['question_type'],0)+1
   for v in obj.values():count(v)
 count(p)
for (typ,id),obj in resolved.items():
 if typ=='code' and obj:save(OUT/'challenges'/f'{id}.json',localize(obj))
for no,c in courses.items():
 if c:
  c['imported_pages']=counts.get(no,0)
  save(OUT/'courses'/f'{no}.json',localize(c))
catalog={'source_url':BASE+'/learn#/course/list','imported_at':stamp,'categories':[{'name':g['cate'],'courseNos':[c['course_no'] for c in g['courses']]} for g in groups], 'courses':[dict(localize(c),imported_pages=counts.get(no,0)) for no,c in allcourses.items()]}
save(OUT/'catalog.json',catalog)
manifest={'imported_at':stamp,'course_count':len(courses),'page_count':sum(counts.values()),'expected_page_count':len(page_tasks),'reference_count':len(refs),'resolved_reference_count':sum(v is not None for v in resolved.values()),'challenge_count':sum(typ=='code' and bool(v) for (typ,id),v in resolved.items()),'asset_count':sum(v.startswith(('/content/','/api/media/')) for v in assets.values()),'chunked_media_count':len(media_index),'component_types':types,'question_types':qtypes,'failures':failures,'assets':assets}
save(OUT/'manifest.json',manifest)
report=['# 课程导入审计','',f'来源：{BASE}/learn#/course/list',f'抓取时间（UTC）：{stamp}','','全部请求匿名执行，不发送 Cookie 或身份认证。目录中的 lock 状态仅保留为来源元数据；是否导入由公开 API 的实际响应决定。','',f'- 分类：{len(groups)}',f'- 课程：{len(courses)}',f'- 课节：{sum(counts.values())} / {len(page_tasks)}',f'- 引用组件：{manifest["resolved_reference_count"]} / {len(refs)}',f'- 代码挑战：{manifest["challenge_count"]}',f'- 本地媒体：{manifest["asset_count"]}',f'- 未成功资源：{len(failures)}','','## 各课程','','| 课程 | 名称 | 导入课节 |','| --- | --- | ---: |']
for no,c in allcourses.items():report.append(f'| {no} | {c["title"]} | {counts.get(no,0)} |')
report+=['','## 组件类型','',json.dumps(types,ensure_ascii=False,indent=2),'','## 题型','',json.dumps(qtypes,ensure_ascii=False,indent=2),'','## 可复现命令','','`python3 scripts/import-courses.py` 使用匿名 API 缓存；`--refresh` 重新获取，`--skip-assets` 跳过媒体下载。','', '原始响应保存在 `data/source/api/`；课程目录、课节正文及图片位于 `public/content/`。源 API 的字段和课程文本保持原样，媒体 URL 替换为本地路径。引用组件使用 `resolved` 字段内联，原始引用保留。','', '交互实现与课程内容导入分开验收：课程 API 有些代码题没有公开测试用例，不能将运行成功等同于通过判题。']
if failures:report+=['','## 未成功资源','',*['- '+str(x) for x in failures]]
(ROOT/'docs/content-audit.md').write_text('\n'.join(report)+'\n')
if not args.skip_assets:
 subprocess.run([sys.executable,str(ROOT/'scripts/import-svg-assets.py')],check=True)
 subprocess.run([sys.executable,str(ROOT/'scripts/import-finalize-resources.py')],check=True)
 subprocess.run([sys.executable,str(ROOT/'scripts/import-recover-resources.py')],check=True)
 manifest=json.loads((OUT/'manifest.json').read_text())
print(json.dumps({k:v for k,v in manifest.items() if k not in ('assets','failures')},ensure_ascii=False,indent=2),flush=True)
