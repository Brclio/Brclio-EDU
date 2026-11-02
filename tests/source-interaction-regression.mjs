import {readCode,replaceCode,editorReadOnly} from './editor-helper.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const report={startedAt:new Date().toISOString(),checks:[],errors:[]};
const check=async(name,action)=>{try{await action();report.checks.push({name,passed:true});console.log('PASS '+name);}catch(error){report.errors.push({name,error:error.stack});console.log('FAIL '+name+': '+error.message);}};
const render=async(file,mode='article')=>page.evaluate(([file,mode])=>window.contentAudit.render('/content/pages/'+file+'.json',mode),[file,mode]);
await page.route('**/*',route=>route.request().url().startsWith(base)||/^(data:|blob:)/.test(route.request().url())?route.continue():route.abort());
await page.goto(base+'/tests/browser-audit-harness.html');await page.waitForFunction(()=>window.contentAudit);
try{
 await check('solo source is read-only; workspace edits persist, runs real Python, closes and restores',async()=>{
  await render('015-937','solo');const block=page.locator('.edu-solo-code').first();
  assert.equal(await editorReadOnly(block),true);
  await block.getByRole('button',{name:'尝试一下',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'代码练习',exact:true});await dialog.waitFor();
  assert.equal(await dialog.locator('.edu-workspace-body').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),2);
  await replaceCode(dialog,'print("workspace check")');
  await dialog.getByRole('button',{name:'运行 ▶',exact:true}).click();
  await dialog.getByLabel('运行结果',{exact:true}).filter({hasText:'workspace check'}).waitFor({timeout:120000});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert.match(await readCode(block),/Hello world/);
  await block.getByRole('button',{name:'尝试一下',exact:true}).click();await dialog.waitFor();
  assert.equal(await readCode(dialog),'print("workspace check")');
  await replaceCode(dialog,'print(input())');await dialog.getByRole('button',{name:'运行 ▶',exact:true}).click();
  const prompt=dialog.getByRole('dialog',{name:'看起来你需要参数输入'});await prompt.waitFor();
  await prompt.getByLabel('程序标准输入').fill('reader');await prompt.getByRole('button',{name:'尝试一下'}).click();
  await dialog.getByLabel('运行结果',{exact:true}).filter({hasText:'reader'}).waitFor({timeout:120000});
  await dialog.getByRole('button',{name:'关闭代码练习',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 });
 await check('drag word bank follows focused blank, hides used values, returns replaced value, advances focus',async()=>{
  await render('015-942','solo');const quiz=page.locator('[data-audit-component="7e8986d2-e0e0-3012-826e-2f02e2c7d219"] .edu-quiz');
  const inputs=quiz.locator('.edu-blank'),bank=quiz.locator('.edu-word-bank');
  await inputs.nth(1).focus();await bank.getByRole('button',{name:'10',exact:true}).click();
  assert.equal(await inputs.nth(1).inputValue(),'10');assert.equal(await inputs.nth(0).inputValue(),'');assert.equal(await bank.getByRole('button',{name:'10',exact:true}).count(),0);
  assert.equal(await inputs.nth(2).evaluate(e=>document.activeElement===e),true);
  await inputs.nth(1).focus();await bank.getByRole('button',{name:'5',exact:true}).click();
  assert.equal(await bank.getByRole('button',{name:'10',exact:true}).count(),1);assert.equal(await inputs.nth(1).inputValue(),'5');
 });
 await check('multi-choice submit count matches source; wrong answer locks then retry clears',async()=>{
  await render('016-994','solo');const quiz=page.locator('[data-audit-component="3cbeb636-ee68-3052-ab4d-572eabb2ed36"] .edu-quiz');const submit=quiz.getByRole('button',{name:'检查答案',exact:true});
  await quiz.locator('[data-option-index="0"]').click();assert.equal(await submit.isDisabled(),true);
  await quiz.locator('[data-option-index="2"]').click();assert.equal(await submit.isDisabled(),false);await submit.click();
  assert.match(await quiz.getByRole('status').innerText(),/答案错误/);assert.equal(await quiz.locator('input:not(:disabled)').count(),0);
  await quiz.getByRole('button',{name:'再试一次'}).click();assert.equal(await quiz.locator('input:checked').count(),0);
 });
 await check('animation image does not advance; next and reset control frames',async()=>{
  await render('004-117');const animation=page.locator('.edu-animation').first();await page.waitForFunction(()=>document.querySelector('.edu-animation')?.getAttribute('aria-busy')==='false');
  const counter=animation.locator('.animation-counter');await animation.locator('.edu-animation-stage').click();assert.match(await counter.innerText(),/^1\s*\//);
  await animation.locator('.animation-next').click();await page.waitForFunction(()=>document.querySelector('.animation-counter')?.textContent.startsWith('2'));
  await animation.getByRole('button',{name:'重播动画'}).click();await page.waitForFunction(()=>document.querySelector('.animation-counter')?.textContent.startsWith('1'));
 });
 await check('native code hints retain all original hints and close without changing code',async()=>{
  await render('001-4');const block=page.locator('[data-audit-component="5a34755cf28811eb9e203af9d3c2d1d5"] .edu-code-block');
  const before=await readCode(block);await block.getByRole('button',{name:'获取提示？'}).click();
  const hints=block.locator('.edu-article-card').filter({hasText:'条提示'});assert.match(await hints.innerText(),/第1\/3条提示/);
  await hints.getByRole('button',{name:'下一条提示'}).click();assert.match(await hints.innerText(),/第2\/3条提示/);
  await hints.getByRole('button',{name:'下一条提示'}).click();assert.equal(await hints.getByRole('button',{name:'下一条提示'}).isDisabled(),true);
  await hints.getByRole('button',{name:/关闭第\d\/3条提示/}).click();assert.equal(await hints.count(),0);assert.equal(await readCode(block),before);
 });
 await check('web workspace has HTML CSS JS plus result, waits for run, reruns edited source',async()=>{
  await render('022-1177','solo');const block=page.locator('.edu-solo-code').first();await block.getByRole('button',{name:'尝试一下'}).click();
  const dialog=page.getByRole('dialog',{name:'网页代码练习'});await dialog.waitFor();assert.equal(await dialog.locator('.edu-source-editor').count(),3);assert.equal(await dialog.locator('iframe').count(),0);
  await dialog.getByRole('button',{name:'运行 ▶'}).click();await dialog.frameLocator('iframe').getByText('Hello World!',{exact:true}).waitFor();
  await replaceCode(dialog.getByRole('region',{name:'JS 编辑器'}),'document.body.textContent = "edited web";');
  assert.equal(await dialog.frameLocator('iframe').getByText('Hello World!',{exact:true}).count(),1);
  await dialog.getByRole('button',{name:'运行 ▶'}).click();await dialog.frameLocator('iframe').getByText('edited web',{exact:true}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
 });
}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('tests/source-interaction-regression.json',JSON.stringify(report,null,2)+'\n');}
if(report.errors.length)process.exitCode=1;
