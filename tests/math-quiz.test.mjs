import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const report=JSON.parse(await fs.readFile('tests/math-quiz-audit.json','utf8'));
test('43 real mathematical questions and two dollar-literal fills complete wrong/retry/correct flows on desktop and narrow screens',()=>{
 assert.equal(report.inventory.actualMath,43);assert.equal(report.inventory.dollarCodeFillGuards,2);assert.equal(report.results.length,90);
 assert.equal(report.summary.checks,535);assert.equal(report.summary.failures,0);assert.equal(report.summary.externalRequests,0);assert.equal(report.summary.pageErrors,0);
 for(const row of report.results){assert.deepEqual(row.errors,[]);for(const check of ['unanswered disabled','wrong answer rejected','retry clears answers','original correct answer accepted'])assert.ok(row.checks.includes(check),row.file+' '+check);if(row.viewport.width===390)assert.ok(row.checks.includes('narrow-screen action hit target usable'))}
 const fills=report.results.filter(row=>row.selection==='dollar-code-fill-guard');assert.equal(fills.length,4);assert.ok(fills.every(row=>row.checks.includes('literal dollar code and all blanks keep typing focus')));
 assert.equal(report.results.reduce((n,r)=>n+r.mathCount,0),284);
});
test('source-wide blank scan contains no actual formula-embedded blanks; course and renderer bytes remain unchanged during audit',()=>{
 assert.equal(report.inventory.allFillQuestions,717);assert.deepEqual(report.inventory.actualBlanksInsideFormula,[]);assert.equal(report.sourceUnchanged,true);assert.equal(report.rendererHashBefore,report.rendererHashAfter);
});
