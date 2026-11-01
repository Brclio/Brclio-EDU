import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async name=>JSON.parse(await fs.readFile('tests/'+name,'utf8'));
const [positive,negative,protocol,baseline]=await Promise.all(['runtime-unit-audit.json','runtime-unit-negative.json','runtime-unit-protocol.json','runtime-unit-baseline.json'].map(read));
const sha=b=>createHash('sha256').update(b).digest('hex');
const key=r=>r.page+':'+r.id;
test('all 99 enabled browser author judges emit nonempty structured results; all 294 original cases pass',async()=>{
 assert.deepEqual(positive.inventory,{total:140,enabled:107,disabled:33,languages:{python3:124,'c++':6,java:4,javascript:4,python38:2},referenceNonempty:112});
 assert.equal(positive.results.length,99);assert.equal(new Set(positive.results.map(key)).size,99);
 assert.equal(positive.summary.testcases,294);assert.equal(positive.summary.passed,294);
 for(const r of positive.results){assert.equal(r.reason,'done',key(r));assert.ok(r.structuredResultCount>0,key(r));assert.equal(r.allPassed,true,key(r));assert.equal(r.metadataReferenced,false)}
 assert.equal(positive.results.filter(r=>r.language==='javascript').length,4);
 assert.equal(positive.workerHashBefore,positive.workerHashAfter);assert.equal(positive.workerHashAfter,sha(await fs.readFile('src/python-worker.js')));assert.equal(positive.sourceUnchanged,true);assert.deepEqual(positive.blockedExternalRequests,[]);
});
test('four fragment answers preserve the actual original imports and data-loading scaffold',()=>{
 const scaffold=positive.results.filter(r=>r.variant==='reference-function-in-original-editor-scaffold');assert.equal(scaffold.length,4);
 for(const r of scaffold)assert.ok(r.preservedScaffold.includes('import '));
 for(const page of ['009-386','009-392'])assert.match(scaffold.find(r=>r.page===page).preservedScaffold,/def read_csv\([\s\S]*df = read_csv\(\)/);
 const typo=positive.results.find(r=>r.page==='009-386');assert.equal(typo.structuredResultCount,3);assert.equal(typo.allPassed,true);
});
test('all 99 original unfinished editors are rejected; no empty-result completion counts as passing',()=>{
 assert.deepEqual(new Set(negative.results.map(key)),new Set(positive.results.map(key)));
 assert.equal(negative.summary.allPassedEditors,0);assert.equal(negative.summary.structuredEditors,92);
 for(const r of negative.results){assert.equal(r.allPassed,false,key(r));if(r.reason==='done'){assert.ok(r.structuredResultCount>0,key(r));assert.ok(r.failed>0,key(r))}else assert.equal(r.reason,'error',key(r))}
 const errors=negative.results.filter(r=>r.reason==='error');assert.equal(errors.length,7);
 assert.equal(errors.filter(r=>r.error.includes('IndentationError')).length,5);assert.ok(errors.every(r=>!r.error.includes("No module named 'pandas'")));
 assert.equal(negative.workerHashBefore,negative.workerHashAfter);assert.equal(negative.workerHashAfter,positive.workerHashAfter);assert.equal(negative.sourceUnchanged,true);
});
test('Python and JavaScript reject missing, empty, malformed and incorrectly typed judge responses',()=>{
 assert.equal(protocol.results.length,10);assert.equal(protocol.workerHashBefore,protocol.workerHashAfter);assert.equal(protocol.workerHashAfter,positive.workerHashAfter);
 for(const r of protocol.results){assert.equal(r.reason,r.expectedReason,r.id);if(r.id.endsWith('valid-rejection')){assert.equal(r.structuredResultCount,1);assert.equal(r.failed,1)}else{assert.equal(r.structuredResultCount,0);assert.ok(!r.messages.some(m=>m.type==='done'));assert.match(r.error,/无法判定通过/)}}
});
test('the literal baseline retains failed diagnostic runs for all 31 disabled browser judge remnants',()=>{
 assert.equal(baseline.results.length,130);assert.equal(baseline.results.filter(r=>!r.judgeEnabled).length,31);
 assert.equal(baseline.results.filter(r=>r.judgeEnabled&&r.allPassed).length,95);
 assert.equal(baseline.results.filter(r=>r.judgeEnabled&&r.reason==='error').length,4);
 assert.equal(baseline.sourceUnchanged,true);
});
test('independent native execution completes the remaining eight enabled judges and rejects both wrong sentinels',async()=>{
 const native=await read('runner-author-baseline.json'),wrong=await read('runner-author-negative.json');
 assert.equal(native.decodeEdQuotes,false);assert.equal(native.results.length,8);
 const cases=native.results.flatMap(r=>r.structuredResults);assert.equal(cases.length,34);assert.ok(cases.every(r=>r.succeeded===true));
 for(const r of native.results){assert.equal(r.result.exitCode,0);assert.equal(r.result.timedOut,false);assert.ok(r.structuredResults.length>0)}
 assert.deepEqual(new Set(wrong.results.map(r=>r.language)),new Set(['c++','java']));
 const rejected=wrong.results.flatMap(r=>r.structuredResults);assert.equal(rejected.length,8);assert.ok(rejected.every(r=>r.succeeded===false));
 assert.equal(positive.results.length+native.results.length,107);assert.equal(positive.summary.passed+cases.length,328);
});
test('the changed Python setup preserves the existing public-test branch, including CRLF input',async()=>{
 const regression=await read('runtime-unit-public-regression.json');assert.equal(regression.results.length,2);
 assert.equal(regression.workerHashBefore,regression.workerHashAfter);assert.equal(regression.workerHashAfter,positive.workerHashAfter);
 const cases=regression.results.flatMap(r=>r.messages.filter(m=>m.type==='testResults').flatMap(m=>m.value));assert.equal(cases.length,4);assert.ok(cases.every(r=>r.succeeded));
 for(const r of regression.results)assert.equal(r.reason,'done');
});
