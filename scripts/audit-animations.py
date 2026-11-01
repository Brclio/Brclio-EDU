#!/usr/bin/env python3
"""Audit every imported animation against each original frame (offline).
--prepare writes reference SVGs under data/source for browser pixel comparisons.
--repair exports each frame by its own rendered content hash; never reuses the
source 'file' merely because that file exists. Raw cache is only needed here;
public source signatures in the report allow later integrity checks.
"""
import argparse,base64,collections,hashlib,html,json,pathlib,re,urllib.parse
ROOT=pathlib.Path(__file__).resolve().parents[1];PUBLIC=ROOT/'public';CONTENT=PUBLIC/'content'
IMAGE=re.compile(r'(<(?:image|img)\b[^>]*?\b(?:xlink:href|href|src)\s*=\s*)(["\x27])(.*?)\2',re.I|re.S)
sha=lambda s:hashlib.sha256(s.encode() if isinstance(s,str) else s).hexdigest()
def normalized(u):return 'https:'+u if u.startswith('//') else u
class Resolver:
 def __init__(self,mapping):self.mapping={normalized(k):v for k,v in mapping.items()};self.cache={};self.uri_cache={};self.missing=set()
 def embed(self,text,chain=()):
  def image(m):
   uri=html.unescape(m.group(3));new=uri
   if uri.startswith('data:image/svg+xml'):
    key=sha(uri)
    if key not in self.uri_cache:
     header,payload=uri.split(',',1)
     try:
      raw=base64.b64decode(payload).decode() if ';base64' in header else urllib.parse.unquote(payload)
      embedded=self.embed(raw,chain)
      self.uri_cache[key]=uri if embedded==raw else 'data:image/svg+xml;base64,'+base64.b64encode(embedded.encode()).decode()
     except (ValueError,UnicodeDecodeError):self.uri_cache[key]=uri
    new=self.uri_cache[key]
   elif not uri.startswith('data:'):
    local=uri if uri.startswith('/content/') else self.mapping.get(normalized(uri))
    if not local or not local.startswith('/content/'):
     self.missing.add(uri);return m.group(0)
    path=PUBLIC/local.lstrip('/')
    if not path.is_file() or path in chain:self.missing.add(uri);return m.group(0)
    if path not in self.cache:
     if path.suffix.lower()=='.svg':data=self.embed(path.read_text(),chain+(path,)).encode();mime='image/svg+xml'
     else:
      data=path.read_bytes();mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'}.get(path.suffix.lower(),'application/octet-stream')
     self.cache[path]='data:'+mime+';base64,'+base64.b64encode(data).decode()
    new=self.cache[path]
   return m.group(1)+m.group(2)+new+m.group(2)
  return IMAGE.sub(image,text)
def animations(obj):
 if isinstance(obj,list):
  for v in obj:yield from animations(v)
 elif isinstance(obj,dict):
  if obj.get('type')=='CanvasAnimation':yield obj['content']
  for v in obj.values():yield from animations(v)
def semantic(obj):
 if isinstance(obj,dict):return {k:semantic(v) for k,v in obj.items() if k not in ('dirty','path','prev_path')}
 if isinstance(obj,list):return [semantic(v) for v in obj]
 return obj

