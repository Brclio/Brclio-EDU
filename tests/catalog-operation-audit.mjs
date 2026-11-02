import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
const base = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const call = (session, ...args) => { try { return JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 55000 })); } catch (error) { if (args[0] === 'open' && String(error.stdout).includes('Operation timed out')) return {success:false, navigationTimedOut:true}; throw error; } };
const evaluate = (session, code) => { const response = call(session, 'eval', code); if (!response.success) throw Error(JSON.stringify(response)); return response.data.result; };
const catalog = JSON.parse(await fs.readFile('public/content/catalog.json', 'utf8'));
const sessions = [['source','catalog-fidelity','https://edu.py2fun.com/learn'],['local','catalog-local-manual',base]];
const results = [];
for (const [side, session, host] of sessions) {
  call(session,'open',host+'#/course/list'); call(session,'set','viewport','390','844');
  call(session,'wait',side==='source'?'._course-card_nf0sm_11':'.cc-card');
  for (const category of catalog.categories) {
    call(session,'find','text',category.name,'click','--exact');
    const titleSelector=side==='source'?'._title-text_nf0sm_55':'.cc-card-copy h2';
    call(session,'wait','--fn',`document.querySelectorAll(${JSON.stringify(titleSelector)}).length === ${category.courseNos.length}`);
    const actual=evaluate(session,`Array.from(document.querySelectorAll(${JSON.stringify(titleSelector)})).map(e=>e.textContent.trim())`);
    const expected=category.courseNos.map(no=>catalog.courses.find(c=>c.course_no===no).title);
    results.push({side,action:'category',category:category.name,count:actual.length,passed:JSON.stringify(actual)===JSON.stringify(expected)});
  }
  call(session,'open',host+'#/course/015/catalog');call(session,'wait',side==='source'?'._name_1sclx_53':'.co-hero h1');
  if(side==='source' && evaluate(session,`!!document.querySelector('._action_14z4n_30')`)){ call(session,'click','._action_14z4n_30'); call(session,'open',host+'#/course/015/catalog'); call(session,'wait','._name_1sclx_53'); }
  const header=side==='source'?'._header_1gkvy_6':'.co-chapter-header';
  const cards=side==='source'?'._pageCard_jevq3_1':'.co-lesson-card';
  call(session,'find','nth','1',header,'click');
  call(session,'wait','--fn','document.getAnimations().every(a=>a.playState === "finished" || a.effect?.getTiming().iterations === Infinity)');
  results.push({side,action:'expand-second-chapter',visibleCards:evaluate(session,`Array.from(document.querySelectorAll(${JSON.stringify(cards)})).filter(e=>e.getBoundingClientRect().height>0).length`)});
  call(session,'find','nth','0',header,'click');
  call(session,'wait','--fn','document.getAnimations().every(a=>a.playState === "finished" || a.effect?.getTiming().iterations === Infinity)');
  results.push({side,action:'switch-back-to-first-chapter',visibleCards:evaluate(session,`Array.from(document.querySelectorAll(${JSON.stringify(cards)})).filter(e=>e.getBoundingClientRect().height>0).length`)});
  call(session,'find','nth','0',header,'click');
  call(session,'wait','--fn','document.getAnimations().every(a=>a.playState === "finished" || a.effect?.getTiming().iterations === Infinity)');
  results.push({side,action:'collapse-first-chapter',visibleCards:evaluate(session,`Array.from(document.querySelectorAll(${JSON.stringify(cards)})).filter(e=>e.getBoundingClientRect().height>0).length`)});
}
for(const action of ['expand-second-chapter','switch-back-to-first-chapter','collapse-first-chapter']){const pair=results.filter(x=>x.action===action);for(const row of pair)row.passed=pair[0].visibleCards===pair[1].visibleCards;}
const report={createdAt:new Date().toISOString(),base,viewport:{width:390,height:844},results,passed:results.every(x=>x.passed)};
await fs.writeFile('tests/catalog-operation-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
