import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.AUDIT_BASE||'https://edu.brclio.com';const report={startedAt:new Date().toISOString(),base,tests:[],errors:[]};const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:1000}});
await context.route('**/api/progress',route=>route.fulfill({json:{configured:false,progress:{version:1,updatedAt:'1970-01-01T00:00:00.000Z',lessons:{}}}}));const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
try{
 await page.goto(`${base}/#/course/005/page/205`);await page.locator('.edu-code-tabs').first().waitFor();
 const tabs=page.locator('.edu-code-tabs').first(), block=tabs.locator('.edu-code-block');
 for(const language of ['c','c++','java','go-1165','swift','javascript','python']) {
  await tabs.getByRole('tab',{name:({'c':'C','c++':'C++','java':'Java','go-1165':'Go','swift':'Swift','javascript':'Javascript','python':'Python'})[language],exact:true}).click();const start=Date.now();
  await block.locator('.edu-code-actions>.edu-primary').click();
  await block.locator('.edu-code-actions').getByText('运行结束',{exact:true}).waitFor({timeout:125000});
  const output=(await block.locator('.edu-output').innerText()).trim();assert.equal(output,'6');
  report.tests.push({language,originalPage:'005-205',expected:'6',actual:output,milliseconds:Date.now()-start});console.log(JSON.stringify(report.tests.at(-1)));
 }
 const multiprocessing=await page.evaluate(async()=>{const response=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'python',code:'from multiprocessing import Pool\ndef square(x): return x*x\nif __name__ == "__main__":\n    with Pool(2) as p: print(p.map(square,[2,3,4]))',stdin:'',files:[],testcases:[]})});return {status:response.status,body:await response.json()}});
 assert.equal(multiprocessing.status,200);assert.equal(multiprocessing.body.stdout.trim(),'[4, 9, 16]');report.tests.push({language:'python multiprocessing',...multiprocessing});
 await page.goto(`${base}/#/course/004/page/117`);await page.locator('.edu-animation').first().waitFor();const animation=page.locator('.edu-animation').first(),sources=[];
 for(let i=0;i<5;i++){await page.waitForFunction(index=>document.querySelector('.animation-counter').textContent.trim()===`${index+1} / 5`,i);sources.push(await animation.locator('img').getAttribute('src'));if(i<4)await animation.locator('.animation-next').click();}
 assert.equal(new Set(sources).size,5);await animation.locator('.animation-reset').click();await page.waitForFunction(()=>document.querySelector('.animation-counter').textContent.trim()==='1 / 5');report.tests.push({animation:'004-117',frames:5,reset:true});
 await page.goto(`${base}/#/course/002/page/28`);await page.locator('.katex math').first().waitFor();report.tests.push({math:'002-28',formulas:await page.locator('.katex').count()});
 await page.goto(`${base}/#/course/005/page/260`);await page.locator('.edu-markmap-svg .markmap-node').first().waitFor();report.tests.push({mindmap:'005-260',nodes:await page.locator('.edu-markmap-svg .markmap-node').count()});
 assert.equal(report.errors.length,0,report.errors.join('\n'));
}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('tests/production-runtime-audit.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
