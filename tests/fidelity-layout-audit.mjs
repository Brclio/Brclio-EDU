import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true});
await fs.mkdir('output/fidelity',{recursive:true});
const report={date:new Date().toISOString(),base,pairs:[]};
const pairs=[
 {id:'article-004-117',source:'https://edu.py2fun.com/course/004/page/117',local:'/course/004/page/117',nodes:[['title','h1','.article-page-heading h1'],['toc','[class*=study_anchor] .ant-collapse','.article-toc'],['firstMarkdown','[class*=study_body] > [class^=markdown_markdown]','.article-content>.edu-content>.edu-markdown'],['animation','[class^=canvas-animation_canvasAnimation]','.edu-animation'],['firstCode','[class^=code-runner_codeRunner]','.edu-code-block']]},
 {id:'solo-015-936',source:'https://edu.py2fun.com/learn#/course/015/page/936',local:'/course/015/page/936',nodes:[['title','h2','.lesson-main>h1'],['progress','[class^=_progressWithStepper_]','.lesson-progress .progress-track'],['image','[class*=_image_] img','.edu-image img'],['note','[class^=_note_]','.edu-note']]},
];
try{for(const def of pairs)for(const viewport of [{width:1440,height:1000},{width:1280,height:900},{width:390,height:844}]){
 const ctx=await browser.newContext({viewport});ctx.setDefaultTimeout(30000);await ctx.route('**/api/progress',r=>r.fulfill({json:{configured:false,progress:{version:1,lessons:{}}}}));
 const source=await ctx.newPage(),local=await ctx.newPage();await Promise.all([source.goto(def.source,{waitUntil:'domcontentloaded',timeout:60000}),local.goto(base+'/#'+def.local,{waitUntil:'domcontentloaded'})]);
 await Promise.all([source.locator(def.nodes[0][1]).first().waitFor(),local.locator(def.nodes[0][2]).first().waitFor()]);
 await Promise.all([source.locator(def.nodes.at(-1)[1]).first().waitFor(),local.locator(def.nodes.at(-1)[2]).first().waitFor()]);
 if(def.id.startsWith('article'))await local.locator('.CodeMirror').first().waitFor();
 if(def.id.startsWith('solo'))await source.waitForFunction(()=>{const i=document.querySelector('[class*=_image_] img');return i?.complete&&i.naturalWidth>0},null,{timeout:60000});
 await Promise.all([source.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))}),local.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))})]);
 const row={id:def.id,viewport,metrics:[]};
 for(const [name,s,l]of def.nodes){const measure=async(p,sel)=>p.locator(sel).first().evaluate(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,fontSize:c.fontSize,lineHeight:c.lineHeight}});try{const a=await measure(source,s),b=await measure(local,l);row.metrics.push({name,source:a,local:b,delta:Object.fromEntries(['x','y','width','height'].map(k=>[k,Math.round((b[k]-a[k])*100)/100]))})}catch(e){row.metrics.push({name,error:e.message})}}
 await source.screenshot({path:`output/fidelity/${def.id}-${viewport.width}-source.png`});await local.screenshot({path:`output/fidelity/${def.id}-${viewport.width}-local.png`});report.pairs.push(row);await ctx.close();
 console.log(JSON.stringify(row));
}}finally{await browser.close();await fs.writeFile('tests/fidelity-layout-audit.json',JSON.stringify(report,null,2)+'\n')}

report.failures=report.pairs.flatMap(pair=>pair.metrics.filter(row=>row.error||Object.values(row.delta||{}).some(delta=>Math.abs(delta)>0.1)).map(row=>({page:pair.id,width:pair.viewport.width,...row})));
await fs.writeFile('tests/fidelity-layout-audit.json',JSON.stringify(report,null,2)+'\n');
if(report.failures.length)process.exitCode=1;
