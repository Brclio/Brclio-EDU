/** Live source comparison plus real article navigation, TOC and note persistence. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true});
const report={createdAt:new Date().toISOString(),base,comparisons:[],checks:[]};
const measures=async(page,selector)=>page.locator(selector).evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height).map(e=>{const r=e.getBoundingClientRect();return {text:e.innerText,rect:[r.x,r.y,r.width,r.height]}}));
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/api/progress',r=>r.fulfill({json:{configured:false,progress:{version:1,lessons:{}}}}));
 const source=await context.newPage(),local=await context.newPage();
 await Promise.all([source.goto('https://edu.py2fun.com/course/004/page/117',{waitUntil:'domcontentloaded',timeout:60000}),local.goto(base+'/#/course/004/page/117')]);
 await Promise.all([source.locator('.CodeMirror').first().waitFor(),local.locator('.CodeMirror').first().waitFor()]);
 await Promise.all([source.evaluate(()=>document.fonts.ready),local.evaluate(()=>document.fonts.ready)]);
 for(const[name,a,b]of[
  ['courseTitle','[class*=study_courseName] h4','.article-course-info h2'],
  ['chapters','[class*=study_nav] .ant-collapse-header','.article-chapter-toggle'],
  ['lessonRows','[class*=study_catalog] .ant-list-item','.article-chapter-items>a'],
  ['previousNext','[class*=study_footer] button','.article-navigation button'],
 ]){
  const original=await measures(source,a),copy=await measures(local,b);
  const deltas=original.map((e,i)=>copy[i]?e.rect.map((n,j)=>copy[i].rect[j]-n):null);
  report.comparisons.push({name,source:original,local:copy,deltas,pass:original.length===copy.length&&deltas.every(row=>row&&row.every(n=>Math.abs(n)<.2))});
 }
 await local.locator('.article-toc a').nth(1).click();
 await local.waitForFunction(()=>document.querySelector('.article-toc li.active')?.textContent==='堆栈基本操作');
 assert.ok(local.url().endsWith('/page/117'));report.checks.push('TOC scroll highlights the section without changing the course route');
 await local.locator('.article-menu').click();assert.equal(await local.locator('.article-sidebar').count(),0);
 await local.locator('.article-menu').click();await local.locator('.article-sidebar').waitFor();report.checks.push('sidebar closes and reopens');
 await local.locator('.article-navigation button').last().click();await local.waitForURL('**/page/118');
 await local.locator('.article-page-heading h1').filter({hasText:'括号匹配'}).waitFor();
 assert.equal(await local.locator('.article-navigation>div').first().locator('p').textContent(),'Stack堆栈入门');
 const state=await local.evaluate(()=>JSON.parse(localStorage.getItem('brclio-edu-progress-v1')));
 assert.equal(state.lessons['004:117'].completed,true);report.checks.push('next lesson title, previous title and completion state match actual navigation');
 await local.locator('.article-navigation button').first().click();await local.waitForURL('**/page/117');report.checks.push('previous lesson returns to the correct page');
 await local.locator('.article-notes-toggle').click();await local.locator('.notes-panel textarea').fill('本地笔记持久化核查');await local.reload();
 await local.locator('.article-notes-toggle').click();assert.equal(await local.locator('.notes-panel textarea').inputValue(),'本地笔记持久化核查');report.checks.push('local notes persist after refresh');
 await context.close();
} finally {
 await browser.close();await fs.writeFile('tests/reader-shell-audit.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
if(report.comparisons.some(row=>!row.pass))process.exitCode=1;
