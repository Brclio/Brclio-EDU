#!/usr/bin/env python3
"""Build explicitly adapted teaching fixtures from TWO captured public responses.
No additional novel pages are fetched, no chapters/paragraphs are invented.
The current server page is paginated; this preserves only its actual captured part.
"""
import base64,datetime,hashlib,html,json,pathlib,re
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Parts(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.stack=[];self.title='';self.h3=[];self.uls=[];self.current=None;self.link=None;self.paragraphs=[];self.ptext=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);self.stack.append(tag)
  if tag=='ul':self.current={'attrs':a,'links':[]};self.uls.append(self.current)
  if tag=='a' and self.current is not None:self.link={'href':a.get('href',''),'text':''}
  if tag=='h3':self.h3.append('')
  if tag=='p':self.ptext=''
 def handle_endtag(self,tag):
  if tag=='a' and self.link is not None:
   if self.current is not None:self.current['links'].append(self.link)
   self.link=None
  if tag=='ul':self.current=None
  if tag=='p' and self.ptext is not None:self.paragraphs.append(self.ptext);self.ptext=None
  if tag in self.stack:
   while self.stack:
    if self.stack.pop()==tag:break
 def handle_data(self,text):
  if 'title' in self.stack:self.title+=text
  if self.link is not None:self.link['text']+=text
  if 'h3' in self.stack and self.h3:self.h3[-1]+=text
  if self.ptext is not None:self.ptext+=text
sha=lambda b:hashlib.sha256(b).hexdigest()
mapfile=ROOT/'public/content/fixture-map.json';mapping=json.loads(mapfile.read_text());results=[]
for kind,url in [('index','https://www.biqukan.cc/article/30067/'),('chapter','https://www.biqukan.cc/article/30067/17748491.html')]:
 current=mapping[url];raw_path=current.get('raw',{}).get('path',current['path']);raw=(ROOT/'public'/raw_path.lstrip('/')).read_bytes();text=raw.decode('utf-8');parsed=Parts();parsed.feed(text)
 assert '凡人修仙之仙界篇' in parsed.title, 'Captured page does not match the requested book'
 raw_record=current.get('raw') or {**current}
 if kind=='index':
  candidates=[u for u in parsed.uls if 'section-list' in u['attrs'].get('class','').split()]
  listing=max(candidates,key=lambda u:len(u['links']))['links'];assert len(listing)==100
  assert any(a['href']=='/article/30067/17748491.html' and a['text']=='第一章 狐女' for a in listing)
  assert all(re.fullmatch(r'/article/30067/\d+\.html',a['href']) for a in listing)
  body='<ul class="mulu_list">'+''.join('<li><a href="'+a['href'].split('/')[-1]+'">'+html.escape(a['text'])+'</a></li>' for a in listing)+'</ul>'
  details={'chapterLinks':len(listing),'chapterLinkSha256':sha(json.dumps(listing,ensure_ascii=False,separators=(',',':')).encode()),'adaptations':['Wrap current main section-list in the historical mulu_list selector.','Convert only the /article/30067/ URL prefix to relative filenames, matching original target+href code.','Transcode UTF-8 source text to strict GBK; no replacement characters.'],'scope':'Exactly the 100 entries on this captured current index page; not the entire historical novel catalogue.'}
 else:
  assert any('第一章 狐女' in heading for heading in parsed.h3)
  encoded=re.findall(r"document\.writeln\(qsbs\.bb\('([A-Za-z0-9+/=]+)'\)\);",text);assert encoded
  paragraphs=[]
  for value in encoded:
   fragment=base64.b64decode(value,validate=True).decode('utf-8');assert re.fullmatch(r'<p>[\s\S]*</p>',fragment)
   p=Parts();p.feed(fragment);assert len(p.paragraphs)==1;paragraphs.extend(p.paragraphs)
  assert len(paragraphs)==31, len(paragraphs)
  body='<div id="htmlContent" class="chapter-content">'+''.join('&nbsp;'*4+html.escape(p)+'<br/>' for p in paragraphs)+'</div>'
  details={'paragraphs':len(paragraphs),'decodedParagraphSha256':sha(json.dumps(paragraphs,ensure_ascii=False,separators=(',',':')).encode()),'adaptations':['Decode public, inline qsbs.bb Base64 paragraph payloads already present in the response; no extra requests or access-control changes.','Place those existing paragraphs under historical htmlContent/chapter-content selectors with the lesson four-NBSP paragraph delimiter.','Transcode UTF-8 source text to strict GBK; no replacement characters.'],'scope':'Only 第一章 狐女 第1页 captured at the exact original URL. The current website splits this chapter across pages; no missing paragraphs are invented.'}
 title=html.escape(parsed.title);document='<!doctype html><html><head><meta charset="gbk"><meta name="archive-status" content="adapted teaching fixture; current raw response preserved separately"><title>'+title+'</title></head><body>'+body+'</body></html>'
 output=document.encode('gbk');assert output.decode('gbk')==document
 destination='/content/fixtures/network/biqukan-'+kind+'-teaching-gbk.html';(ROOT/'public'/destination.lstrip('/')).write_bytes(output)
 mapping[url]={'path':destination,'contentType':'text/html; charset=gbk','bytes':len(output),'sha256':sha(output),'source':url,'recovered':False,'adapted':True,'raw':raw_record,'capture':'Explicit teaching compatibility adaptation from the captured current real response. Not claimed to be historical original HTML.','details':details}
 results.append({'url':url,'raw':{'path':raw_path,'bytes':len(raw),'sha256':sha(raw),'title':parsed.title},'adapted':{'path':destination,'bytes':len(output),'sha256':sha(output)},**details})
mapfile.write_text(json.dumps(mapping,ensure_ascii=False,indent=2)+'\n')
report={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'scripts/import-biqukan-compat.py','recoveredHistoricalHtml':False,'results':results,'notes':['Original editable lesson code remains unchanged.','The raw original-URL responses are permanently preserved with hashes.','Compatibility fixtures are transformed educational inputs, not forged original HTTP responses.']}
(ROOT/'public/content/biqukan-compat-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps([{k:v for k,v in x.items() if k in ['url','chapterLinks','paragraphs']} for x in results],ensure_ascii=False))
