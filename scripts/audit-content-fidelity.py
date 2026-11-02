#!/usr/bin/env python3
"""Independent snapshot/source/resource fidelity audit; read-only except its reports.
--live checks the anonymous catalog, all course overviews and first/last pages.
No login, cookies or account endpoints are contacted.
"""
import argparse,base64,collections,concurrent.futures,datetime,hashlib,html,importlib.util,json,pathlib,re,shutil,subprocess,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];PUBLIC=ROOT/'public';OUT=PUBLIC/'content';CACHE=ROOT/'data/source/api'
sha=lambda b:hashlib.sha256(b.encode() if isinstance(b,str)else b).hexdigest()
def read(p):return json.loads(p.read_text())
def scalar_walk(x,trail=''):
 if isinstance(x,dict):
  for k,v in x.items():yield from scalar_walk(v,trail+'/'+k)
 elif isinstance(x,list):
  for i,v in enumerate(x):yield from scalar_walk(v,trail+'/'+str(i))
 else:yield trail,x
ap=argparse.ArgumentParser();ap.add_argument('--live',action='store_true');ap.add_argument('--verify-media',action='store_true');args=ap.parse_args()
manifest=read(OUT/'manifest.json');fixture=read(OUT/'fixture-map.json');media=read(OUT/'media-index.json')
report={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'all current published course data and dependencies against cached anonymous original API responses','errors':[],'renderExternal':[],'localMissing':[],'svgExternal':[],'fixtureBodies':[],'live':[],'limitations':['Cached raw responses provide the complete content comparison; optional live checks sample first/last pages, not every source endpoint.','Direct downloads lacking an independent raw copy are source-mapped and hashed here, not claimed independently byte-verified against today\'s live CDN.','A fixed scraping response is historical/current captured data, not a mirror of every dynamically discoverable third-party page.']}
# Re-run the existing complete raw-field comparison independently of old reports.
js="import {scan} from './scripts/audit-content.mjs'; const r=await scan();console.log(JSON.stringify(r.sourceComparison));"
report['rawComparison']=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT))
assets=manifest['assets'];mapping={}
for u,p in assets.items():
 if u.startswith(('http://','https://','//')):mapping[u]=p
 if u.startswith('//'):mapping['https:'+u]=p
for r in manifest.get('recoveries',[]):
 for u in r.get('originals',[]):mapping[u]=r['path']
pattern=re.compile('|'.join(re.escape(u)for u in sorted(mapping,key=len,reverse=True)))
def localize(s):return pattern.sub(lambda m:mapping[m.group()],s)
def compare(raw,pub,where,counts,issues):
 if isinstance(raw,dict):
  if not isinstance(pub,dict):issues.append({'where':where,'kind':'missing-object'});return
  for k,v in raw.items():compare(v,pub.get(k),where+'/'+k,counts,issues)
 elif isinstance(raw,list):
  if not isinstance(pub,list)or len(raw)!=len(pub):issues.append({'where':where,'kind':'array-length','source':len(raw),'actual':len(pub)if isinstance(pub,list)else None});return
  for i,(a,b)in enumerate(zip(raw,pub)):compare(a,b,where+'/'+str(i),counts,issues)
 else:
  counts['fields']+=1
  if raw==pub:counts['exact']+=1
  elif isinstance(raw,str)and isinstance(pub,str)and localize(raw)==localize(pub):counts['localized']+=1
  else:issues.append({'where':where,'kind':'changed-field','sourceHash':sha(json.dumps(raw,ensure_ascii=False)),'currentHash':sha(json.dumps(pub,ensure_ascii=False))})
cat=read(OUT/'catalog.json');groups=read(CACHE/'api--home_courses.json');cc=collections.Counter();ci=[]
members=[c for g in groups for c in g['courses']]
# Source categories repeat the same course; the importer retains one course
# record per course_no and every category membership separately.
expected=list({c['course_no']:c for c in members}.values());actual=cat['courses'];compare(expected,actual,'catalog/courses',cc,ci)
compare([{'name':g['cate'],'courseNos':[c['course_no']for c in g['courses']]}for g in groups],cat['categories'],'catalog/categories',cc,ci)
for c in actual:
 no=c['course_no'];compare(read(CACHE/f'api--course--{no}--overview.json'),read(OUT/f'courses/{no}.json'),'courses/'+no,cc,ci)