def audit_pixels():
 from PIL import Image,ImageChops
 path=ROOT/'tests/animation-rendering-audit.json';report=json.loads(path.read_text());groups=collections.defaultdict(list);blank=[]
 for frame in report['frames']:
  if frame.get('error'):continue
  image=Image.open(ROOT/frame['screenshot']).convert('RGB')
  frame['pixel_sha256']=sha(image.tobytes())
  box=ImageChops.difference(image,Image.new('RGB',image.size,'white')).getbbox();frame['nonwhite_bbox']=box
  if not box:blank.append(frame['key'])
  if frame['page']=='004-117':frame['graphic_crop_sha256']=sha(image.crop((0,0,600,260)).tobytes())
  groups[(frame['page'],frame['animation_id'])].append(frame)
 identical=[];review=[]
 for (page,aid),frames in groups.items():
  grouped=collections.defaultdict(list)
  for frame in frames:grouped[frame['pixel_sha256']].append(frame)
  for same in grouped.values():
   if len(same)<2:continue
   record={'page':page,'animation_id':aid,'frames':sorted(f['index'] for f in same),'distinct_source_model_count':len({f['source_model_sha256'] for f in same}),'distinct_source_svg_count':len({f['expected_sha256'] for f in same})}
   identical.append(record)
   if record['distinct_source_model_count']>1 and record['distinct_source_svg_count']>1:review.append(record)
 report['summary']={'frames':len(report['frames']),'render_errors':sum(bool(f.get('error')) for f in report['frames']),'blank_frames':len(blank),'duplicate_pixel_groups':len(identical),'review_required_same_pixels_different_source_models':len(review),'stack_004_117_distinct_graphic_crops':len({f.get('graphic_crop_sha256') for f in report['frames'] if f['page']=='004-117'})}
 report.update(blank_frames=blank,duplicate_pixel_groups=identical,review_required=review)
 path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report['summary'],ensure_ascii=False,indent=2))

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--prepare',action='store_true');ap.add_argument('--repair',action='store_true');ap.add_argument('--pixels',action='store_true');args=ap.parse_args()
 if args.pixels:return audit_pixels()
 manifest=json.loads((CONTENT/'manifest.json').read_text());resolver=Resolver(manifest['assets'])
 report={'animations':[],'errors':[]};stats=collections.Counter();reference_dir=ROOT/'data/source/animation-reference';reference_dir.mkdir(exist_ok=True)
 for path in sorted((CONTENT/'pages').glob('*.json')):
  pub=json.loads(path.read_text());pa=list(animations(pub))
  if not pa:continue
  no,pid=path.stem.split('-',1);rawpath=ROOT/f'data/source/api/api--course--{no}--page--{pid}.json'
  if not rawpath.exists():report['errors'].append('Missing raw source '+str(rawpath));continue
  raw=json.loads(rawpath.read_text());ra={a['comp_id']:a for a in animations(raw)};changed=False
  for animation in pa:
   aid=animation['comp_id'];source=ra.get(aid)
   if not source:report['errors'].append(f'{path.name}: missing source animation {aid}');continue
   frames=animation.get('canvas_objects',[]);rawframes=source.get('canvas_objects',[])
   if len(frames)!=len(rawframes):report['errors'].append(f'{path.name}:{aid}: frame count changed');continue
   item={'page':path.stem,'animation_id':aid,'frames':[]};stats['animations']+=1
   for i,(frame,original) in enumerate(zip(frames,rawframes)):
    stats['frames']+=1;svg=original.get('svg_xml') or original.get('svg_string')
    if not svg:report['errors'].append(f'{path.name}:{aid}:{i}: no source SVG');continue
    expected=resolver.embed(svg);digest=sha(expected);actual_path=PUBLIC/frame['file'].lstrip('/');actual=actual_path.read_bytes();actualsha=sha(actual)
    rec={'index':i,'source_svg_sha256':sha(svg),'source_model_sha256':sha(json.dumps(semantic(original.get('objects_dict',{})),ensure_ascii=False,sort_keys=True)),'expected_sha256':digest,'actual_sha256':actualsha,'actual_path':frame['file'],'source_file':original.get('file'),'expected_equals_actual_bytes':digest==actualsha}
    if digest!=actualsha:stats['different_serialization_frames']+=1
    if args.prepare:
     rp=reference_dir/f'{path.stem}-{aid}-{i}.svg';rp.write_text(expected);rec['reference_path']='/'+str(rp.relative_to(ROOT))
    if args.repair:
     local='/content/assets/'+digest[:20]+'.svg';dest=PUBLIC/local.lstrip('/')
     if not dest.exists():dest.write_text(expected)
     if frame.get('file')!=local:frame['file']=local;changed=True;stats['updated_frame_paths']+=1
     frame['source_svg_sha256']=sha(svg);frame['rendered_svg_sha256']=digest
     manifest['assets']['animation-frame:'+digest[:20]]=local
     rec['actual_path']=local;rec['actual_sha256']=digest;rec['expected_equals_actual_bytes']=True
    item['frames'].append(rec)
   for start in range(len(item['frames'])):
    for end in range(start+1,len(item['frames'])):
     a,b=item['frames'][start],item['frames'][end]
     if a['actual_sha256']==b['actual_sha256'] and a['expected_sha256']!=b['expected_sha256']:
      report['errors'].append(f'{path.name}:{aid}: exported frames {start}/{end} collapse distinct source SVGs')
   report['animations'].append(item)
  if args.repair and changed:path.write_text(json.dumps(pub,ensure_ascii=False,separators=(',',':'))+'\n');stats['updated_pages']+=1
 report['summary']=dict(stats);report['unresolved_image_dependencies']=sorted(resolver.missing)
 if resolver.missing:report['errors'].append(f'{len(resolver.missing)} unresolved image dependencies')
 (ROOT/'tests').mkdir(exist_ok=True);(ROOT/'tests/animation-data-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 if args.repair:
  manifest['animation_frame_audit']={'animations':stats['animations'],'frames':stats['frames'],'unresolved_dependencies':len(resolver.missing),'content_addressed':True}
  manifest['asset_count']=len(set(v for v in manifest['assets'].values() if v.startswith(('/content/','/api/media/'))))
  (CONTENT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
 print(json.dumps({'summary':dict(stats),'errors':report['errors'],'unresolved_image_dependencies':sorted(resolver.missing)},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
