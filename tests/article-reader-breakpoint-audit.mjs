/** Live source/local article reader shell comparison, including the 414/415 breakpoint. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
const base=process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const browser=(session,...args)=>{try{return JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:55000}));}catch(error){if(['open','reload'].includes(args[0])&&String(error.stdout).includes('Operation timed out'))return {success:false,navigationTimedOut:true};throw error;}};
const evaluate=(session,code)=>{const r=browser(session,'eval',code);if(!r.success)throw Error(JSON.stringify(r));return r.data.result;};
const sides=[{side:'source',session:'catalog-fidelity',url:'https://edu.py2fun.com/course/001/page/1',selectors:{sidebar:'.study_nav__1Wu1E',pane:'.study_main__3BfFL',body:'.study_body__3rHTj',title:'.study_body__3rHTj>h1'}},{side:'local',session:'catalog-local-manual',url:base+'/#/course/001/page/1',selectors:{sidebar:'.article-sidebar',pane:'.article-reading-pane',body:'.article-reading-body',title:'.article-page-heading h1'}}];
const report={createdAt:new Date().toISOString(),base,course:'001/1',scope:'Shell and title geometry after CSS, CodeMirror and course title have loaded, with 600ms of consecutive stable measurements. Body comparison uses its content box: the source places mobile padding on the body and local places it on the reading pane.',results:[]};
for(const spec of sides)browser(spec.session,'open',spec.url);
for(const width of [390,414,415,640,700,768,1280]){
  const pair={width,height:900,source:null,local:null,checks:[]};
  for(const spec of sides){
    browser(spec.session,'set','viewport',String(width),'900');browser(spec.session,'reload');
    browser(spec.session,'wait','--fn',`document.querySelector(${JSON.stringify(spec.selectors.title)})?.textContent.trim() === 'Python Hello World'`);
    browser(spec.session,'wait','--fn',`Array.from(document.querySelectorAll('link[rel="stylesheet"]')).every(link=>link.sheet) && !!document.querySelector('.CodeMirror-code')`);
    const result=await evaluate(spec.session,`(async()=>{const selectors=${JSON.stringify(spec.selectors)};const sample=()=>{const output={viewport:innerWidth,documentWidth:document.documentElement.scrollWidth};for(const [name,selector] of Object.entries(selectors)){const e=document.querySelector(selector);if(!e||getComputedStyle(e).display==='none'){output[name]=null;continue;}const r=e.getBoundingClientRect(),s=getComputedStyle(e);output[name]={rect:[r.x+scrollX,r.y+scrollY,r.width,r.height],padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft]};if(name==='body')output.bodyContent=[r.x+scrollX+parseFloat(s.paddingLeft),r.y+scrollY+parseFloat(s.paddingTop),r.width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)];}return output;};let previous='',stable=0,current;for(let i=0;i<100;i++){current=sample();const value=JSON.stringify(current);if(value===previous)stable++;else stable=0;if(stable>=6)return current;previous=value;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Reader geometry did not stabilize');})()`);
    pair[spec.side]=result;
  }
  const compare=(name,a,b)=>pair.checks.push({name,source:a,local:b,passed:JSON.stringify(a)===JSON.stringify(b)});
  compare('sidebarVisible',!!pair.source.sidebar,!!pair.local.sidebar);
  compare('sidebarRect',pair.source.sidebar?.rect??null,pair.local.sidebar?.rect??null);
  compare('readingPaneRect',pair.source.pane.rect,pair.local.pane.rect);
  compare('bodyContentPositionAndWidth',pair.source.bodyContent,pair.local.bodyContent);
  compare('titleRect',pair.source.title.rect,pair.local.title.rect);
  compare('documentWidth',pair.source.documentWidth,pair.local.documentWidth);
  report.results.push(pair);console.log(JSON.stringify({width,checks:pair.checks}));
}
report.summary={checks:report.results.reduce((n,p)=>n+p.checks.length,0),failed:report.results.flatMap(p=>p.checks.filter(c=>!c.passed).map(c=>({width:p.width,...c})))};
await fs.writeFile('tests/article-reader-breakpoint-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary,null,2));if(report.summary.failed.length)process.exitCode=1;