report['catalogComparison']={**cc,'courses':len(actual),'sourceCategoryMemberships':len(members),'sourceUniqueCourses':len(expected),'issues':ci}
report['errors']+=report['rawComparison']['issues']+ci
# Every local reference, including nested fixture paths and media parts.
local_refs=collections.defaultdict(list);streamed=set();jsonfiles=[OUT/'catalog.json',*OUT.joinpath('courses').glob('*.json'),*OUT.joinpath('pages').glob('*.json'),*OUT.joinpath('challenges').glob('*.json')]
for p in jsonfiles:
 for trail,value in scalar_walk(read(p)):
  if not isinstance(value,str):continue
  for u in re.findall(r'/content/[A-Za-z0-9_./%+~-]+',value):local_refs[u].append({'file':str(p.relative_to(PUBLIC)),'trail':trail})
  streamed.update(re.findall(r'/api/media/([A-Za-z0-9_.-]+)',value))
for u,where in local_refs.items():
 if not (PUBLIC/u.lstrip('/')).is_file():report['localMissing'].append({'path':u,'uses':where[:4]})
report['localReferences']={'distinct':len(local_refs),'instances':sum(len(v)for v in local_refs.values())}
report['streamedMedia']=[]
for mid in sorted(streamed):
 entry=media.get(mid);d=hashlib.sha256();n=0;errors=[]
 if not entry:report['errors'].append({'missingMediaIndex':mid});continue
 for part in entry['parts']:
  path=PUBLIC/part['path'].lstrip('/')
  if not path.is_file():errors.append('missing '+part['path']);continue
  b=path.read_bytes();d.update(b);n+=len(b)
  if len(b)!=part['size']:errors.append('wrong part size '+part['path'])
 digest=d.hexdigest();raw=ROOT/'data/source/media'/f'{mid}.mp4'
 row={'id':mid,'size':n,'sha256':digest,'matchesIndex':n==entry['size']and digest==entry['sha256'],'originalCacheAvailable':raw.is_file(),'originalCacheMatches':sha(raw.read_bytes())==digest if raw.is_file()else None,'errors':errors};report['streamedMedia'].append(row)
 if not row['matchesIndex']or row['originalCacheMatches']is False or errors:report['errors'].append({'media':mid,'details':row})
# Active render inputs only. Code samples in Markdown stay literal.
ATTR=re.compile(r'<(?:img|image|video|audio|source|script|iframe|link)\b[^>]*?\b(?:src|href|xlink:href)\s*=\s*["\x27]([^"\x27]+)',re.I|re.S)
CSS=re.compile(r'url\(\s*["\x27]?([^\s)"\x27]+)',re.I)
MD=re.compile(r'!\[[^\]]*\]\(([^\s)]+)')
def external(u):return u.startswith(('http://','https://','//'))
def inspect_text(text,file,trail,kind):
 if not isinstance(text,str):return
 clean=re.sub(r'```.*?```|~~~.*?~~~','',text,flags=re.S)if kind=='markdown'else text
 for u in ATTR.findall(clean)+CSS.findall(clean)+(MD.findall(clean)if kind=='markdown'else[]):
  u=html.unescape(u)
  if external(u):report['renderExternal'].append({'file':file,'trail':trail,'kind':kind,'url':u})
def inspect(v,file,trail=''):
 if isinstance(v,list):
  for i,x in enumerate(v):inspect(x,file,trail+'/'+str(i))
 elif isinstance(v,dict):
  typ=v.get('type');d=v.get('content',{})
  if isinstance(d,dict):
   if typ in ['MarkdownEditor','Markdown','Text','Note','SpoilerEditor']:inspect_text(d.get('text')or d.get('text_html',''),file,trail+'/content/text','markdown')
   if typ in ['Image','CanvasImage','Video']:
    u=d.get('file')or d.get('src')or d.get('url')or''
    if external(u):report['renderExternal'].append({'file':file,'trail':trail,'kind':typ,'url':u})
   if typ=='JsHtml':
    for k in ['html_code','css_code','js_code','hiddenJS','hidden_js']:inspect_text(d.get(k,''),file,trail+'/content/'+k,'web-example')
   if typ=='RunJS':
    for i,x in enumerate(d.get('jotted',{}).get('files',[])):inspect_text(x.get('content',''),file,trail+f'/content/jotted/files/{i}','web-example')
   if typ=='Code'and d.get('language')in ['html','html5','css','js','javascript']:inspect_text(d.get('content',''),file,trail+'/content/content','web-code')
  if 'question_type'in v:
   inspect_text(v.get('question_text')or v.get('question_text_html',''),file,trail+'/question_text','markdown')
   for i,o in enumerate(v.get('question_options',[])):
    inspect_text(o.get('text')or o.get('text_html',''),file,trail+f'/options/{i}','markdown');e=o.get('explanation')or{};inspect_text(e.get('md_text')or e.get('md_html',''),file,trail+f'/options/{i}/explanation','markdown')
  for k,x in v.items():
   if isinstance(x,(dict,list)):inspect(x,file,trail+'/'+k)
