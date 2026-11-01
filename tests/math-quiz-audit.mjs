/** Focused real Quiz interaction audit after enabling KaTeX. Run with node --import tsx. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import {courseMathMarkdown} from '../src/content-math.ts';
import {quizBlankKeys,quizExpectedBlank} from '../src/content-model.ts';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5173';
const sha=b=>createHash('sha256').update(b).digest('hex');
const rendererHash=async()=>sha((await Promise.all(['src/Content.tsx','src/content-math.ts','src/content-model.ts','src/quiz.css'].map(f=>fs.readFile(f)))).join('\n'));
const parser=unified().use(remarkParse).use(remarkGfm).use(remarkMath);
function formulas(text){const out=[];function walk(n){if(n.type==='math'||n.type==='inlineMath')out.push(n.value);n.children?.forEach(walk)}walk(parser.parse(courseMathMarkdown(text||'')));return out}
const records=[],allFill=[],sourceHashes={};
function walk(v,file,trail=''){
 if(Array.isArray(v)){v.forEach((x,i)=>walk(x,file,trail+'/'+i));return}if(!v||typeof v!=='object')return;
 if(v.question_type){
  const q=v,text=q.question_text||q.question_text_html||'',options=q.question_options||[],questionMath=formulas(text),optionMath=options.map(o=>formulas(o.text||o.text_html||'')),explanationMath=options.map(o=>formulas(o.explanation?.md_text||o.explanation?.md_html||'')),mathCount=questionMath.length+optionMath.flat().length+explanationMath.flat().length;
  const fill=['type_in','typein','multi_type_in','drag_and_drop','fill_in','fill_blank'].includes(q.question_type),blanks=fill?quizBlankKeys(q.question_type,text,options):[];
  if(fill)allFill.push({file,trail,kind:q.question_type,blanks,formulas:questionMath,blankInsideFormula:questionMath.filter(f=>/__\d+__/.test(f))});
  if(mathCount||fill&&(text.includes('$')||options.some(o=>String(o.text||'').includes('$'))))records.push({file,trail,q,questionMath,optionMath,explanationMath,mathCount,blanks,fill,selection:mathCount?'actual-math':'dollar-code-fill-guard'});
 }
 for(const[k,x]of Object.entries(v))if(typeof x==='object')walk(x,file,trail+'/'+k);
}
for(const name of(await fs.readdir('public/content/pages')).filter(f=>f.endsWith('.json')).sort()){const bytes=await fs.readFile('public/content/pages/'+name);sourceHashes[name]=sha(bytes);walk(JSON.parse(bytes),name)}
const report={startedAt:new Date().toISOString(),rendererHashBefore:await rendererHash(),inventory:{selected:records.length,actualMath:records.filter(r=>r.mathCount).length,dollarCodeFillGuards:records.filter(r=>!r.mathCount).length,allFillQuestions:allFill.length,actualBlanksInsideFormula:allFill.filter(r=>r.blankInsideFormula.length),byKind:records.reduce((o,r)=>(o[r.q.question_type]=(o[r.q.question_type]||0)+1,o),{})},results:[],externalRequests:[],pageErrors:[],limitations:['Actual production Quiz and Markdown renderer mounted in the existing isolated Content harness; does not repeat the full App audit.','Original mathematical questions/options/explanations are selected by Markdown math AST. Two literal JavaScript template-string fills are included to check dollar signs and inputs stay literal.','Source-wide fill scan reports actual formula-contained blanks; it does not invent synthetic course examples.']};
const browser=await chromium.launch({headless:true});let current;
async function assertMath(quiz,expected,phase,row){const found=await quiz.locator('annotation[encoding="application/x-tex"]').allTextContents();for(const formula of expected)assert.ok(found.includes(formula),phase+' missing '+formula);assert.equal(await quiz.locator('.katex-error').count(),0);row.checks.push(phase+' formulas visible')}
try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
 const context=await browser.newContext({viewport});context.setDefaultTimeout(8000);await context.route('**/*',async route=>{const url=route.request().url();if(new URL(url).pathname==='/__quiz-math-audit.json')return route.fulfill({json:{title:current.file,components:[{type:'Quiz',content:{comp_id:'math-audit',questions:[current.q]}}]}});if(url.startsWith(base)||/^(data:|blob:)/.test(url))return route.continue();report.externalRequests.push(url);return route.abort()});
 const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(base+'/tests/browser-audit-harness.html');await page.waitForFunction(()=>!!window.contentAudit);
 for(let index=0;index<records.length;index++){
  current=records[index];const r=current,q=r.q,options=q.question_options||[],row={file:r.file,trail:r.trail,questionId:q.question_id,kind:q.question_type,selection:r.selection,viewport,mathCount:r.mathCount,blankCount:r.blanks.length,checks:[],errors:[]};
  try{
   const rendered=await page.evaluate(file=>window.contentAudit.render(file),'/__quiz-math-audit.json?index='+index+'&width='+viewport.width);assert.deepEqual(rendered.errors,[]);const quiz=page.locator('.edu-quiz');assert.equal(await quiz.count(),1);await assertMath(quiz,[...r.questionMath,...r.optionMath.flat()],'initial',row);
   const check=quiz.locator('.edu-quiz-actions button');assert.equal(await check.isDisabled(),true);row.checks.push('unanswered disabled');
   if(r.fill){assert.equal(await quiz.locator('.edu-blank').count(),r.blanks.length);for(const key of r.blanks){const input=quiz.getByRole('textbox',{name:'填空 '+(Number(key)+1),exact:true});await input.click();await input.pressSequentially('__wrong__');assert.equal(await input.inputValue(),'__wrong__');assert.equal(await input.evaluate(el=>document.activeElement===el),true);}assert.equal(await quiz.locator('.katex').count(),0);row.checks.push('literal dollar code and all blanks keep typing focus')}
   else{const wrong=options.findIndex(o=>!o.correct);assert.ok(wrong>=0);await quiz.locator(`[data-option-index="${wrong}"]`).click();}
   await check.click();await quiz.locator('.edu-error').waitFor();assert.match(await quiz.locator('[role=status]').innerText(),/答案错误/);row.checks.push('wrong answer rejected');
   let explanation=quiz.locator('.edu-explanation');if(await explanation.count()){await explanation.locator('summary').click();const wrong=options.findIndex(o=>!o.correct);await assertMath(quiz,[...r.questionMath,...r.optionMath.flat(),...(r.fill?[]:r.explanationMath[wrong])],'wrong explanation',row)}
   await check.click();assert.equal(await quiz.locator('input:checked').count(),0);assert.ok((await quiz.locator('.edu-blank').evaluateAll(xs=>xs.map(x=>x.value))).every(x=>x===''));assert.equal(await check.isDisabled(),true);row.checks.push('retry clears answers');
   if(r.fill){for(let i=0;i<r.blanks.length;i++){const input=quiz.getByRole('textbox',{name:'填空 '+(Number(r.blanks[i])+1),exact:true});await input.fill(quizExpectedBlank(q.question_type,options,i)[0].text);}}
   else for(let i=0;i<options.length;i++)if(options[i].correct)await quiz.locator(`[data-option-index="${i}"]`).click();
   await check.click();await quiz.locator('.edu-success').waitFor();assert.match(await quiz.locator('[role=status]').innerText(),/答案正确/);row.checks.push('original correct answer accepted');
   explanation=quiz.locator('.edu-explanation');if(await explanation.count()){if(!await explanation.evaluate(el=>el.open))await explanation.locator('summary').click();await assertMath(quiz,[...r.questionMath,...r.optionMath.flat(),...r.explanationMath.filter((_,i)=>options[i].correct).flat()],'correct explanation',row)}
   const button=await check.boundingBox();assert.ok(button.width>0&&button.height>0);if(viewport.width<500){await check.scrollIntoViewIfNeeded();assert.ok(await check.evaluate(el=>{const b=el.getBoundingClientRect(),t=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return t===el||el.contains(t)}));row.checks.push('narrow-screen action hit target usable')}
  }catch(e){row.errors.push(e.stack||e.message)}
  report.results.push(row);if(row.errors.length)console.log(JSON.stringify(row));
 }
 await context.close();
}}finally{await browser.close()}
report.finishedAt=new Date().toISOString();report.rendererHashAfter=await rendererHash();report.sourceUnchanged=(await Promise.all(Object.entries(sourceHashes).map(async([file,h])=>sha(await fs.readFile('public/content/pages/'+file))===h))).every(Boolean);report.summary={runs:report.results.length,failures:report.results.filter(r=>r.errors.length).length,checks:report.results.reduce((n,r)=>n+r.checks.length,0),actualMathQuestions:report.inventory.actualMath,dollarCodeFillGuards:report.inventory.dollarCodeFillGuards,actualBlanksInsideFormula:report.inventory.actualBlanksInsideFormula.length,externalRequests:report.externalRequests.length,pageErrors:report.pageErrors.length};await fs.writeFile('tests/math-quiz-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({inventory:report.inventory,summary:report.summary},null,2));if(report.summary.failures||report.summary.pageErrors)process.exitCode=1;
