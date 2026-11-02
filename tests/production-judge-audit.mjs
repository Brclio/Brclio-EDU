import {installRuntimeRelay} from './runtime-relay-helper.mjs';
import {replaceCode} from './editor-helper.mjs';
import { chromium } from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.AUDIT_BASE||'https://edu.brclio.com', data=JSON.parse(await readFile('public/content/pages/006-263.json','utf8')).components.filter(c=>c.type==='TabbedCode')[1].content.code_contents;
const report={at:new Date().toISOString(),base,checks:[],errors:[]},browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:1000}});await installRuntimeRelay(context,report);await context.route('**/api/progress',r=>r.fulfill({json:{configured:false,progress:{version:1,updatedAt:'1970-01-01T00:00:00.000Z',lessons:{}}}}));const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
try{await page.goto(`${base}/#/course/006/page/263`);await page.locator('.edu-code-tabs').nth(1).waitFor();const tab=page.locator('.edu-code-tabs').nth(1),block=tab.locator('.edu-code-block');
for(const [language,negative] of [['c++',false],['c++',true],['java',false]]){
 const source=data.find(t=>t.language===language);await tab.getByRole('tab',{name:source.title||source.language,exact:true}).click();await replaceCode(block,negative?source.solution_content.replace(/return\s+[^;]+;/g,'return -999;'):source.solution_content);
 assert.equal(await block.locator('.edu-test-results').count(),0);await block.getByRole('button',{name:'提交代码',exact:true}).click();await block.locator('.edu-test-results>p').waitFor({timeout:70000});await block.getByRole('button',{name:'提交代码',exact:true}).waitFor({timeout:70000});const verdict=await block.locator('.edu-test-results>p').innerText();assert.ok(verdict.includes(negative?'通过 0 / 4':'通过 4 / 4'),verdict);report.checks.push({language,negative,verdict});console.log(JSON.stringify(report.checks.at(-1)));
}assert.equal(report.errors.length,0,report.errors.join('\n'));}catch(error){report.errors.push(error.stack||String(error));throw error;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('tests/production-judge-audit.json',JSON.stringify(report,null,2)+'\n');}
