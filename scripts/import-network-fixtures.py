#!/usr/bin/env python3
"""Reproduce exact, bounded public-GET fixtures; never grants arbitrary egress.
The historic index->page-1 adaptation is explicitly documented in sources.json.
This does not promise an entire third-party website or authenticated account data.
"""
import ast,base64,concurrent.futures,datetime,hashlib,json,pathlib,re,urllib.request,urllib.parse,urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/content/fixtures/network';CACHE=ROOT/'data/source/network-fixtures'
OUT.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
urls={};components={}
def scan(value,page):
 if isinstance(value,dict):
  if value.get('type')=='Code':
   c=value.get('content',{});code=c.get('content','');cid=c.get('comp_id','')
   if (c.get('runnable') is not False or cid=='2463fef3-0848-3424-9413-3216e6952f3f') and re.search(r'\b(import requests|from requests|import urllib|from urllib)\b',code):
    components[(page,cid)]=True
    try: strings=[x.value for x in ast.walk(ast.parse(code)) if isinstance(x,ast.Constant) and isinstance(x.value,str)]
    except SyntaxError: strings=re.findall(r'''["'](https?://[^"'\s]+)["']''',code)
    for u in strings:
     if re.match(r'^https?://[^\s]+$',u):
      where=[page,cid]
      if where not in urls.setdefault(u,[]):urls[u].append(where)
  for item in value.values():scan(item,page)
 elif isinstance(value,list):
  for item in value:scan(item,page)
