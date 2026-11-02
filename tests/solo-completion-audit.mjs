import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5173',out='output/editor-visual',browser=await chromium.launch();
const report={startedAt:new Date().toISOString(),base,source:'https://edu.py2fun.com/learn#/course/015/page/936/completed',checks:[],pairs:[],errors:[],limitations:['Original anonymous completion API opens its WeChat login; this is dismissed with its close control before photographing. No account or login fabricated.','Authenticated punch-card poster requires original user data and remains unavailable locally.','Local +10 is a one-time lesson progress reward; no original account balance is claimed.']};
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  const name=`completion-${viewport.width===1280?'desktop':'mobile'}`,context=await browser.newContext({viewport}),source=await context.newPage(),local=await context.newPage();
  await local.route('**/api/progress',r=>r.fulfill({json:{configured:false,progress:{version:1,lessons:{}}}}));
  local.on('pageerror',e=>report.errors.push(e.message));
  await source.goto(report.source);await source.locator('._completed_1deat_1').waitFor();
  await source.locator('.close._close_uk1y9_62').waitFor();await source.locator('.close._close_uk1y9_62').click();
  await source.locator('._pageFooter_yw3dv_1 button').waitFor();
  await local.goto(`${base}/#/course/015/page/936/completed`);await local.locator('.solo-completed-loading').waitFor();
  assert.equal(await local.getByRole('button',{name:'继续',exact:true}).count(),0);
  await local.getByRole('button',{name:'继续',exact:true}).waitFor();
  for(let attempt=0;attempt<4;attempt++){if(await source.locator('.close._close_uk1y9_62').isVisible())await source.locator('.close._close_uk1y9_62').click();await source.waitForTimeout(350)}
  assert.equal(await source.locator('.close._close_uk1y9_62').isVisible(),false);
  await Promise.all([source.screenshot({path:`${out}/${name}-source.png`}),local.screenshot({path:`${out}/${name}-local.png`})]);
  const selectors=[['._picture_1deat_12','.solo-completed-picture'],['._title_1deat_20','.solo-completed-title'],['._description_1deat_26','.solo-completed-description'],['._firstCompleted_1deat_34','.solo-completed-reward'],['._pageFooter_yw3dv_1 button','.solo-completed-footer button']];
  const rects=[];for(const[a,b]of selectors){const left=await source.locator(a).boundingBox(),right=await local.locator(b).boundingBox();assert.deepEqual(right,left,`${name} ${b}`);rects.push({source:a,local:b,rect:left})}report.pairs.push({name,viewport,rects});
  const saved=await local.evaluate(()=>JSON.parse(localStorage.getItem('brclio-edu-progress-v1')).lessons['015:936']);assert.equal(saved.completed,true);assert.equal(saved.answers.__completionReward,10);
  await local.reload();await local.locator('.solo-completed').waitFor();assert.equal(await local.locator('.solo-completed-reward').count(),0);assert.equal(await local.evaluate(()=>JSON.parse(localStorage.getItem('brclio-edu-progress-v1')).lessons['015:936'].answers.__completionReward),10);
  await local.getByRole('button',{name:'继续',exact:true}).click();await local.waitForURL('**/#/course/015/catalog');await source.locator('._pageFooter_yw3dv_1 button').click();await source.waitForURL(url=>url.hash==='#/course/015/catalog');
  report.checks.push(`${viewport.width}: exact first-completion positions; loading before Continue; real source and local Continue both return to catalog; reload retains completion/reward and does not award twice`);
  await context.close();console.log(name,'passed');
 }
 const data=JSON.parse(await fs.readFile('public/content/pages/015-936.json','utf8'));const steps=data.components.flatMap(c=>['QuizRef','QuestionRef'].includes(c.type)&&c.resolved?[...(c.resolved.knowledges?.length?[{}]:[]),...(c.resolved.question_text||c.resolved.question_options?.length?[{id:c.content.comp_id}]:[])]:[{}]);
 const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/api/progress',r=>r.fulfill({json:{configured:false,progress:{version:1,lessons:{}}}}));await context.addInitScript(({step,ids})=>{if(!localStorage.getItem('brclio-edu-progress-v1'))localStorage.setItem('brclio-edu-progress-v1',JSON.stringify({version:1,updatedAt:new Date().toISOString(),lessons:{'015:936':{completed:false,updatedAt:new Date().toISOString(),answers:{__step:step,__notes:'completion note',...Object.fromEntries(ids.map(id=>[id,{checked:true,correct:true}]))}}}}))},{step:steps.length-1,ids:steps.map(x=>x.id).filter(Boolean)});
 const page=await context.newPage();await page.goto(`${base}/#/course/015/page/936`);await page.getByRole('button',{name:'完成本节',exact:false}).click();await page.waitForURL('**/completed');await page.locator('.solo-completed-reward').waitFor();assert.equal(await page.locator('.lesson-header,.lesson-footer,.complete-panel').count(),0);const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('brclio-edu-progress-v1')).lessons['015:936']);assert.equal(saved.completed,true);assert.equal(saved.answers.__notes,'completion note');assert.equal(saved.answers.__step,steps.length-1);assert.equal(saved.answers.__completionReward,10);report.checks.push('Actual final-step button enters independent completed route, stores completion/reward, retains last step and notes, removes lesson shell');await context.close();
}catch(error){report.errors.push(error.stack);process.exitCode=1;console.error(error)}finally{await browser.close();report.finishedAt=new Date().toISOString();await fs.writeFile('tests/solo-completion-audit.json',JSON.stringify(report,null,2)+'\n')}
