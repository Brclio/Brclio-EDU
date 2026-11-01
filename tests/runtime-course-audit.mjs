/** Static inventory of every imported Python editor; optional real browser Worker execution.
 * node tests/runtime-course-audit.mjs [--run] [--filter=007-308] [--limit=40] [--parallel=2]
 * The source course code is never changed. Execution uses its original hidden code and files.
 */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
const root=process.cwd(), publicRoot=path.join(root,'public');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const [k,v]=s.replace(/^--/,'').split('=');return[k,v??true]}));
const hash=s=>createHash('sha256').update(s).digest('hex');
const records=[];
const reportPath=String(args.output||'tests/runtime-course-audit.json');
const titles=Object.fromEntries(JSON.parse(await fs.readFile('public/content/catalog.json','utf8')).courses.map(c=>[c.course_no,c.title]));
function add(data,file,kind,position){
 const language=String(data.language||'python3').toLowerCase();
 if(!language.startsWith('python')&&language!=='py')return;
 const visible=String(data.content??data.template??'');
 const prefix=data.hidden_code_content?.prepend_code||data.prepend_code||data.template_head||'';
 const suffix=data.hidden_code_content?.append_code||data.append_code||data.template_tail||'';
 const code=[prefix,visible,suffix].filter(Boolean).join('\n');
 const files=data.additional_content||data.additional_files||[];
 records.push({key:`${file}:${data.comp_id||data.id||position}`,file,page:path.basename(file,'.json'),course:file.includes('/pages/')?path.basename(file).slice(0,3):null,kind,id:data.comp_id||data.id||position,language,runnable:data.runnable!==false,testable:!!(data.testcases?.length||data.judge_content?.author_code),code_sha256:hash(code),visible_sha256:hash(visible),code,files,testcases:data.testcases||[],publishedSolution:data.solution_code||'',templateHead:data.template_head||data.prepend_code||'',templateTail:data.template_tail||data.append_code||'',attachments:files.map(f=>({name:f.file_name||f.name||f.filename,bytes:typeof f.content==='string'?Buffer.byteLength(f.content):null,url:f.url||f.file||f.download_url})),sourceContext:visible.slice(0,300),hiddenPrefix:prefix,hiddenSuffix:suffix});
}
function walk(value,file,position='root'){
 if(Array.isArray(value)){value.forEach((v,i)=>walk(v,file,`${position}[${i}]`));return}
 if(!value||typeof value!=='object')return;
 if(value.type==='Code'){add(value.content,file,'Code',position);return}
 if(value.type==='TabbedCode'){(value.content.code_contents||value.content.code_templates||[]).forEach((c,i)=>add(c,file,'TabbedCode',`${position}[${i}]`));return}
 // Challenge templates are inventoried once from their standalone file.
 if(value.type==='ChallengeRef')return;
 for(const [k,v] of Object.entries(value))if(typeof v==='object')walk(v,file,position+'.'+k);
}
for(const name of (await fs.readdir('public/content/pages')).filter(s=>s.endsWith('.json')).sort()){
 const file='/content/pages/'+name;walk(JSON.parse(await fs.readFile(publicRoot+file,'utf8')),file);
}
for(const name of (await fs.readdir('public/content/challenges')).filter(s=>s.endsWith('.json')).sort()){
 const file='/content/challenges/'+name,data=JSON.parse(await fs.readFile(publicRoot+file,'utf8'));
 (data.code_templates||[]).forEach((c,i)=>add({...c,testcases:data.testcases},file,'ChallengeTemplate',String(i)));
}
const analysisPython=String.raw`
import ast,json,sys,re,collections
items=json.load(sys.stdin)
for r in items:
 s=r['code']; imports=set(); calls=[]; aliases={}; flags=[]; syntax=None
 try:
  tree=ast.parse(s)
  for n in ast.walk(tree):
   if isinstance(n,ast.Import):
    for a in n.names:imports.add(a.name);aliases[a.asname or a.name.split('.')[0]]=a.name
   if isinstance(n,ast.ImportFrom):
    imports.add(n.module or '')
    for a in n.names:aliases[a.asname or a.name]=(n.module or '')+'.'+a.name
  def name(n):
   if isinstance(n,ast.Name):return aliases.get(n.id,n.id)
   if isinstance(n,ast.Attribute):return name(n.value)+'.'+n.attr
   return '?'
  for n in ast.walk(tree):
   if isinstance(n,ast.Call):
    q=name(n.func);args=[a.value if isinstance(a,ast.Constant) and isinstance(a.value,(str,int,float)) else None for a in n.args]; kws=[k.arg for k in n.keywords]
    calls.append({'name':q,'line':n.lineno,'positional':len(n.args),'literals':args,'keywords':kws})
    if q.endswith('.append') and any(i=='pandas' or i.startswith('pandas.') for i in imports):flags.append('pandas-append-candidate')
    if q.endswith('.iteritems'):flags.append('removed-iteritems')
    if q.endswith('.read_csv') and 'delim_whitespace' in kws:flags.append('read-csv-delim-whitespace')
    if q.endswith('.pivot') and n.args:flags.append('pandas-pivot-positional')
    if q.startswith('seaborn.') and q.split('.')[-1] in ['lineplot','barplot','scatterplot','jointplot','boxplot','violinplot'] and len(n.args)>0:flags.append('seaborn-positional')
    if q=='seaborn.load_dataset':flags.append('seaborn-remote-dataset')
    if q=='sklearn.datasets.load_boston':flags.append('removed-load-boston')
    if q.endswith(('.mean','.corr','.quantile','.sum')) and 'numeric_only' not in kws and any(i=='pandas' or i.startswith('pandas.') for i in imports):flags.append('pandas-numeric-only-candidate')
    if q.endswith('.get_group') and n.args and isinstance(n.args[0],ast.Constant):flags.append('pandas-get-group-scalar-candidate')
   if isinstance(n,ast.Attribute) and name(n) in ['numpy.'+a for a in ['int','float','complex','object','str','bool','NaN','Inf','float_','complex_','asscalar','mat']]:flags.append('removed-numpy-alias')
 except SyntaxError as e:
  syntax={'type':type(e).__name__,'message':e.msg,'line':e.lineno,'text':e.text}
  for match in re.finditer(r'^\s*(?:from|import)\s+([\w.]+)',s,re.M):imports.add(match.group(1))
 if 'pandas.util.testing' in imports:flags.append('removed-pandas-util-testing')
 if 'multiprocessing' in imports:flags.append('browser-multiprocessing')
 names=[c['name'] for c in calls]; roots={i.split('.')[0] for i in imports}
 features={
  'stdin':any(n in ['input','sys.stdin.read','sys.stdin.readline','sys.stdin.readlines'] for n in names) or bool(syntax and re.search(r'\binput\s*\(|sys\.stdin',s)),
  'network':bool(roots & {'requests','urllib','socket','http','aiohttp','selenium'}) or 'seaborn-remote-dataset' in flags,
  'gui':bool(roots & {'turtle','tkinter','pygame','PyQt5','wx'}),
  'plotting':bool(roots & {'matplotlib','seaborn'}),
  'fileIo':any(c['name']=='open' or c['name'].endswith(('.read_csv','.read_excel','.savefig','.read_json','.loadtxt','.genfromtxt')) for c in calls),
  'outputDirectory':bool(re.search(r"['\"]output/",s)),
  'explicitErrorExample':bool(re.search(r'会报错|会抛出|引发.{0,6}异常|将报错|故意|错误示例|错误写法|Raises?\s+(?:an?\s+)?(?:error|exception)|#.*(?:Error|Exception)',s,re.I)),
  'incompleteExercise':bool(re.search(r'补齐|补充|your code|write your|填.{0,3}代码|实现这个|TODO|#.*在此',s,re.I)),
 }
 r.update(imports=sorted(imports),calls=calls,compatibilityCandidates=sorted(set(flags)),syntax=syntax,features=features)
json.dump({'syntaxParserVersion':sys.version,'records':items},sys.stdout,ensure_ascii=False)
`;
const analyzed=spawnSync('python3',['-c',analysisPython],{input:JSON.stringify(records),encoding:'utf8',maxBuffer:80*1024*1024});
if(analyzed.status!==0)throw Error(analyzed.stderr);
const inventory=JSON.parse(analyzed.stdout);
const count=rows=>Object.fromEntries(Object.entries(rows.reduce((a,key)=>(a[key]=(a[key]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]));
const runnable=inventory.records.filter(r=>r.runnable);
inventory.summary={allPythonEditors:records.length,runnablePythonEditors:runnable.length,testablePythonEditors:inventory.records.filter(r=>r.testable).length,byKind:count(runnable.map(r=>r.kind)),byLanguage:count(runnable.map(r=>r.language)),byCourse:count(runnable.map(r=>r.course||'challenges')),imports:count(runnable.flatMap(r=>r.imports)),features:Object.fromEntries(Object.keys(runnable[0].features).map(f=>[f,runnable.filter(r=>r.features[f]).length])),compatibilityCandidates:count(runnable.flatMap(r=>r.compatibilityCandidates)),withAttachments:runnable.filter(r=>r.attachments.length).length,attachmentInstances:runnable.reduce((s,r)=>s+r.attachments.length,0),syntaxErrors:runnable.filter(r=>r.syntax).length};
inventory.courseTitles=titles;
// Keep reports small and source-of-truth in the course files, not duplicate embedded datasets.
await fs.writeFile('tests/runtime-course-inventory.json',JSON.stringify({...inventory,records:inventory.records.map(({code,files,publishedSolution,...r})=>({...r,publishedSolutionSha256:publishedSolution?hash(publishedSolution):null}))},null,2)+'\n');
console.log(JSON.stringify(inventory.summary,null,2));
if(!args.run)process.exit(0);
let samples=[];const skipped=[];
const addSample=r=>{if(r&&!samples.some(s=>s.key===r.key))samples.push(r)};
const candidates=runnable.filter(r=>r.kind!=='ChallengeTemplate'&&!r.syntax&&!r.features.stdin);
if(args.all){
 const inputExamples={
  '1679':['12','audit sample N=12 satisfying original file-character-reader prompt; source publishes no sample input'],
  '97a927b7-c6e3-3a78-ab6b-01d090b5ee4e':['hello','audit sample satisfying the input text lesson'],
  '88403bf4-5e45-3483-b779-ba5175ce2799':['Alice','audit sample satisfying the requested name'],
  '2a42aef0-73a7-393c-a40f-ad4784b8b3dc':['20','audit sample satisfying the requested integer age'],
  'd7509e75-576c-339a-938c-5d3292d413de':['Alice\n20','audit sample satisfying name and age prompts'],
  'e65be60e-e812-3c27-9f6d-adb9da214db3':['Sw0rdf1sh!','password literal from this public property setter teaching example'],
  '380402bc-88ce-386e-86f2-0e1777a17144':['Alice','audit sample satisfying the requested name'],
  '1b4372e2-a8af-32a7-9dc9-4ab41a28de4a':['23','explicit input/output example in page 026/1426'],
  'e29022f9-e08a-3e59-8c0d-79ce6627f9b6':['Eve\n80\n70\n90\n60\n85','audit sample satisfying student name and five integer score prompts'],
 };
 for(const original of runnable){
  let r={...original,editor_template_sha256:original.code_sha256,executionVariant:'original-editor'};
  if(r.kind==='ChallengeTemplate'){
   if(!r.publishedSolution.trim()){skipped.push({key:r.key,reason:'exercise awaiting student implementation without a published solution'});continue}
   r.code=[r.templateHead,r.publishedSolution,r.templateTail].filter(Boolean).join('\n');r.code_sha256=hash(r.code);r.executionVariant='published-reference-solution';
   r.auditTestcases=r.testcases;r.stdinEvidence=r.testcases.length?'original public testcases':'no public testcase available; executing the published solution without invented input';
  }else if(r.syntax){skipped.push({key:r.key,page:r.page,id:r.id,reason:r.course==='021'?'original C code mislabeled Python':'original teaching syntax error or incomplete code fragment',syntax:r.syntax});continue}
  if(inputExamples[r.id]){[r.auditStdin,r.stdinEvidence]=inputExamples[r.id]}
  addSample(r);
 }
}else if(args['data-analysis']){candidates.filter(r=>['007','008','009','017','034'].includes(r.course)).forEach(addSample)}else if(args.regression){
 const baseline=[];for(const file of ['tests/runtime-course-audit.json','tests/runtime-course-extra-audit.json'])baseline.push(...JSON.parse(await fs.readFile(file,'utf8')).results);
 for(const old of baseline){const r=candidates.find(r=>r.key===old.key);if(r)addSample(r)}
 candidates.filter(r=>r.compatibilityCandidates.some(f=>!f.endsWith('-candidate')&&f!=='browser-multiprocessing')||r.code.includes('raw_data.csv')||r.code.includes('/usercode/books.txt')).forEach(addSample);
}else if(args.filter){candidates.filter(r=>String(args.filter).split(',').some(f=>(r.page+':'+r.id).includes(f))).forEach(addSample)}else{
 for(const flag of Object.keys(inventory.summary.compatibilityCandidates))candidates.filter(r=>r.compatibilityCandidates.includes(flag)).slice(0,flag==='seaborn-positional'?5:3).forEach(addSample);
 const attachmentNames=new Set();for(const r of candidates)for(const a of r.attachments)if(!attachmentNames.has(a.name)){attachmentNames.add(a.name);addSample(r)}
 for(const course of ['007','008','009','017','034'])candidates.filter(r=>r.course===course).slice(0,3).forEach(addSample);
 for(const feature of ['gui','network','outputDirectory','plotting','explicitErrorExample'])candidates.filter(r=>r.features[feature]).slice(0,3).forEach(addSample);
 // One controlled stdin example: actual code with an input value supplied, not modified.
 const input=runnable.find(r=>r.kind==='Code'&&r.features.stdin&&!r.syntax&&r.code.includes('input(')&&r.code.split('input(').length===2&&r.code.length<250);if(input)addSample({...input,auditStdin:'5'});
}
if(args.network)candidates.filter(r=>r.features.network).forEach(addSample);
if(args.plots)candidates.filter(r=>r.features.plotting).forEach(addSample);
if(args.challenges)samples=samples.filter(r=>r.kind==='ChallengeTemplate'||r.features.stdin);
if(args.all&&args.filter)samples=samples.filter(r=>String(args.filter).split(',').some(f=>(r.page+':'+r.id).includes(f)));
if(args.limit)samples=samples.slice(0,Number(args.limit));
if(args.probes){
 const probes=[
  ['export-budget',"with open('output/too-large.bin', 'wb') as f: f.write(b'x' * (11 * 1024 * 1024))\nprint('budget-probe-created')"],
  ['flights-month-order',"import seaborn as sns\nf=sns.load_dataset('flights')\nassert len(f)==144\nassert len(f[f.month=='January'])==12\nassert list(f.month.cat.categories)[0]=='January'\nassert list(f.month.cat.categories)[-1]=='December'\nprint('flights:144 January:12 chronological-months:ok')"],
 ];
 for(const [id,code] of probes)samples.push({key:'runtime-probe:'+id,page:'runtime-probe',id,code,code_sha256:hash(code),files:[],attachments:[],imports:[],compatibilityCandidates:[],features:{},kind:'RuntimeProbe'});
}

const mime={'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.html':'text/html'};
const server=http.createServer(async(req,res)=>{
 let pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Python course audit</title>');return}
 const base=pathname.startsWith('/src/')?root:publicRoot;
 const file=path.resolve(base,'.'+pathname);
 if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return}
 try{const stat=await fs.stat(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size});createReadStream(file).pipe(res)}catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const context=await browser.newContext();const blocked=[];
await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();blocked.push(url);return route.abort()});
const page=await context.newPage();await page.goto(base);
const workerHash=hash(await fs.readFile('src/python-worker.js'));
const report={startedAt:new Date().toISOString(),runtime:JSON.parse(await fs.readFile('public/runtime/pyodide/manifest.json','utf8')).packages,workerHashBefore:workerHash,fixtureHashBefore:hash(await fs.readFile('public/content/fixture-map.json')),selected:samples.length,skipped,results:[],limitations:['Static inventory covers imported Python editors; actual execution covers the selected records listed below; --all evaluates published reference solutions for incomplete challenge templates and lists static syntax skips.','Each example runs in a fresh real browser Worker with its original hidden prefix/suffix and original additional_content.','External network requests are blocked; errors from unbundled datasets are recorded as a packaging limitation.','Success means completion, not mathematical/numeric equivalence with the original Python 3.8 environment.','Plot data is counted; visual equivalence of generated charts is not asserted.','Challenge templates remain incomplete editor exercises; --all executes the separately supplied published reference solution and its public testcases, with executionVariant recorded.']};
let cursor=0;
async function work(){while(cursor<samples.length){const r=samples[cursor++],started=Date.now();const messages=await page.evaluate(({code,files,stdin,testcases})=>new Promise(resolve=>{
 const worker=new Worker('/src/python-worker.js',{type:'module'}),messages=[];
 let timer=setTimeout(()=>finish('load-timeout'),120000);
 function finish(reason){clearTimeout(timer);worker.terminate();resolve({messages,reason})}
 worker.onerror=e=>{messages.push({type:'worker-error',value:e.message});finish('error')};
 worker.onmessage=({data:m})=>{if(m.type==='plots')messages.push({type:m.type,value:m.value.map(p=>({bytes:p.length,prefix:p.slice(0,24)}))});else messages.push(m);if(m.type==='running'){clearTimeout(timer);timer=setTimeout(()=>finish('execution-timeout'),20000)}if(m.type==='done'||m.type==='error')finish(m.type)};
 worker.postMessage({code,files,stdin,testcases,language:'python'});
}),{code:r.code,files:r.files,stdin:r.auditStdin||'',testcases:r.auditTestcases||[]});
 const result={key:r.key,page:r.page,id:r.id,course:r.course,code_sha256:r.code_sha256,editor_template_sha256:r.editor_template_sha256,executionVariant:r.executionVariant,stdinEvidence:r.stdinEvidence,testcaseCount:r.auditTestcases?.length||0,imports:r.imports,compatibilityCandidates:r.compatibilityCandidates,features:r.features,attachments:r.attachments,stdin:r.auditStdin||'',elapsedMs:Date.now()-started,...messages};report.results.push(result);
 if(report.results.length%10===0||messages.reason!=='done'||report.results.length===samples.length)console.log(JSON.stringify({completed:report.results.length,total:samples.length,page:r.page,id:r.id,status:messages.reason,error:messages.messages.find(m=>m.type==='error')?.value?.split('\n').slice(-2).join(' ')}));
 if(report.results.length%10===0||report.results.length===samples.length)await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
}}
try{await Promise.all(Array.from({length:Number(args.parallel||2)},work))}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
report.fixtureHashAfter=hash(await fs.readFile('public/content/fixture-map.json'));report.workerHashAfter=hash(await fs.readFile('src/python-worker.js'));report.finishedAt=new Date().toISOString();report.blockedExternalRequests=blocked;report.summary={executed:report.results.length,status:count(report.results.map(r=>r.reason)),withAttachments:report.results.filter(r=>r.attachments.length).length,plots:report.results.reduce((s,r)=>s+r.messages.filter(m=>m.type==='plots').reduce((n,m)=>n+m.value.length,0),0),workerChangedDuringAudit:report.workerHashBefore!==report.workerHashAfter};
await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary,null,2));