for p in jsonfiles:inspect(read(p),str(p.relative_to(PUBLIC)))
# SVG embedded images may themselves be SVG data URLs; inspect recursively.
svgseen=set();svgcount=0;embedded=0
IMAGE=re.compile(r'<(?:image|img)\b[^>]*?\b(?:xlink:href|href|src)\s*=\s*["\x27](.*?)["\x27]',re.I|re.S)
def svgscan(text,where,depth=0):
 global embedded
 key=sha(text)
 if key in svgseen:return
 svgseen.add(key)
 for raw in IMAGE.findall(text):
  u=html.unescape(raw)
  if u.startswith('data:image/svg+xml'):
   embedded+=1
   if depth>12:report['errors'].append({'svgNestingTooDeep':where});continue
   try:
    head,data=u.split(',',1);b=base64.b64decode(data)if';base64'in head else urllib.parse.unquote(data).encode();svgscan(b.decode(),where+'#embedded',depth+1)
   except Exception as e:report['errors'].append({'invalidEmbeddedSvg':where,'reason':str(e)})
  elif external(u):report['svgExternal'].append({'file':where,'url':u})
  elif u.startswith('/content/')and not(PUBLIC/u.lstrip('/')).is_file():report['errors'].append({'missingSvgDependency':where,'path':u})
for p in OUT.rglob('*.svg'):
 svgcount+=1;svgscan(p.read_text(errors='replace'),str(p.relative_to(PUBLIC)))
report['svgDependencies']={'files':svgcount,'uniqueSvgBodies':len(svgseen),'embeddedSvgImages':embedded,'external':len(report['svgExternal'])}
# Pinned fixture bytes and honest origin categories.
bybody=collections.defaultdict(list)
for u,item in fixture.items():bybody[item['path']].append((u,item))
for local,entries in bybody.items():
 p=PUBLIC/local.lstrip('/');item=entries[0][1]
 if not p.is_file():report['errors'].append({'missingFixture':local});continue
 b=p.read_bytes();digest=sha(b)
 for alias,entry in entries:
  if entry.get('sha256')and digest!=entry['sha256']:report['errors'].append({'fixtureHashMismatch':local,'alias':alias})
 category='reconstructed-from-course-evidence'if item.get('reconstructed')else 'adapted-teaching-response'if item.get('adapted')else 'adapted-endpoint'if any('/1080x1920/1.html'in u for u,_ in entries)else 'exported-original-lesson-html'if local.endswith('fake-baidu.html')else 'archived-original-response'if'web.archive.org'in item.get('source','')else 'current-public-response'
 row={'path':local,'bytes':len(b),'sha256':digest,'aliases':[u for u,_ in entries],'classification':category,'source':item.get('source'),'historicalIdentityClaimed':False if category in ['adapted-teaching-response','adapted-endpoint','reconstructed-from-course-evidence','current-public-response']else None}
 if item.get('raw'):
  raw=item['raw'];rp=PUBLIC/raw['path'].lstrip('/');row['raw']={'path':raw['path'],'sha256':sha(rp.read_bytes()),'matchesRecorded':sha(rp.read_bytes())==raw['sha256']}
  if not row['raw']['matchesRecorded']:report['errors'].append({'fixtureRawHashMismatch':raw['path']})
 report['fixtureBodies'].append(row)
report['fixtureSummary']={'aliases':len(fixture),'bodies':len(bybody),'classification':dict(collections.Counter(x['classification']for x in report['fixtureBodies']))}
report['recoveries']=read(OUT/'recovery-report.json')['recovered']
report['remainingExecutionBoundaries']=read(OUT/'network-fixture-audit.json')['limitations']
report['runtimeDatasets']=[]
for name,item in read(OUT/'runtime-data/manifest.json')['files'].items():
 p=PUBLIC/item['path'].lstrip('/');b=p.read_bytes();record={**item,'matchesRecorded':sha(b)==item['sha256']and len(b)==item['bytes']};record.pop('request',None);report['runtimeDatasets'].append(record)
 if not record['matchesRecorded']:report['errors'].append({'runtimeDatasetHashMismatch':name})
