#!/usr/bin/env python3
"""Verify imported catalog, every referenced lesson/challenge, and local media.
Exit nonzero for broken local references, missing pages or incomplete references.
Known unavailable source media is reported from the manifest, not hidden.
"""
import collections,hashlib,json,pathlib,re,sys
ROOT=pathlib.Path(__file__).resolve().parents[1];PUBLIC=ROOT/'public';CONTENT=PUBLIC/'content'
errors=[];stats=collections.Counter();media=set();streamed=set();visited=set();references=set();page_keys=set();course_keys=set()
def read(path):
 try:return json.loads(path.read_text())
 except (OSError,ValueError) as e:errors.append(f'{path.relative_to(ROOT)}: {e}');return {}
def walk(obj,where):
 if isinstance(obj,str):
  for url in re.findall(r'/content/[a-zA-Z0-9_./%+~-]+',obj):media.add(url)
  streamed.update(re.findall(r'/api/media/([a-zA-Z0-9_.-]+)',obj))
 elif isinstance(obj,list):
  for val in obj:walk(val,where)
 elif isinstance(obj,dict):
  kind=obj.get('type');content=obj.get('content') or {}
  if kind in ('Knowledge','KnowledgeRef','QuizRef','QuestionRef','ChallengeRef','CodeChallengeRef','Coach'):
   if not (obj.get('resolved') or content.get('resolved')):errors.append(f'{where}: unresolved {kind}')
   family,field=('knowledge','knowledge_id') if kind in ('Knowledge','KnowledgeRef') else ('quiz','question_id') if kind in ('QuizRef','QuestionRef') else ('code','challenge_id')
   if content.get(field) is None:errors.append(f'{where}: missing reference id for {kind}')
   else:references.add((family,str(content[field])))
  for val in obj.values():walk(val,where)
catalog=read(CONTENT/'catalog.json')
for course in catalog.get('courses',[]):
 no=course['course_no']
 if no in course_keys:errors.append('Duplicate catalog course: '+no)
 course_keys.add(no);stats['courses']+=1;c=read(CONTENT/'courses'/f'{no}.json');walk(c,no)
 for chapter in c.get('toc',{}).get('categories',[]):
  coaches=chapter.get('coaches',[])
  for p in chapter.get('pages',[]):
   key=f'{no}-{p["id"]}'
   if key in page_keys:errors.append('Duplicate course lesson: '+key)
   page_keys.add(key);page=read(CONTENT/'pages'/f'{key}.json');walk(page,key);stats['pages']+=1
   coaches=coaches+p.get('coaches',[])
  for coach in coaches:
   key=str(coach['id'])
   if key in visited:continue
   visited.add(key);challenge=read(CONTENT/'challenges'/f'{key}.json');walk(challenge,key)
walk(catalog,'catalog')
for path in CONTENT.joinpath('challenges').glob('*.json'):
 walk(read(path),path.name);stats['challenges']+=1;references.add(('code',path.stem))
stats['reference_resources']=len(references)
for url in media:
 if not (PUBLIC/url.lstrip('/')).is_file():errors.append('Missing local media: '+url)
manifest=read(CONTENT/'manifest.json')
media_index=read(CONTENT/'media-index.json')
for media_id in streamed:
 entry=media_index.get(media_id)
 if not entry:errors.append('Missing video index: '+media_id);continue
 total=0;digest=hashlib.sha256()
 for part in entry['parts']:
  path=PUBLIC/part['path'].lstrip('/')
  if not path.is_file():errors.append('Missing video part: '+str(path));continue
  data=path.read_bytes();total+=len(data);digest.update(data)
  if len(data)!=part['size']:errors.append('Video part size mismatch: '+str(path))
 if total!=entry['size']:errors.append('Video size mismatch: '+media_id)
 if entry.get('sha256') and digest.hexdigest()!=entry['sha256']:errors.append('Video SHA256 mismatch: '+media_id)
if stats['courses']!=manifest.get('course_count'):errors.append('Course count differs from manifest')
if stats['pages']!=manifest.get('page_count'):errors.append('Page count differs from manifest')
if stats['pages']!=manifest.get('expected_page_count'):errors.append('Not all expected pages were imported')
if stats['challenges']!=manifest.get('challenge_count'):errors.append('Challenge count differs from manifest')
if len(references)!=manifest.get('reference_count'):errors.append('Reference resource count differs from manifest')
if len(references)!=manifest.get('resolved_reference_count'):errors.append('Not all expected references were resolved')
if manifest.get('failures'):errors.append('Source import manifest contains unresolved failures')
large=[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size} for p in CONTENT.rglob('*') if p.is_file() and p.stat().st_size>25*1024*1024]
if large:errors.append('Content files exceed the 25 MiB deployment limit')
print(json.dumps({'verified':not errors,'counts':dict(stats),'local_media_references':len(media),'chunked_videos':len(streamed),'source_failures':manifest.get('failures',[]),'files_over_25_MiB':large,'errors':errors},ensure_ascii=False,indent=2))
sys.exit(bool(errors))
