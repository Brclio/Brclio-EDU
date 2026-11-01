import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { root, scan } from '../scripts/audit-content.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const[k,v]=arg.replace(/^--/,'').split('=');return[k,v||true];}));
const base=String(args.base||'http://127.0.0.1:5173');
const parallel=Math.max(1,Math.min(6,Number(args.parallel||4)));
const schema=await scan();
await writeFile(path.join(root,'tests/browser-audit-schema.json'),JSON.stringify(schema,null,2)+'\n');
let jobs=[...schema.pages,...schema.challenges];
if(args.filter)jobs=jobs.filter(job=>job.file.includes(String(args.filter)));
if(args.limit)jobs=jobs.slice(0,Number(args.limit));
const contentHash=async()=>createHash('sha256').update(await readFile(path.join(root,'src/Content.tsx'))).update(await readFile(path.join(root,'src/content-model.ts'))).digest('hex');
const report={startedAt:new Date().toISOString(),base,browser:'Chromium',contentHashBefore:await contentHash(),coverage:{requestedPages:jobs.filter(j=>j.file.includes('/pages/')).length,requestedChallenges:jobs.filter(j=>j.file.includes('/challenges/')).length},results:[],blockedExternalRequests:0,limitations:['Uses the actual Content renderer in an isolated harness; the App route/step flow is not exercised for every lesson.','Known-answer quiz controls are tested against imported public answer metadata; this is not a comparison with the original server judge.','Code examples are rendered but never automatically executed by this audit.','Code language tabs and animation frame navigation are exercised; code execution and pixel equivalence are not claimed.','External network requests are blocked for deterministic rendering; image/video availability is audited separately.','No screenshot or pixel equivalence claim.']};
const browser=await chromium.launch({headless:true,channel:String(args.channel||'chromium')});
let cursor=0,completed=0;
async function runWorker(workerIndex){
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.route('**/*',async route=>{const url=route.request().url();if(url.startsWith(base)||url.startsWith('data:')||url.startsWith('blob:')||url==='about:blank')await route.continue();else{report.blockedExternalRequests++;await route.abort();}});
 const page=await context.newPage();let pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'audit':undefined));
 await page.goto(`${base}/tests/browser-audit-harness.html`);
 await page.waitForFunction(()=>Boolean(window.contentAudit));
 while(cursor<jobs.length){
  const job=jobs[cursor++];pageErrors=[];const started=Date.now();const result={file:job.file,title:job.title,worker:workerIndex,quizChecks:[],errors:[],pageScriptErrors:[],controls:{codeTabs:0,webTabs:0,animationFrames:0,details:0},render:null};
  try{
   result.render=await page.evaluate(file=>window.contentAudit.render(file),job.file);
   const questions=schema.questions.filter(q=>q.file===job.file);
   const quizzes=page.locator('.edu-quiz');
   if(questions.length!==await quizzes.count())result.quizCountMismatch={expected:questions.length,rendered:await quizzes.count()};
   if(!args['render-only'])for(let index=0;index<Math.min(questions.length,await quizzes.count());index++){
    const question=questions[index],quiz=quizzes.nth(index),check={questionId:question.questionId,componentId:question.componentId,kind:question.kind,status:'not-tested',negativeStatus:'not-tested'};
    const checkWrong=async()=>{const before=await quiz.locator('.edu-option').evaluateAll(nodes=>nodes.map(node=>node.dataset.optionIndex));const button=quiz.getByRole('button',{name:'检查答案',exact:true});if(await button.isDisabled())throw Error('Negative-check button disabled');await button.click({timeout:3000});const verdict=quiz.locator('[role=status]');await verdict.waitFor({state:'visible',timeout:3000});check.negativeVerdict=await verdict.innerText();check.negativeStatus=check.negativeVerdict.includes('答案错误')?'passed':'failed';if(await quiz.locator('.edu-option.correct').count())throw Error('Wrong answer revealed a correct option');await quiz.getByRole('button',{name:'再试一次',exact:true}).click({timeout:3000});if(await quiz.locator('input:checked').count())throw Error('Retry did not clear selection');const after=await quiz.locator('.edu-option').evaluateAll(nodes=>nodes.map(node=>node.dataset.optionIndex));if(before.length>1&&before.every((value,index)=>value===after[index]))throw Error('Retry did not reshuffle options');};
    try{
     if(['single_choice','mult_choice','multiple_choice','multi_choice'].includes(question.kind)){
      const option=sourceIndex=>quiz.locator(`.edu-option[data-option-index="${sourceIndex}"]`);const wrong=Array.from({length:question.options},(_,i)=>i).find(i=>!question.correctOptions.includes(i));if(wrong!==undefined){await option(wrong).click({timeout:3000});await checkWrong();}else if(question.correctOptions.length>1){await option(question.correctOptions[0]).click({timeout:3000});await checkWrong();}
      for(const selected of question.correctOptions)await option(selected).click({timeout:3000});
     }else if(question.kind==='reorder'){
      // Source match_number defines target order; reorder by moving each expected option upward.
      const filename=path.join(root,'public',job.file);const source=JSON.parse(await readFile(filename,'utf8'));let resolved;
      const find=value=>{if(!value||typeof value!=='object')return;if(value.question_id===question.questionId&&value.question_options)resolved=value;for(const child of Object.values(value))if(typeof child==='object')find(child);};find(source);
      if(!resolved)throw Error('Reorder question metadata missing');
      let order=resolved.question_options.map((_,i)=>i).reverse();const target=resolved.question_options.map((_,i)=>i).sort((a,b)=>Number(resolved.question_options[a].match_number)-Number(resolved.question_options[b].match_number));
      if(order.some((v,i)=>v!==target[i]))await checkWrong();
      order=await quiz.locator('.edu-reorder-item').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.optionIndex)));
      for(let position=0;position<target.length;position++){let at=order.indexOf(target[position]);while(at>position){await quiz.getByRole('button',{name:'上移',exact:true}).nth(at).click({timeout:3000});[order[at-1],order[at]]=[order[at],order[at-1]];at--;}}
     }else{
      const inputs=quiz.locator('.edu-blank');
      if(await inputs.count()<question.tokens.length)throw Error(`Blank count ${await inputs.count()} vs ${question.tokens.length}`);
      if(question.expected.some(item=>!item.texts.length))throw Error('Imported metadata has no answer for a rendered blank');
      for(const expected of question.expected){const matching=quiz.getByRole('textbox',{name:`填空 ${Number(expected.key)+1}`,exact:true});if(!await matching.count())throw Error(`Missing blank ${expected.key}`);for(let i=0;i<await matching.count();i++)await matching.nth(i).fill('__audit_wrong_answer__',{timeout:3000});}
      await checkWrong();
      for(const expected of question.expected){const matching=quiz.getByRole('textbox',{name:`填空 ${Number(expected.key)+1}`,exact:true});if(!await matching.count())throw Error(`Missing blank ${expected.key}`);for(let i=0;i<await matching.count();i++)await matching.nth(i).fill(expected.texts[0],{timeout:3000});}
     }
     const button=quiz.getByRole('button',{name:'检查答案',exact:true});
     if(await button.isDisabled())throw Error('Check button remains disabled after known answer');
     await button.click({timeout:3000});
     const verdict=quiz.locator('[role=status]');
     await verdict.waitFor({state:'visible',timeout:3000});
     check.verdict=await verdict.innerText();check.status=check.verdict.includes('答案正确')&&check.negativeStatus!=='failed'?'passed':'failed';
    }catch(error){check.status='failed';check.error=error.message;}
    result.quizChecks.push(check);
   }
   if(!args['render-only']){
    for(const [name,key] of [['代码语言','codeTabs'],['网页示例','webTabs']]){const lists=page.getByRole('tablist',{name,exact:true});for(let list=0;list<await lists.count();list++){const tabs=lists.nth(list).getByRole('tab');for(let tab=0;tab<await tabs.count();tab++){await tabs.nth(tab).click({timeout:3000});if(await tabs.nth(tab).getAttribute('aria-selected')!=='true')throw Error(`Tab did not select: ${name}/${tab}`);result.controls[key]++;}}}
    const animations=page.locator('.edu-animation');for(let index=0;index<await animations.count();index++){const animation=animations.nth(index);const slider=animation.locator('input[type=range]');const frames=Number(await slider.getAttribute('max'))+1;result.controls.animationFrames++;for(let frame=1;frame<frames;frame++){await animation.getByRole('button',{name:'下一步 →',exact:true}).click({timeout:3000});await page.waitForFunction(({index,frame})=>Number(document.querySelectorAll('.edu-animation input[type=range]')[index]?.value)===frame,{index,frame},{timeout:5000});result.controls.animationFrames++;}}
    const details=page.locator('details');for(let index=0;index<await details.count();index++){const item=details.nth(index);await item.locator(':scope > summary').evaluate(element=>element.click());result.controls.details++;}
   }
   result.errors.push(...await page.evaluate(()=>window.contentAudit.errors()));
  }catch(error){result.errors.push(error.stack||error.message);}
  result.pageScriptErrors.push(...pageErrors);result.elapsedMs=Date.now()-started;report.results.push(result);completed++;
  if(completed%50===0||completed===jobs.length){console.log(JSON.stringify({completed,total:jobs.length,renderErrors:report.results.filter(r=>r.errors.length).length,quizFailures:report.results.flatMap(r=>r.quizChecks).filter(q=>q.status==='failed').length}));await writeFile(path.join(root,'tests/browser-audit-results.json'),JSON.stringify(report,null,2)+'\n');}
 }
 await context.close();
}
try{await Promise.all(Array.from({length:parallel},(_,i)=>runWorker(i)));}finally{await browser.close();}
report.finishedAt=new Date().toISOString();report.contentHashAfter=await contentHash();
report.summary={pages:report.results.filter(r=>r.file.includes('/pages/')).length,challenges:report.results.filter(r=>r.file.includes('/challenges/')).length,renderErrors:report.results.filter(r=>r.errors.length).length,blankComponents:report.results.reduce((n,r)=>n+(r.render?.blankComponents?.length||0),0),placeholders:report.results.reduce((n,r)=>n+(r.render?.placeholders?.length||0),0),quizChecks:report.results.flatMap(r=>r.quizChecks).length,quizPassed:report.results.flatMap(r=>r.quizChecks).filter(q=>q.status==='passed').length,quizFailed:report.results.flatMap(r=>r.quizChecks).filter(q=>q.status==='failed').length,negativeChecks:report.results.flatMap(r=>r.quizChecks).filter(q=>q.negativeStatus!=='not-tested').length,negativePassed:report.results.flatMap(r=>r.quizChecks).filter(q=>q.negativeStatus==='passed').length,controls:report.results.reduce((n,r)=>({codeTabs:n.codeTabs+r.controls.codeTabs,webTabs:n.webTabs+r.controls.webTabs,animationFrames:n.animationFrames+r.controls.animationFrames,details:n.details+r.controls.details}),{codeTabs:0,webTabs:0,animationFrames:0,details:0}),pageScriptErrors:report.results.filter(r=>r.pageScriptErrors.length).map(r=>({file:r.file,errors:r.pageScriptErrors})),sourceChangedDuringRun:report.contentHashBefore!==report.contentHashAfter};
await writeFile(path.join(root,'tests/browser-audit-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary,null,2));
