#!/usr/bin/env python3
"""Archive fixed course execution datasets; ordinary anonymous public course API only."""
import base64,csv,hashlib,io,json,pathlib,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'public/content/runtime-data';CACHE=ROOT/'data/source/runtime-data';OUT.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
manifest={'files':{},'notes':['raw_data.csv and books.txt are exact original course-server fixture bytes retrieved through the public course code execution endpoint.','Boston is the historical dataset required by the original lesson, recovered from the official scikit-learn 1.1.3 repository.','Flights uses original full month names, as seaborn 0.10 did; course 009/398 filters January.']}
for name,course,page,comp in [('raw_data.csv','007','307','3E5iHNuJtFNw0_EiKyB8b'),('books.txt','019','1091','6c439693-e3fb-36ff-bc0b-b3a3b98b40d6')]:
 original='/usercode/books.txt' if name=='books.txt' else name
 payload={'language':'python3','source_code':f'import base64\nprint(base64.b64encode(open({original!r}, "rb").read()).decode())','stdin':'','course_no':course,'page_id':page,'comp_id':comp,'additional_files':'[]','entry_filename':'main.py','time_limit':30}
 cache=CACHE/(name+'.response.json')
 if not cache.exists():
  req=urllib.request.Request('https://edu.py2fun.com/api/course/code/execute',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','Origin':'https://edu.py2fun.com','Referer':'https://edu.py2fun.com/learn/'})
  cache.write_bytes(urllib.request.urlopen(req,timeout=45).read())
 response=json.loads(cache.read_text());assert response['code']==0 and response['data']['status']==0,response
 data=base64.b64decode(response['data']['stdout'].strip(),validate=True);(OUT/name).write_bytes(data)
 manifest['files'][name]={'path':'/content/runtime-data/'+name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'source':'https://edu.py2fun.com/api/course/code/execute','course':course,'page':page,'component':comp,'original_filename':original,'recovery':'original course fixture bytes','request':payload}
for name,url in [('flights.csv','https://raw.githubusercontent.com/mwaskom/seaborn-data/master/flights.csv'),('boston_house_prices.csv','https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.1.3/sklearn/datasets/data/boston_house_prices.csv'),('boston_house_prices.rst','https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.1.3/sklearn/datasets/descr/boston_house_prices.rst')]:
 cache=CACHE/name
 if not cache.exists():cache.write_bytes(urllib.request.urlopen(url,timeout=40).read())
 data=cache.read_bytes();(OUT/name).write_bytes(data)
 manifest['files'][name]={'path':'/content/runtime-data/'+name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'source':url,'recovery':'upstream original dataset'}
raw=list(csv.DictReader(io.StringIO((OUT/'raw_data.csv').read_text())));assert len(raw)==780 and raw[0]['SN']=='Lisim78' and raw[1]['SN']=='Lisovynya38'
assert len(list(csv.DictReader(io.StringIO((OUT/'flights.csv').read_text()))))==144
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:{'bytes':v['bytes'],'sha256':v['sha256']} for k,v in manifest['files'].items()},indent=2))
