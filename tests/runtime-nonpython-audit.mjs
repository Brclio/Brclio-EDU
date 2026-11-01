/** Actual JS/Node/SQL worker audit. No edits to imported source or public expected outputs. */
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const[k,v]=x.replace(/^--/,'').split('=');return[k,v??true]}));
const root=process.cwd(),pub=path.join(root,'public'),sha=x=>createHash('sha256').update(x).digest('hex');
const records=[],web=[];
function add(d,file,kind,pos){
 let language=String(d.language||'').toLowerCase();
 if(!['js','javascript','node','nodejs','sql','sqlite','sqlite3'].includes(language)||d.runnable===false)return;
 const source=d.content??d.template??d.js_code??'',prefix=d.hidden_code_content?.prepend_code||d.prepend_code||d.template_head||'',suffix=d.hidden_code_content?.append_code||d.append_code||d.template_tail||'';
 let code=[prefix,source,suffix].filter(Boolean).join('\n'),variant='original-editor';
 if(kind==='ChallengeTemplate'){
  if(!d.solution_code?.trim())throw Error('No published reference solution: '+file);
  code=[prefix,d.solution_code,suffix].filter(Boolean).join('\n');variant='published-reference-solution';
 }
 records.push({key:file+':'+(d.comp_id||d.id||pos),file,page:path.basename(file,'.json'),id:d.comp_id||d.id||pos,kind,sourceLanguage:language,language:['sql','sqlite','sqlite3'].includes(language)?'sql':'javascript',code,code_sha256:sha(code),editor_template_sha256:sha(source),executionVariant:variant,files:d.additional_content||d.additional_files||[],testcases:d.testcases||[],features:{stdin:/\b(readLine|prompt)\s*\(/.test(code),main:/\bfunction\s+main\s*\(/.test(code),nodeModules:/\brequire\s*\(|\bprocess\./.test(code)},stdin:''});
}
function walk(v,file,pos='root'){
 if(Array.isArray(v)){v.forEach((x,i)=>walk(x,file,pos+'.'+i));return}
 if(!v||typeof v!=='object')return;
 if(v.type==='ChallengeRef')return;
 if(v.type==='Code'){add(v.content,file,'Code',pos);return}
 if(v.type==='TabbedCode'){(v.content.code_contents||v.content.code_templates||[]).forEach((x,i)=>add(x,file,'TabbedCode',pos+'.'+i));return}
 if(v.type==='JsHtml'){
  const d=v.content;if(d.runnable===false)return;
  if(d.language==='js'&&!d.html_code&&!d.css_code&&!/\b(document|window|alert|prompt|confirm)\b/.test(d.js_code||''))add(d,file,'JsHtml',pos);
  else web.push({file,page:path.basename(file,'.json'),kind:v.type,id:d.comp_id,data:d});return;
 }
 if(v.type==='RunJS'){web.push({file,page:path.basename(file,'.json'),kind:v.type,id:v.content.comp_id,data:v.content});return}
 for(const[k,x]of Object.entries(v))if(typeof x==='object')walk(x,file,pos+'.'+k);
}
for(const file of (await fs.readdir(pub+'/content/pages')).filter(x=>x.endsWith('.json')).sort())walk(JSON.parse(await fs.readFile(pub+'/content/pages/'+file,'utf8')),'/content/pages/'+file);
for(const file of (await fs.readdir(pub+'/content/challenges')).filter(x=>x.endsWith('.json')).sort()){
 const d=JSON.parse(await fs.readFile(pub+'/content/challenges/'+file,'utf8'));for(const[c,i]of(d.code_templates||[]).map((x,i)=>[x,i]))add({...c,testcases:d.testcases},'/content/challenges/'+file,'ChallengeTemplate',i);
}
const counts=rows=>rows.reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{});
const inventory={summary:{workerItems:records.length,webItems:web.length,byLanguage:counts(records.map(r=>r.sourceLanguage)),byKind:counts(records.map(r=>r.kind)),publishedSolutions:records.filter(r=>r.kind==='ChallengeTemplate').length,publicTestcases:records.reduce((n,r)=>n+r.testcases.length,0)},records:records.map(({code,files,...r})=>({...r,attachmentCount:files.length})),web:web.map(({data,...r})=>({...r,htmlBytes:(data.html_code||'').length,jsBytes:(data.js_code||'').length}))};
await fs.writeFile('tests/runtime-nonpython-inventory.json',JSON.stringify(inventory,null,2)+'\n');console.log(JSON.stringify(inventory.summary));
if(!args.run)process.exit(0);
let samples=records;if(args.filter)samples=samples.filter(r=>String(args.filter).split(',').some(f=>(r.page+':'+r.id).includes(f)));
if(args.probes){
 for(const[sourceLanguage,id,code,stdin]of[['javascript','vanilla-main-definition','function main(){console.log("WRONG")}\nconsole.log("defined")',''],['nodejs','node-main-input','function main(){console.log(readLine());console.log(readLine())}','alpha\nbeta']])samples.push({key:'runtime-probe:'+id,page:'runtime-probe',id,kind:'RuntimeProbe',language:'javascript',sourceLanguage,code,code_sha256:sha(code),executionVariant:'runtime-probe',files:[],testcases:[],features:{},stdin});
}
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end('<title>Non-Python audit</title>');return}const base=p.startsWith('/src/')?root:pub,file=path.resolve(base,'.'+p);if(!file.startsWith(base+'/')){res.writeHead(403).end();return}try{const st=await fs.stat(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':st.size});createReadStream(file).pipe(res)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true}),context=await browser.newContext(),blocked=[];
await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();blocked.push(u);return route.abort()});
const page=await context.newPage();await page.goto(base);const out=String(args.output||'tests/runtime-nonpython-audit.json');
const report={startedAt:new Date().toISOString(),workerHashBefore:sha(await fs.readFile('src/python-worker.js')),summary:inventory.summary,results:[],limitations:['Challenge editors run their separately published reference solutions; incomplete student templates are not claimed to pass.','DOM examples are inventoried separately and require iframe UI execution.','Completion and public testcases do not establish equivalence for every possible input.']};let cursor=0;
async function run(){while(cursor<samples.length){const r=samples[cursor++],start=Date.now(),messages=await page.evaluate(data=>new Promise(resolve=>{const worker=new Worker('/src/python-worker.js',{type:'module'}),messages=[];let timer=setTimeout(()=>done('load-timeout'),120000);function done(reason){clearTimeout(timer);worker.terminate();resolve({reason,messages})}worker.onerror=e=>{messages.push({type:'worker-error',value:e.message});done('error')};worker.onmessage=({data:m})=>{messages.push(m);if(m.type==='running'){clearTimeout(timer);timer=setTimeout(()=>done('execution-timeout'),20000)}if(['done','error'].includes(m.type))done(m.type)};worker.postMessage(data)}),{code:r.code,language:r.language,sourceLanguage:r.sourceLanguage,files:r.files,testcases:r.testcases,stdin:r.stdin});report.results.push({...r,code:undefined,files:undefined,elapsedMs:Date.now()-start,...messages});if(report.results.length%10===0||messages.reason!=='done')console.log(JSON.stringify({completed:report.results.length,total:samples.length,page:r.page,id:r.id,reason:messages.reason,error:messages.messages.find(m=>m.type==='error')?.value?.split('\n').at(-2)}));if(report.results.length%10===0)await fs.writeFile(out,JSON.stringify(report,null,2)+'\n')}}
try{await Promise.all(Array.from({length:Number(args.parallel||3)},run))}finally{await browser.close();await new Promise(r=>server.close(r))}
report.workerHashAfter=sha(await fs.readFile('src/python-worker.js'));report.finishedAt=new Date().toISOString();report.blockedExternalRequests=blocked;const tests=report.results.flatMap(r=>r.messages.filter(m=>m.type==='testResults').flatMap(m=>m.value));report.executionSummary={executed:report.results.length,status:counts(report.results.map(r=>r.reason)),testcases:tests.length,testcasesPassed:tests.filter(t=>t.succeeded).length};await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.executionSummary,null,2));