for p in sorted((ROOT/'public/content/pages').glob('*.json')):scan(json.loads(p.read_text()),p.stem)
selected={u:v for u,v in urls.items() if not any(x in u for x in ['accounts.douban.com','douban.com/mine/','%s','{}','img9.doubanio.com'])}
for n in range(1,11):selected[f'http://sj.zol.com.cn/bizhi/1080x1920/{n}.html']=[['024-1339','2463fef3-0848-3424-9413-3216e6952f3f']]
for n in range(0,100,20):selected[f'https://book.douban.com/tag/%E7%BC%96%E7%A8%8B?start={n}&type=T']=[['024-1343','c9e59bac-9a11-39b2-84b4-fc1058ad1ce3']]
recoveries=json.loads((ROOT/'public/content/network-fixture-sources.json').read_text());recovery={e['url']:e for e in recoveries}
for e in recoveries:selected.setdefault(e['url'],[['024-1336','fixed archived resource']])
def download(item):
 url,where=item;key=hashlib.sha256(url.encode()).hexdigest()[:20];meta=CACHE/(key+'.json');body=CACHE/(key+'.body');record=json.loads(meta.read_text()) if meta.exists() else None
 if record and record.get('status')==200 and (ROOT/'public'/record.get('path','').lstrip('/')).exists():return {**record,'where':where}
 result={'url':url,'where':where,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 spec=recovery.get(url);source=spec['source'] if spec else url
 try:
  if spec and spec.get('courseExecution'):
   if url not in ['https://www.biqukan.cc/article/30067/','https://www.biqukan.cc/article/30067/17748491.html']:raise ValueError('Only the two fixed course URLs may use public source execution')
   program='import requests,json,base64\nnotes=[]\nfor attempt in range(3):\n try:\n  r=requests.get('+repr(url)+',timeout=8)\n  print(json.dumps({"status":r.status_code,"url":r.url,"headers":dict(r.headers),"body":base64.b64encode(r.content).decode()}));break\n except Exception as e: notes.append(str(e))\nelse: print(json.dumps({"errors":notes}))'
   payload={**spec['courseExecution'],'language':'python3','source_code':program,'stdin':'','additional_files':'[]','entry_filename':'main.py','time_limit':30}
   request=urllib.request.Request(source,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','Origin':'https://edu.py2fun.com','Referer':'https://edu.py2fun.com/learn/'})
   execution=json.loads(urllib.request.urlopen(request,timeout=45).read())
   captured=json.loads(execution['data']['stdout']);assert captured.get('status')==200,captured
   data=base64.b64decode(captured['body'],validate=True);content_type=captured['headers']['Content-Type'];final_url=captured['url'];result['publicExecutionRequest']=payload;result['responseHeaders']=captured['headers'];result['changedEncoding']={'originalLesson':'gbk','currentResponse':'utf-8'}
  elif spec and spec.get('existing'):data=(ROOT/'public'/spec['existing'].lstrip('/')).read_bytes();content_type=spec['contentType'];final_url=source
  elif spec and spec.get('cacheBody') and (CACHE/spec['cacheBody']).exists():data=(CACHE/spec['cacheBody']).read_bytes();content_type=spec['contentType'];final_url=source
  elif record and not spec:return record
  else:
   req=urllib.request.Request(source,headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.0.0 Safari/537.36'})
   with urllib.request.urlopen(req,timeout=30) as response:data=response.read();content_type=spec['contentType'] if spec else response.headers.get('Content-Type','application/octet-stream');final_url=response.url
  result.update(status=200,contentType=content_type,finalUrl=final_url,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),source=source)
  if spec:result.update(recoveryNote=spec['note'],historicalArchive='web.archive.org' in source,aliases=spec.get('aliases',[]))
  body.write_bytes(data);extension='.jpg' if 'image/jpeg' in content_type else '.html';destination=OUT/(key+extension);destination.write_bytes(data);result['path']='/content/fixtures/network/'+destination.name
  decoded=data.decode('gbk' if 'gbk' in content_type else 'utf-8',errors='replace');requirements=[]
  if 'biqukan.cc/article/30067/' in url:requirements=['mulu_list'] if url.endswith('/') else ['htmlContent']
  if 'douban.com/tag/?view=cloud' in url:requirements=['tagCol']
  if 'douban.com/tag/%' in url:requirements=['subject-item']
  if 'zol.com.cn/bizhi/1080x1920/' in url:requirements=['class="pic"']
  if requirements:result['expectedSelectorsPresent']=all(s in decoded for s in requirements);result['expectedSelectorTokens']=requirements
 except urllib.error.HTTPError as e:result.update(status=e.code,error=str(e))
 except Exception as e:result.update(status=None,error=str(e))
 meta.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(url,result.get('status'),result.get('bytes'),flush=True);return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:results=list(executor.map(download,selected.items()))
mapfile=ROOT/'public/content/fixture-map.json';mapping=json.loads(mapfile.read_text())
for item in results:
 if item.get('status')==200 and item.get('path'):
  value={k:item[k] for k in ['path','contentType','sha256','capturedAt','bytes','finalUrl']};value.update(source=item.get('source',item['url']),recovered=True,capture=item.get('recoveryNote','Current anonymous public response; original historical layout is not assumed.'))
  for url in [item['url']]+item.get('aliases',[]):
   if mapping.get(url,{}).get('adapted'):mapping[url]['raw']=value
   else:mapping[url]=value
  if '%E7%BC%96%E7%A8%8B' in item['url']:mapping[urllib.parse.unquote(item['url'])]=value
mapfile.write_text(json.dumps(mapping,ensure_ascii=False,indent=2)+'\n')
not_requested=[{'url':u,'where':where,'reason':'Requires account credentials/private user data; never captured as a public fixture.' if 'douban.com/mine/' in u or 'accounts.douban.com' in u else 'Image URL is an example dictionary value, not requested by runnable code.'} for u,where in urls.items() if 'accounts.douban.com' in u or 'douban.com/mine/' in u or 'img9.doubanio.com' in u]
report={'networkCodeComponents':len(components),'literalUrlInventory':urls,'captured':sum(x.get('status')==200 for x in results),'failedOriginalRequests':sum(x.get('status')!=200 for x in results),'failed':sum(x.get('status')!=200 and x['url'] not in mapping for x in results),'resolvedByAlias':[x['url'] for x in results if x.get('status')!=200 and x['url'] in mapping],'incompatibleHistoricalResponses':[{'url':x['url'],'where':x['where'],'reason':'Current response has changed encoding and selector structure; archived without fabricating historical HTML.'} for x in results if x.get('status')==200 and x.get('expectedSelectorsPresent') is False],'teachingAdaptations':[{'url':u,'path':v['path'],'rawPath':v.get('raw',{}).get('path'),'audit':'/content/biqukan-compat-audit.json'} for u,v in mapping.items() if v.get('adapted')],'requests':results,'not_requested':not_requested,'limitations':['Fixed GET fixtures do not grant arbitrary internet access.','ZOL first-page endpoint is adapted from the archived directory index and explicitly labeled.','ZOL full crawler is an originally nonrunnable example with an erroneous host-dot URL concatenation. Ten list pages and the lesson fixed detail/image are archived; all dynamically discovered albums are not included.']}
(ROOT/'public/content/network-fixture-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'captured':report['captured'],'failed':report['failed'],'mapEntries':len(mapping)},indent=2))
