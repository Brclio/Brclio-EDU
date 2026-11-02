#!/usr/bin/env python3
"""Recover legacy media from verified public copies or explicit source diagrams.
Reconstructed resources are labelled in recovery-report.json, never represented
as byte-identical downloads. Original code URLs survive in source_content.
"""
import base64,gzip,hashlib,json,pathlib,re,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'public/content';PUBLIC=ROOT/'public';(OUT/'recovered').mkdir(exist_ok=True)
manifest=json.loads((OUT/'manifest.json').read_text());recovered=[];mapping={}
def download(name,url,mime):
 p=OUT/'dependencies'/name
 if not p.exists():
  with urllib.request.urlopen(url,timeout=35) as r:data=r.read()
  if data[:2]==b'\x1f\x8b':data=gzip.decompress(data)
  p.write_bytes(data)
 data=p.read_bytes()
 if data[:2]==b'\x1f\x8b':data=gzip.decompress(data);p.write_bytes(data)
 return '/content/dependencies/'+name,{'retrieved_from':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'mime':mime}
css='https://img3.doubanio.com/f/book/e87e3a06f234a06e09ded94a5855bc6f50390ccd/css/book/master.css'
wallpaper='https://sjbz-fd.zol-img.com.cn/t_s320x510c5/g6/M00/0E/07/ChMkKV-NICeIOAUKAEr-VrVkwWAAAD5UQDbYv8ASv5u449.jpg'
video='https://cdn.py2fun.com/course/spider/03/img/biqnet.mp4'
items=[('biqnet.mp4',video,'video/mp4',[video,'https://cdn.py2fun.com/course/spider/03/img/bignet.mp4','https://cdn.py2fun.com/course/spider/03/img/bi\tqnet.mp4'],'024-1329','Browser URL normalization removes an embedded tab from bi\\tqnet.mp4; the lesson HTML copy had the separate bignet typo.'),('douban.css','https://web.archive.org/web/20210317012743id_/'+css,'text/css',[css],'024-1325','Original CSS restored from Internet Archive snapshot 2021-03-17.'),('wallpaper.jpg','https://web.archive.org/web/20201123140617id_/'+wallpaper,'image/jpeg',[wallpaper],'024-1334','Original JPEG restored from Internet Archive snapshot 2020-11-23.')]
for name,fetch_url,mime,originals,page,method in items:
 local,info=download(name,fetch_url,mime)
 for source in originals:mapping[source]=local
 recovered.append({'originals':originals,'path':local,'page':page,'method':method,'reconstructed':False,**info})
# The lesson retains the exact mxGraph cell (97 x 50, rotation=90, red fill,
# black 2 px stroke) and image box (52 x 99). Re-render that original diagram
# from the official Slender Left Arrow stencil (97.5 x 60 coordinates).
arrow_url='https://190621-dot-educative-hesive.appspot.com/api/collection/10370001/5474278013140992/page/5420466032345088/image/5723261830692864'
svg='<svg xmlns="http://www.w3.org/2000/svg" width="52" height="99" viewBox="0 0 52 99"><title>Restored from the original mxGraph arrow model</title><g transform="matrix(0 1 -1 0 51 1)"><path d="M97 16.666666667 L18.405128205 16.666666667 L18.405128205 0 L0 25 L18.405128205 50 L18.405128205 33.333333333 L97 33.333333333 Z" fill="#CC0000" stroke="#000000" stroke-width="2" stroke-linejoin="miter"/></g></svg>'
arrow='/content/recovered/stack-push-arrow.svg';(PUBLIC/arrow.lstrip('/')).write_text(svg);mapping[arrow_url]=arrow
encoded='data:image/svg+xml;base64,'+base64.b64encode(svg.encode()).decode();arrow_files=[]
for path in OUT.joinpath('assets').glob('*.svg'):
 text=path.read_text(errors='replace')
 if arrow_url in text:path.write_text(text.replace(arrow_url,encoded));arrow_files.append('/content/assets/'+path.name)
 elif encoded in text:arrow_files.append('/content/assets/'+path.name)
