import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from '../scripts/audit-content.mjs';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5173';
const schema=JSON.parse(await readFile(path.join(root,'tests/browser-audit-schema.json'),'utf8'));
const files=new Set(schema.codeBlocks.filter(code=>code.additionalFiles>0).map(code=>code.file));
for(const job of schema.pages){const data=await readFile(path.join(root,'public',job.file),'utf8');if(data.includes('"MarkMap"'))files.add(job.file);}
const browser=await chromium.launch({headless:true,channel:'chromium'}),page=await browser.newPage();
await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
await page.goto(`${base}/tests/browser-audit-harness.html`);await page.waitForFunction(()=>Boolean(window.contentAudit));
const report={startedAt:new Date().toISOString(),files:[],fileTabs:0,mindmapNodes:0,mindmapZoomActions:0,errors:[]};
try{for(const file of files){
 try{await page.evaluate(file=>window.contentAudit.render(file),file);const lists=page.getByRole('tablist',{name:'代码文件',exact:true});let tabsChecked=0;
 for(let i=0;i<await lists.count();i++){const tabs=lists.nth(i).getByRole('tab');for(let j=0;j<await tabs.count();j++){await tabs.nth(j).click();if(await tabs.nth(j).getAttribute('aria-selected')!=='true')throw Error('File tab selection failed');tabsChecked++;}}
 report.fileTabs+=tabsChecked;
 const mindmap=page.locator('.edu-mindmap-interactive');if(await mindmap.count()){
  const branches=mindmap.locator('button[aria-expanded]');const count=await branches.count();
  for(let i=count-1;i>=0;i--){const branch=branches.nth(i);await branch.click();if(await branch.getAttribute('aria-expanded')!=='false')throw Error('Mindmap collapse failed');await branch.click();if(await branch.getAttribute('aria-expanded')!=='true')throw Error('Mindmap expand failed');report.mindmapNodes++;}
  await mindmap.getByRole('button',{name:'放大导图',exact:true}).click();if(!await mindmap.locator('.edu-mindmap-toolbar').innerText().then(text=>text.includes('110%')))throw Error('Mindmap zoom in failed');
  await mindmap.getByRole('button',{name:'缩小导图',exact:true}).click();await mindmap.getByRole('button',{name:'重置导图',exact:true}).click();report.mindmapZoomActions+=3;
 }
 report.files.push({file,tabsChecked});
 }catch(error){report.errors.push({file,error:error.stack||error.message});}
}}finally{await browser.close();}
report.finishedAt=new Date().toISOString();await writeFile(path.join(root,'tests/browser-audit-extra-controls.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,files:report.files.length},null,2));
