import {readCode,replaceCode} from './editor-helper.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const report={startedAt:new Date().toISOString(),checks:[],errors:[]};
await page.addInitScript(()=>{
 const NativeWorker=window.Worker;window.resetAudit={created:0,terminated:0};
 window.Worker=class extends NativeWorker{
  constructor(...args){super(...args);window.resetAudit.created++}
  terminate(){window.resetAudit.terminated++;return super.terminate()}
 };
});
await page.route('**/*',route=>route.request().url().startsWith(base)||/^(data:|blob:)/.test(route.request().url())?route.continue():route.abort());
try{
 await page.goto(base+'/tests/browser-audit-harness.html');await page.waitForFunction(()=>window.contentAudit);
 await page.evaluate(()=>window.contentAudit.render('/content/pages/001-1.json','article'));
 const block=page.locator('[data-audit-component="3cabd32aeee311eba4783af9d3c2d1d5"] .edu-code-block');
 const original=await readCode(block);
 await replaceCode(block,'print("article previous output")');await block.getByRole('button',{name:'运行代码',exact:true}).click();
 const output=block.getByLabel('运行结果',{exact:true});await output.filter({hasText:'article previous output'}).waitFor({timeout:120000});
 await block.getByRole('button',{name:'运行代码',exact:true}).waitFor();
 const before=await output.innerText();await replaceCode(block,'print("unexecuted editor change")');
 await block.getByRole('button',{name:'重置代码',exact:true}).click();
  await page.waitForFunction(source=>document.querySelector('[data-audit-component="3cabd32aeee311eba4783af9d3c2d1d5"] .edu-source-editor')?.eduEditor?.getValue()===source,original);
 assert.equal(await readCode(block),original);assert.equal(await output.innerText(),before);
 report.checks.push('article reset restores original code and retains actual prior stdout');

 await replaceCode(block,'while True:\n    pass');const terminatedBefore=await page.evaluate(()=>window.resetAudit.terminated);
 await block.getByRole('button',{name:'运行代码',exact:true}).click();await block.getByRole('button',{name:'停止运行',exact:true}).waitFor();
 await block.getByRole('button',{name:'重置代码',exact:true}).click();
  await page.waitForFunction(source=>document.querySelector('[data-audit-component="3cabd32aeee311eba4783af9d3c2d1d5"] .edu-source-editor')?.eduEditor?.getValue()===source,original);
 assert.equal(await readCode(block),original);assert.equal(await page.evaluate(()=>window.resetAudit.terminated),terminatedBefore+1);
 assert.equal(await block.getByRole('button',{name:'运行代码',exact:true}).count(),1);
 report.checks.push('article reset terminates the active real Worker and restores runnable editor');

 const source=JSON.parse(await readFile('public/content/pages/001-4.json','utf8'));
 const target='5a34755cf28811eb9e203af9d3c2d1d5';let data;
 const walk=v=>{if(!v||typeof v!=='object')return;if(v.comp_id===target)data=v;for(const child of Object.values(v))if(typeof child==='object')walk(child)};walk(source);
 await page.evaluate(()=>window.contentAudit.render('/content/pages/001-4.json','article'));
 const judged=page.locator(`[data-audit-component="${target}"] .edu-code-block`);
 await replaceCode(judged,data.solution_content);await judged.getByRole('button',{name:'提交代码',exact:true}).click();
 await judged.locator('.edu-test-results .edu-success').waitFor({timeout:120000});
 await judged.getByRole('button',{name:'重置代码',exact:true}).click();
  await page.waitForFunction(({id,source})=>document.querySelector(`[data-audit-component="${id}"] .edu-source-editor`)?.eduEditor?.getValue().trimEnd()===source,{id:target,source:data.content.trimEnd()});
  assert.equal(await judged.locator('.edu-test-results').count(),0);assert.equal((await readCode(judged)).trimEnd(),data.content.trimEnd());
 report.checks.push('reset clears actual passed judge results while restoring the original unfinished code');
}catch(error){report.errors.push(error.stack||String(error));process.exitCode=1}
finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('tests/article-reset-regression.json',JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify(report,null,2));