if args.verify_media:
 from PIL import Image
 import xml.etree.ElementTree as ET
 counts=collections.Counter();formats=collections.Counter();issues=[]
 for p in OUT.rglob('*'):
  if not p.is_file():continue
  try:
   if p.suffix.lower()in ['.png','.jpg','.jpeg','.gif','.webp','.avif','.bmp','.ico']:
    with Image.open(p)as im:formats[im.format]+=1;im.verify()
    counts['raster']+=1
   elif p.suffix.lower()=='.svg':ET.fromstring(p.read_bytes());counts['svg']+=1
  except Exception as e:issues.append({'path':str(p.relative_to(ROOT)),'reason':str(e)})
 videos=[]
 if shutil.which('ffprobe'):
  for p in sorted(OUT.rglob('*.mp4'))+sorted((ROOT/'data/source/media').glob('*.mp4')):
   result=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,codec_type,width,height','-of','json',str(p)],capture_output=True,text=True)
   videos.append({'path':str(p.relative_to(ROOT)),'validContainer':result.returncode==0,'metadata':json.loads(result.stdout)if result.returncode==0 else{},'error':result.stderr.strip()})
   if result.returncode:issues.append({'invalidVideo':str(p.relative_to(ROOT))})
 report['mediaValidation']={'counts':dict(counts),'formats':dict(formats),'videos':videos,'issues':issues,'method':'Pillow image verification, XML parsing and ffprobe container/stream inspection; video frames are not transcoded or exhaustively decoded.'}
 report['errors']+=issues
# Publish per-asset hashes without claiming an absent independent source hash.
reverse=collections.defaultdict(list)
for u,p in assets.items():reverse[p].append(u)
report['assetFiles']=[]
for local,origins in sorted(reverse.items()):
 if not local.startswith('/content/'):continue
 p=PUBLIC/local.lstrip('/')
 if not p.is_file():report['errors'].append({'missingManifestAsset':local});continue
 b=p.read_bytes();raw=ROOT/'data/source/svg-assets'/p.name
 report['assetFiles'].append({'path':local,'size':len(b),'sha256':sha(b),'sourceUrls':[u for u in origins if external(u)],'independentRawSvgAvailable':raw.is_file()if p.suffix=='.svg'else False})
if args.live:
 paths=['/api/home_courses']+[f'/api/course/{c["course_no"]}/overview'for c in actual]
 for c in actual:
  no=c['course_no'];pages=[p for chapter in read(OUT/f'courses/{no}.json')['toc']['categories']for p in chapter.get('pages',[])]
  for p in [pages[0],pages[-1]]:paths.append(f'/api/course/{no}/page/{p["id"]}')
 def fetch(api):
  record={'api':api};cached=CACHE/(api.strip('/').replace('/','--')+'.json')
  try:
   req=urllib.request.Request('https://edu.py2fun.com'+api,headers={'User-Agent':'Brclio-EDU public fidelity audit/1.0','Accept':'application/json'})
   with urllib.request.urlopen(req,timeout=25)as response:payload=json.load(response)
   if payload.get('code')!=0:raise ValueError('Public API code '+str(payload.get('code')))
   current=payload['data'];old=read(cached);a=dict(scalar_walk(old));b=dict(scalar_walk(current));changes=[key for key in sorted(a.keys()|b.keys())if a.get(key)!=b.get(key)]
   record.update(status='ok',cachedCanonicalSha256=sha(json.dumps(old,sort_keys=True,ensure_ascii=False)),liveCanonicalSha256=sha(json.dumps(current,sort_keys=True,ensure_ascii=False)),changedFields=changes)
   (ROOT/'data/source/fidelity-live').mkdir(exist_ok=True);(ROOT/'data/source/fidelity-live'/cached.name).write_text(json.dumps(current,ensure_ascii=False,separators=(',',':'))+'\n')
  except Exception as e:record.update(status='error',reason=str(e))
  return record
 with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:report['live']=list(pool.map(fetch,paths))
report['summary']={'courses':len(actual),'pages':report['rawComparison']['pages'],'challenges':report['rawComparison']['challenges'],'sourceScalarFields':report['rawComparison']['scalarFieldsCompared'],'sourceExactFields':report['rawComparison']['unchangedFields'],'sourceLocalizedFields':report['rawComparison']['localizedFields'],'frameExternalizations':report['rawComparison']['verifiedFrameExternalizations'],'sourceComparisonIssues':len(report['rawComparison']['issues'])+len(ci),'renderExternal':len(report['renderExternal']),'svgExternal':len(report['svgExternal']),'missingLocalReferences':len(report['localMissing']),'assetFilesHashed':len(report['assetFiles']),'fixtureAliases':len(fixture),'fixtureBodies':len(bybody),'errors':len(report['errors']),'liveRequests':len(report['live']),'liveChanged':sum(bool(r.get('changedFields'))for r in report['live']),'liveErrors':sum(r['status']=='error'for r in report['live'])}
(ROOT/'tests').mkdir(exist_ok=True)
(ROOT/'tests/content-fidelity-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report['summary'],ensure_ascii=False,indent=2))
raise SystemExit(bool(report['errors']or report['renderExternal']or report['svgExternal']or report['localMissing']or report['summary']['liveChanged']or report['summary']['liveErrors']))