recovered.append({'originals':[arrow_url],'path':arrow,'page':'004-119','method':'Re-rendered from original frame objects_dict mxGraph model and official Slender Left Arrow stencil, preserving geometry, rotation, colors and stroke. This is a reconstruction, not the lost source file.','reconstructed':True,'stencil_source':'https://raw.githubusercontent.com/jgraph/drawio/v20.8.16/src/main/webapp/stencils/arrows.xml','patched_svg_assets':arrow_files})
# Screenshot 024-1328 includes the complete DOM and both exact link targets.
hello='''<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>python爬虫学习</title></head>
<body>
<div>python 爬虫学习开始啦</div>
<div><ul>
<li><a href="http://www.pythontip.com">pythontip官网</a></li>
<li><a href="http://www.baidu.com">爬虫小试牛刀</a></li>
</ul></div>
</body>
</html>
'''
hello_path='/content/fixtures/hello-html.html';(PUBLIC/hello_path.lstrip('/')).write_text(hello)
fixture_path=OUT/'fixture-map.json';fixtures=json.loads(fixture_path.read_text()) if fixture_path.exists() else {}
fixtures['http://api.pythontip.com/course/hello_html']={'path':hello_path,'reconstructed':True,'fidelity':'reconstructed-from-course-evidence','historicalIdentityClaimed':False,'source':'Exact visible DOM from original course screenshot 024-1328; page title and appearance confirmed by screenshot 024-1326.','evidence':['/content/assets/3d15310d283264478709.png','/content/assets/092b5a8fd988c6c75643.png']}
fixtures.setdefault('http://api.pythontip.com/course/fake_baidu',{'path':'/content/fixtures/fake-baidu.html','source':'Complete original HTML Code component in lesson 024-1327'})
fixture_path.write_text(json.dumps(fixtures,ensure_ascii=False,indent=2)+'\n')
recovered.append({'originals':['http://api.pythontip.com/course/hello_html'],'path':hello_path,'pages':['024-1326','024-1328'],'method':fixtures['http://api.pythontip.com/course/hello_html']['source'],'reconstructed':True})
recovered.append({'originals':['http://api.pythontip.com/course/fake_baidu'],'path':'/content/fixtures/fake-baidu.html','page':'024-1327','method':'Exported the complete HTML already present in the original lesson Code component; no replacement text invented.','reconstructed':False,'recovery_type':'exported_original_html'})
changed=[]
def rewrite(obj,key=''):
 if isinstance(obj,str):
  if key in ('source_content','source_url','source_api'):return obj
  for source,local in mapping.items():obj=obj.replace(source,local)
  return obj
 if isinstance(obj,list):return [rewrite(v,key) for v in obj]
 if isinstance(obj,dict):
  result={k:rewrite(v,k) for k,v in obj.items()}
  if obj.get('type')=='Code' and isinstance(obj.get('content'),dict):
   before=obj['content'].get('content');after=result['content'].get('content')
   if before!=after:result['content']['source_content']=obj['content'].get('source_content',before)
  return result
 return obj
for path in [*OUT.joinpath('pages').glob('*.json'),*OUT.joinpath('challenges').glob('*.json')]:
 original=path.read_text();obj=json.loads(original);updated=json.dumps(rewrite(obj),ensure_ascii=False,separators=(',',':'))+'\n'
 if updated!=original:path.write_text(updated);changed.append(path.name)
for k,v in mapping.items():manifest['assets'][k]=v
for url,entry in fixtures.items():manifest['assets']['fixture:'+url]=entry['path']
resolved_urls=set(mapping)|set(fixtures)
manifest['failures']=[f for f in manifest['failures'] if f['url'] not in resolved_urls]
manifest['asset_count']=len(set(v for v in manifest['assets'].values() if v.startswith(('/content/','/api/media/'))))
manifest['recoveries']=recovered
manifest['recovery_summary']={'scope':'Six initially registered course resource recovery groups only; not all dynamically discoverable crawler targets or original bytes of reconstructed files.','downloaded_original_files':3,'exported_original_html':1,'reconstructed_from_original_evidence':2,'unresolved_required_resources':len(manifest['failures'])}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
report={'summary':manifest['recovery_summary'],'recovered':recovered,'fixture_map':fixtures,'changed_pages':changed,'remaining_required_resource_failures':manifest['failures'],'unused_dependencies':[{'asset':'/content/dependencies/douban.css','count':103,'type':'site-wide CSS icon URLs','evidence':'Chromium computed styles checked every original HTML example DOM element and ::before/::after; backgroundImage/listStyleImage/borderImageSource/maskImage/content/cursor contained zero URL usages. These icons are not used by the supplied author-introduction example.'}],'external_web_scraping':'Fixed public GET responses are separately archived in fixture-map.json. Dynamic crawler targets and private-account examples remain outside that bounded archive; see docs/content-fidelity-audit.md.','reproduce':'python3 scripts/import-all.py (courses, fixed fixtures, datasets and browser runtime); python3 scripts/import-recover-resources.py (six recovery groups only); python3 scripts/import-verify.py (local integrity check)'}
(OUT/'recovery-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
# Final audit references the current outcome rather than stale failed attempts.
audit_path=OUT/'resource-audit.json';audit=json.loads(audit_path.read_text());audit['recoveries']=recovered;audit['remaining_required_resource_failures']=manifest['failures'];audit['fixture_map']=fixtures;audit_path.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
doc=ROOT/'docs/content-audit.md';text=doc.read_text().split('\n## 失效资源恢复结果')[0];text=re.sub(r'- 本地媒体：\d+',f'- 本地媒体：{manifest["asset_count"]}',text);text=re.sub(r'- 未成功资源：\d+',f'- 最初登记的六组资源处理后下载失败：{len(manifest["failures"])}（含 2 个明确标注的重建版本；动态爬虫及私人登录边界见末节）',text);text=text.replace('## 未成功资源','## 初次抓取失败历史（已恢复，见末节）').replace('## 最终运行资源审计','## 恢复前运行资源审计（历史）');text+='\n## 失效资源恢复结果\n\n本节仅统计初次登记的六组资源恢复，剩余下载失败为 '+str(len(manifest['failures']))+'。3 个原文件通过原站纠正 URL 或公开归档取回；1 个教学 HTML 从原课件完整源码导出；2 个素材根据原课程证据重建。零下载失败不表示重建文件与失效原件字节相同，也不表示动态爬虫目标已全站归档；最新 exact/adapted/remaining 对照见 [内容一致性复核](content-fidelity-audit.md)。\n\n'+json.dumps(report,ensure_ascii=False,indent=2)+'\n';doc.write_text(text)
print(json.dumps({'recovered_groups':len(recovered),'changed_pages':len(changed),'patched_svg_assets':len(arrow_files),'remaining_required_resource_failures':manifest['failures'],'asset_count':manifest['asset_count']},ensure_ascii=False,indent=2))
