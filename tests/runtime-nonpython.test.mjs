import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const report=JSON.parse(await fs.readFile('tests/runtime-nonpython-audit.json','utf8'));
const source=report.results.filter(r=>r.kind!=='RuntimeProbe');
const text=r=>r.messages.filter(m=>m.type==='stdout').map(m=>m.value).join('\n');
test('all 183 original JS/Node/SQL examples execute, preserving the original const error',async()=>{
 assert.equal(source.length,183);assert.equal(report.workerHashBefore,report.workerHashAfter);assert.equal(report.workerHashAfter,sha(await fs.readFile('src/python-worker.js')));
 for(const r of source){if(r.id==='d0c5b320-5916-34ee-a3a3-b6402e7d359d'){assert.equal(r.reason,'error');assert.match(r.messages.find(m=>m.type==='error').value,/constant variable/)}else assert.equal(r.reason,'done',r.key)}
 assert.equal(source.filter(r=>r.language==='sql').length,67);assert.equal(source.filter(r=>r.language==='javascript').length,116);
});
test('36 published Node solutions produce results and pass all 35 original public tests',()=>{
 const nodes=source.filter(r=>r.sourceLanguage==='nodejs'&&r.kind==='ChallengeTemplate');assert.equal(nodes.length,36);
 const cases=nodes.flatMap(r=>r.messages.filter(m=>m.type==='testResults').flatMap(m=>m.value));assert.equal(cases.length,35);assert.ok(cases.every(c=>c.succeeded));
 for(const r of nodes)assert.ok(r.messages.some(m=>m.type==='testResults'||m.type==='stdout'&&m.value.length),r.key+' must not silently complete without output');
});
test('vanilla JavaScript does not call a merely defined main; Node readLine entry runs',()=>{
 assert.equal(text(report.results.find(r=>r.id==='vanilla-main-definition')),'defined');
 assert.equal(text(report.results.find(r=>r.id==='node-main-input')),'alpha\nbeta');
});
test('both original asynchronous examples complete nested timer and promise output before done',()=>{
 for(const id of ['a2a6586a-550c-3b22-90bd-84ab5dd2debf','09861923-9aa1-365a-a698-3dd4b90e051c'])assert.equal(text(source.find(r=>r.id===id)),'End\nWork 1\nWork 2');
});
test('SQL compatibility returns the actual source query data after concat and view replacement',()=>{
 assert.match(text(source.find(r=>r.id==='ce9a99d2-ef1c-3dc4-af5a-e6f28cb63f0b')),/John, New York\nDavid, Los Angeles/);
 assert.match(text(source.find(r=>r.id==='c1ac01ff-62b0-345a-bd2e-8ebe8ca03289')),/^FirstName \| LastName \| Salary\nEmily \| Adams \| 5000/);
 assert.match(text(source.find(r=>r.page==='462')),/Lisa Anderson \| 17100/);
});
test('all 90 webpage previews run with 31 actual-result interaction assertions',async()=>{
 const web=JSON.parse(await fs.readFile('tests/runtime-web-audit.json','utf8'));assert.equal(web.coverage.examples,90);assert.equal(web.summary.executed,90);assert.equal(web.summary.unexpectedErrors,0);assert.equal(web.summary.checks,31);assert.equal(web.summary.passedChecks,31);assert.equal(web.sourceHashBefore,web.sourceHashAfter);assert.equal(web.sourceHashAfter,sha(await fs.readFile('src/content-web.ts')));
 const expected=web.results.filter(r=>r.classification==='original-case-sensitivity-error');assert.equal(expected.length,1);assert.match(expected[0].errors.join('\n'),/X is not defined/);
 assert.equal(web.results.filter(r=>r.kind==='RunJS'&&r.checks.length===2&&r.checks.every(c=>c.passed)).length,7);
});
test('two teaching-compatible crawler fixtures retain the exact raw captures and explicit provenance',async()=>{
 const map=JSON.parse(await fs.readFile('public/content/fixture-map.json','utf8')),audit=JSON.parse(await fs.readFile('public/content/biqukan-compat-audit.json','utf8'));
 assert.equal(audit.recoveredHistoricalHtml,false);assert.equal(audit.results.length,2);
 for(const record of audit.results){const item=map[record.url];assert.equal(item.adapted,true);assert.equal(item.recovered,false);assert.equal(sha(await fs.readFile('public'+item.path)),item.sha256);assert.equal(sha(await fs.readFile('public'+item.raw.path)),item.raw.sha256);assert.match(item.contentType,/gbk/)}
 assert.equal(audit.results[0].chapterLinks,100);assert.equal(audit.results[1].paragraphs,31);
 const recovery=JSON.parse(await fs.readFile('tests/runtime-course-biqukan-recovery.json','utf8'));assert.equal(recovery.results.length,13);assert.ok(recovery.results.every(r=>r.reason==='done'));
});
