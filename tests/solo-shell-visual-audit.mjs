import sharp from'sharp';import fs from'node:fs/promises';import{command,evaluate,wait}from'./catalog-visual-review.mjs';
const out='output/reader-shell-visual';
const sessions={source:'root-solo',local:'visual-shell-local'};
command(sessions.local,'tab','t1');if(!evaluate(sessions.local,`!!document.querySelector('.lesson-header')`)){command(sessions.local,'open','http://127.0.0.1:5173/#/course/015/page/936');command(sessions.local,'wait','.lesson-header')}
if(evaluate(sessions.local,`!!document.querySelector('.edu-quiz')`))evaluate(sessions.local,`document.querySelector('.lesson-footer .previous').click();true`);
command(sessions.source,'tab','t1');if(evaluate(sessions.source,`!!document.querySelector('[class*=questionRenderer]')`))evaluate(sessions.source,`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='返回').click();true`);
for(const[side,s]of Object.entries(sessions)){command(s,'tab','t1');command(s,'set','viewport','1280','900');wait(s,`document.fonts.status==='loaded'&&document.getAnimations().every(a=>a.playState==='finished'||a.effect?.getTiming().iterations===Infinity)`);command(s,'mouse','move','0','120');command(s,'screenshot',`${out}/solo-back-${side}-viewport.png`);await sharp(`${out}/solo-back-${side}-viewport.png`).extract({left:0,top:0,width:1280,height:120}).png().toFile(`${out}/solo-header-${side}.png`)}
const[a,b]=await Promise.all(['source','local'].map(s=>sharp(`${out}/solo-header-${s}.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true})));let changed=0;for(let i=0;i<a.data.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[i+c])))>8)changed++;await fs.writeFile(out+'/solo-header.json',JSON.stringify({at:new Date().toISOString(),changedOver8:changed}));console.log({changed});

if(changed)process.exitCode=1;
