import {installRuntimeRelay} from './runtime-relay-helper.mjs';
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.AUDIT_BASE||'https://edu.brclio.com';const report={startedAt:new Date().toISOString(),base,tests:[],errors:[]};const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:1000}});
if(process.env.AUDIT_RESUME){const previous=JSON.parse(await readFile('tests/production-runtime-audit.json','utf8'));if(previous.base!==base)throw Error('Resume frontend base differs');report.tests=previous.tests;report.previousAttempts=[...(previous.previousAttempts||[]),{startedAt:previous.startedAt,finishedAt:previous.finishedAt,errors:previous.errors,executionRelay:previous.executionRelay,lastRuntimeView:previous.lastRuntimeView}];}
await installRuntimeRelay(context,report);
await context.route('**/api/progress',route=>route.fulfill({json:{configured:false,progress:{version:1,updatedAt:'1970-01-01T00:00:00.000Z',lessons:{}}}}));const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
try{
 await page.goto(`${base}/#/course/005/page/205`);await page.locator('.edu-code-tabs').first().waitFor();
 const tabs=page.locator('.edu-code-tabs').first(), block=tabs.locator('.edu-code-block');
 for(const language of ['c','c++','java','go-1165','swift','javascript','python'].filter(language=>!report.tests.some(test=>test.language===language))) {
  await tabs.getByRole('tab',{name:({'c':'C','c++':'C++','java':'Java','go-1165':'Go','swift':'Swift','javascript':'Javascript','python':'Python'})[language],exact:true}).click();const start=Date.now();console.log(JSON.stringify({running:language,at:new Date().toISOString()}));
  await block.getByRole('button',{name:'运行代码',exact:true}).click();
  await block.locator('.edu-output').filter({hasText:/^(?!等待输出…$).+/}).waitFor({timeout:125000});await block.getByRole('button',{name:'运行代码',exact:true}).waitFor({timeout:125000});
  const output=(await block.locator('.edu-output').innerText()).trim();assert.equal(output,'6');
  report.tests.push({language,originalPage:'005-205',expected:'6',actual:output,milliseconds:Date.now()-start});console.log(JSON.stringify(report.tests.at(-1)));
 }
 if(!report.tests.some(test=>test.language==='python multiprocessing')){const multiprocessing=await page.evaluate(async()=>{const response=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'python',code:'from multiprocessing import Pool\ndef square(x): return x*x\nif __name__ == "__main__":\n    with Pool(2) as p: print(p.map(square,[2,3,4]))',stdin:'',files:[],testcases:[]})});return {status:response.status,body:await response.json()}});
 assert.equal(multiprocessing.status,200);assert.equal(multiprocessing.body.stdout.trim(),'[4, 9, 16]');report.tests.push({language:'python multiprocessing',...multiprocessing});}
 await page.goto(`${base}/#/course/004/page/117`);await page.locator('.edu-animation').first().waitFor();const animation=page.locator('.edu-animation').first(),sources=[];
 for(let i=0;i<5;i++){await page.waitForFunction(({index,previous})=>{const root=document.querySelector('.edu-animation'),svg=root.querySelector('.edu-inline-svg svg');return root.querySelector('.animation-counter').textContent.replace(/\s/g,'')===`${index+1}/5`&&svg&&svg.outerHTML!==previous},{index:i,previous:sources.at(-1)||''});sources.push(await animation.locator('.edu-inline-svg svg').evaluate(el=>el.outerHTML));if(i<4)await animation.getByRole('button',{name:'下一步',exact:true}).click();}
 assert.equal(new Set(sources).size,5);await animation.getByRole('button',{name:'重播动画',exact:true}).click();await page.waitForFunction(first=>document.querySelector('.edu-animation .animation-counter').textContent.replace(/\s/g,'')==='1/5'&&document.querySelector('.edu-animation .edu-inline-svg svg')?.outerHTML===first,sources[0]);report.tests.push({animation:'004-117',frames:5,distinctRenderedSVGs:5,reset:true});
 await page.goto(`${base}/#/course/002/page/28`);await page.locator('.katex math').first().waitFor();report.tests.push({math:'002-28',formulas:await page.locator('.katex').count()});
 await page.goto(`${base}/#/course/005/page/260`);await page.locator('.edu-markmap-svg .markmap-node').first().waitFor();report.tests.push({mindmap:'005-260',nodes:await page.locator('.edu-markmap-svg .markmap-node').count()});
 assert.equal(report.errors.length,0,report.errors.join('\n'));
}catch(error){report.errors.push(error.stack||String(error));report.lastRuntimeView=await page.locator('.edu-code-tabs').first().innerText().catch(()=>null);throw error;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('tests/production-runtime-audit.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
