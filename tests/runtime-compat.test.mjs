import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['tests/runtime-course-full-audit.json','tests/runtime-course-network-final.json','tests/runtime-course-challenge-audit.json','tests/runtime-course-biqukan-recovery.json'];
const reports=await Promise.all(files.map(async f=>JSON.parse(await fs.readFile(f,'utf8'))));
const summary=JSON.parse(await fs.readFile('tests/runtime-course-full-summary.json','utf8'));
const results=new Map();for(const phase of reports)for(const r of phase.results)results.set(r.key,r);
const report={results:[...results.values()]};
test('all 1686 runnable Python editors are accounted for; 1674 execute with explicit remaining classifications',async()=>{
 for(const phase of reports){assert.ok(phase.finishedAt);assert.equal(phase.workerHashBefore,phase.workerHashAfter);if(phase.fixtureHashBefore)assert.equal(phase.fixtureHashBefore,phase.fixtureHashAfter)}
 assert.deepEqual(summary.scope,{runnableEditors:1686,executed:1674,originalEditors:1338,publishedReferenceSolutions:336,staticSkips:12});
 assert.equal(report.results.length,1674);assert.equal(summary.counts.unclassified,undefined);
 for(const item of summary.results){const result=results.get(item.key);assert.equal(result.reason,item.reason);if(item.category==='completed')assert.equal(result.reason,'done');else assert.ok(['error','execution-timeout'].includes(result.reason),item.key)}
 assert.equal(reports.at(-1).workerHashAfter,sha(await fs.readFile('src/python-worker.js')),'Latest execution regression must use current worker');
});
test('all 345 original public cases pass through the 336 published reference solutions',()=>{
 assert.equal(summary.publicTestcases,345);assert.equal(summary.publicTestcasesPassed,345);
 for(const r of reports[2].results){assert.equal(r.reason,'done',r.key);for(const m of r.messages.filter(m=>m.type==='testResults'))for(const t of m.value)assert.equal(t.succeeded,true,r.key+': '+JSON.stringify(t))}
 const crlf=reports[2].results.find(r=>r.page==='430').messages.find(m=>m.type==='testResults').value;
 assert.equal(crlf[1].actual_output,crlf[1].expected_output);
});
test('all 99 runnable plotting examples return a displayed plot, including savefig followed by close',()=>{
 const plots=report.results.filter(r=>r.features.plotting);
 assert.equal(plots.length,99);
 for(const result of plots)assert.ok(result.messages.some(m=>m.type==='plots'&&m.value.length>0),result.key);
});
test('archived datasets and all local Python runtime files match pinned checksums with complete dependencies',async()=>{
 const data=JSON.parse(await fs.readFile('public/content/runtime-data/manifest.json','utf8'));
 for(const item of Object.values(data.files)){const bytes=await fs.readFile('public'+item.path);assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256)}
 const runtime=JSON.parse(await fs.readFile('public/runtime/pyodide/manifest.json','utf8'));
 for(const name of ['openpyxl','et-xmlfile'])assert.ok(runtime.packages.some(p=>p.name===name));
 for(const item of runtime.files){const bytes=await fs.readFile('public/runtime/pyodide/'+item.file);assert.equal(bytes.length,item.bytes,item.file);assert.equal(sha(bytes),item.sha256,item.file)}
 const lock=JSON.parse(await fs.readFile('public/runtime/pyodide/pyodide-lock.json','utf8'));
 const pinnedFiles=new Map(runtime.files.map(item=>[item.file,item]));
 for(const [name,pkg] of Object.entries(lock.packages)){
  assert.ok(pinnedFiles.has(pkg.file_name),name+' must have a local file');
  assert.equal(pinnedFiles.get(pkg.file_name).sha256,pkg.sha256,name);
  for(const dependency of pkg.depends||[])assert.ok(lock.packages[dependency],name+' -> '+dependency);
 }
});
test('restored raw_data.csv and books.txt produce the known course data',()=>{
 const stdout=id=>report.results.find(r=>r.id===id).messages.filter(m=>m.type==='stdout').map(m=>m.value).join('\n');
 assert.match(stdout('3E5iHNuJtFNw0_EiKyB8b'),/183\s+2379\.77/);
 assert.match(stdout('6c439693-e3fb-36ff-bc0b-b3a3b98b40d6'),/Harry Potter[\s\S]*The Hunger Games[\s\S]*Pride and Prejudice[\s\S]*Gone with the Wind/);
});

test('CSV and Excel exports are usable local download URLs and enforce the total byte limit',async()=>{
 const latest=JSON.parse(await fs.readFile('tests/runtime-course-final-probes.json','utf8'));
 for(const id of ['6555a55f-422e-410c-8bce-32837ff7c84e','71956e28-2218-43de-bafb-b563fc8db7c2']){
  const r=latest.results.find(r=>r.id===id),files=r.messages.filter(m=>m.type==='files').flatMap(m=>m.value);
  assert.equal(r.reason,'done');assert.equal(files.length,id==='6555a55f-422e-410c-8bce-32837ff7c84e'?1:2);
  for(const f of files){assert.match(f.url,/^data:[^,]+;base64,/);assert.equal(Buffer.from(f.url.split(',')[1],'base64').length,f.size);assert.ok(f.size>0&&f.size<=10*1024*1024)}
 }
 const budget=latest.results.find(r=>r.id==='export-budget');assert.equal(budget.reason,'done');assert.ok(!budget.messages.some(m=>m.type==='files'));assert.ok(budget.messages.some(m=>m.type==='stderr'&&m.value.includes('10 MiB')));
 const months=latest.results.find(r=>r.id==='flights-month-order');assert.equal(months.reason,'done');
});

test('network fixtures preserve exact pinned bytes and charset; missing external sources are explicit',async()=>{
 const map=JSON.parse(await fs.readFile('public/content/fixture-map.json','utf8'));
 for(const [url,item] of Object.entries(map)){assert.match(item.path,/^\/content\/fixtures\//);const body=await fs.readFile('public'+item.path);if(item.sha256)assert.equal(sha(body),item.sha256,url)}
 const network=JSON.parse(await fs.readFile('public/content/network-fixture-audit.json','utf8'));assert.equal(network.failed,0);assert.equal(network.captured,25);
 assert.match(map['http://sj.zol.com.cn/bizhi/detail_10981_121155.html'].contentType,/gbk/);
 const original=JSON.parse(await fs.readFile('public/content/runtime-data/font-evidence.json','utf8'));assert.equal(original.identicalBytes,true);assert.equal(original.originalFallbackSha256,original.localBundledFont.sha256);
 const fonts=reports[1].results.filter(r=>['008-354','008-367'].includes(r.page));assert.equal(fonts.length,4);for(const r of fonts)assert.ok(!r.messages.some(m=>m.type==='stderr'&&/findfont/.test(m.value)));
});
