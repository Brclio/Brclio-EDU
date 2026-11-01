/** Execute imported author judges in a real browser Worker. Never edits imported answers. */
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const[k,...v]=x.replace(/^--/,'').split('=');return[k,v.length?v.join('='):true]}));
const root=process.cwd(),pub=path.join(root,'public'),sha=x=>createHash('sha256').update(x).digest('hex'),records=[],sourceHashes={};
const counts=values=>values.reduce((o,k)=>(o[k]=(o[k]||0)+1,o),{});
function add(data,file,kind,pos){if(data?.judge_content?.author_code)records.push({page:path.basename(file,'.json'),file,kind,id:data.comp_id||pos,data});}
function walk(v,file,pos='root'){
 if(Array.isArray(v)){v.forEach((x,i)=>walk(x,file,pos+'.'+i));return}if(!v||typeof v!=='object')return;
 if(v.type==='Code'){add(v.content,file,'Code',pos);return}
 if(v.type==='TabbedCode'){(v.content.code_contents||v.content.code_templates||[]).forEach((d,i)=>add(d,file,'TabbedCode',pos+'.'+i));return}
 for(const[k,x]of Object.entries(v))if(typeof x==='object')walk(x,file,pos+'.'+k);
}
for(const file of(await fs.readdir(pub+'/content/pages')).filter(f=>f.endsWith('.json')).sort()){
 const bytes=await fs.readFile(pub+'/content/pages/'+file);sourceHashes[file]=sha(bytes);walk(JSON.parse(bytes),'/content/pages/'+file);
}
function assemble(d,editor){
 const prefix=[d.hidden_code_content?.prepend_code||d.prepend_code||d.template_head||'',d.judge_content_prepend].filter(Boolean).join('\n');
 const suffix=[d.hidden_code_content?.append_code||d.append_code||d.template_tail||'',d.judge_content.author_code,d.judge_content.ed_code].filter(Boolean).join('\n');
 return[prefix,editor,suffix].filter(Boolean).join('\n');
}
function sample(r,variant='literal-reference'){
 const d=r.data,editor=variant==='original-editor-negative'?d.content:d.solution_content||'';
 return{...r,data:undefined,sourceLanguage:d.language,language:/python/.test(d.language)?'python':'javascript',judgeEnabled:d.judge!==false,variant,editor,code:assemble(d,editor),files:d.additional_content||d.additional_files||[],testcases:d.testcases||[],judge:true,stdin:'',referenceNonempty:!!d.solution_content?.trim(),judgeHash:sha(d.judge_content.author_code),sourceHashes:{editor:sha(editor||''),originalEditor:sha(d.content||''),solution:sha(d.solution_content||''),author:sha(d.judge_content.author_code),ed:sha(d.judge_content.ed_code||'')},metadataReferenced:/\b(?:edTestMetadata|userCode)\b/.test(d.judge_content.author_code+'\n'+d.judge_content.ed_code)};
}
const inventory={total:records.length,enabled:records.filter(r=>r.data.judge!==false).length,disabled:records.filter(r=>r.data.judge===false).length,languages:counts(records.map(r=>r.data.language)),referenceNonempty:records.filter(r=>r.data.solution_content?.trim()).length};
console.log(JSON.stringify(inventory));
let samples=records.filter(r=>/python|javascript/.test(r.data.language)).map(r=>sample(r));
if(args.enabled)samples=samples.filter(r=>r.judgeEnabled);
if(args.negative)samples=records.filter(r=>/python|javascript/.test(r.data.language)&&r.data.judge!==false).map(r=>sample(r,'original-editor-negative'));
if(args.filter)samples=samples.filter(r=>String(args.filter).split(',').some(f=>(r.page+':'+r.id).includes(f)));
if(args.scaffold){for(const s of samples){
 // These four original answers are function fragments, not complete editors.
 // Each target function is the final definition in its original editor; keep
 // the original preceding imports/read_csv/df initialization byte-for-byte.
 if(!['4042e66a-9784-4443-9645-94382d93dd0b','514a347d-d7c2-45c0-8125-3a8717285416','09cf9736-d2e2-4c67-940b-4af3d12c1e8e','f71c75c1-bb78-4670-bf72-b921071e54b2'].includes(s.id))continue;
 const d=records.find(r=>r.page===s.page&&r.id===s.id).data,name=s.editor.match(/^def (\w+)\(/)?.[1];
 const at=(d.content||'').search(new RegExp('^def '+name+'\\(','m'));
 if(!name||at<0)throw Error('Expected original function scaffold absent: '+s.id);
 s.variant='reference-function-in-original-editor-scaffold';s.preservedScaffold=d.content.slice(0,at);s.editor=s.preservedScaffold+s.editor;s.code=assemble(d,s.editor);
}}
if(args.probes){samples=[];for(const language of ['python','javascript'])for(const[id,body]of [
 ['missing-marker','ordinary output'],['empty-results','<__educative_test_results__>{"test_results":[]}</__educative_test_results__>'],
 ['invalid-json','<__educative_test_results__>{broken}</__educative_test_results__>'],
 ['invalid-success-type','<__educative_test_results__>{"test_results":[{"succeeded":"true"}]}</__educative_test_results__>'],
 ['valid-rejection','<__educative_test_results__>{"test_results":[{"succeeded":false,"reason":"Incorrect Output","expected_output":"1","actual_output":"2"}]}</__educative_test_results__>']
])samples.push({page:'protocol-probe',id:language+'-'+id,kind:'ProtocolProbe',variant:'protocol-probe',language,sourceLanguage:language,judgeEnabled:true,judge:true,code:(language==='python'?'print(':'console.log(')+JSON.stringify(body)+')',files:[],testcases:[],stdin:'',sourceHashes:{},expectedReason:id==='valid-rejection'?'done':'error'});}
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end('<title>Author judge audit</title>');return}const base=p.startsWith('/src/')?root:pub,file=path.resolve(base,'.'+p);if(!file.startsWith(base+'/')){res.writeHead(403).end();return}try{const st=await fs.stat(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':st.size});createReadStream(file).pipe(res)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true}),context=await browser.newContext(),blocked=[];
await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();blocked.push(u);return route.abort()});
const page=await context.newPage();await page.goto(base);const output=String(args.output||'tests/runtime-unit-audit.json');
const report={startedAt:new Date().toISOString(),workerHashBefore:sha(await fs.readFile('src/python-worker.js')),inventory,sourceHashes,results:[],limitations:['Runs reference text as an editor replacement with exact production prefix/suffix fields. Optional scaffold mode preserves only original top-level imports and records each line.','judge=false residual scripts are executed only for diagnosis and are not valid enabled exercises.','Original unchanged student editor is a negative probe; it may already contain a correct implementation, so passing is not automatically a defect.']};let cursor=0;
async function run(){while(cursor<samples.length){const r=samples[cursor++],start=Date.now();const response=await page.evaluate(data=>new Promise(resolve=>{const worker=new Worker('/src/python-worker.js',{type:'module'}),messages=[];let timer=setTimeout(()=>done('load-timeout'),120000);function done(reason){clearTimeout(timer);worker.terminate();resolve({reason,messages})}worker.onerror=e=>{messages.push({type:'worker-error',value:e.message});done('error')};worker.onmessage=({data:m})=>{messages.push(m);if(m.type==='running'){clearTimeout(timer);timer=setTimeout(()=>done('execution-timeout'),25000)}if(['done','error'].includes(m.type))done(m.type)};worker.postMessage(data)}),{code:r.code,language:r.language,sourceLanguage:r.sourceLanguage,files:r.files,testcases:r.testcases,judge:r.judge,stdin:r.stdin});const results=response.messages.filter(m=>m.type==='testResults').flatMap(m=>m.value);const error=response.messages.find(m=>m.type==='error'||m.type==='worker-error')?.value;
const result={...r,editor:undefined,code:undefined,files:undefined,codeSha256:sha(r.code),elapsedMs:Date.now()-start,...response,structuredResultCount:results.length,passed:results.filter(t=>t.succeeded===true).length,failed:results.filter(t=>t.succeeded!==true).length,allPassed:response.reason==='done'&&results.length>0&&results.every(t=>t.succeeded===true),error};report.results.push(result);console.log(JSON.stringify({completed:report.results.length,total:samples.length,page:r.page,id:r.id,enabled:r.judgeEnabled,reason:response.reason,tests:results.length,passed:result.passed,error:error?.split('\n').filter(Boolean).at(-1)}));if(report.results.length%10===0)await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');}}
try{await Promise.all(Array.from({length:Number(args.parallel||3)},run))}finally{await browser.close();await new Promise(r=>server.close(r))}
report.workerHashAfter=sha(await fs.readFile('src/python-worker.js'));report.finishedAt=new Date().toISOString();report.blockedExternalRequests=blocked;report.sourceUnchanged=(await Promise.all(Object.entries(sourceHashes).map(async([f,h])=>sha(await fs.readFile(pub+'/content/pages/'+f))===h))).every(Boolean);report.summary={executed:report.results.length,status:counts(report.results.map(r=>r.reason)),structuredEditors:report.results.filter(r=>r.structuredResultCount>0).length,allPassedEditors:report.results.filter(r=>r.allPassed).length,testcases:report.results.reduce((n,r)=>n+r.structuredResultCount,0),passed:report.results.reduce((n,r)=>n+r.passed,0),failed:report.results.reduce((n,r)=>n+r.failed,0)};await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary,null,2));
