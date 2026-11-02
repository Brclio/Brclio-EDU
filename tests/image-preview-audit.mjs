import fs from 'node:fs/promises';
import sharp from 'sharp';
import { command, evaluate, wait } from './catalog-visual-review.mjs';
const output = 'output/image-preview-review';
await fs.mkdir(output,{recursive:true});
const sessions = {source:'visual-image-source',local:'visual-image-local'};
const selectors = {
  source:{trigger:'.ant-image',image:'.ant-image-preview-img',wrapper:'.ant-image-preview-img-wrapper',wrap:'.ant-image-preview-wrap',tools:'.ant-image-preview-operations',button:n=>`.ant-image-preview-operations-operation:nth-child(${n})`},
  local:{trigger:'.article-preview-trigger',image:'.article-image-preview-image',wrapper:'.article-image-preview-image-wrapper',wrap:'.article-image-preview-wrap',tools:'.article-image-preview-operations',button:n=>`.article-image-preview-operations li:nth-child(${n}) button`},
};
const comparisons=[], checks=[];
command(sessions.source,'open','http://127.0.0.1:5173/output/article-reference/index.html');
command(sessions.local,'open','http://127.0.0.1:5173/tests/image-preview-harness.html');
wait(sessions.source,`typeof window.renderArticleReference==='function'`);wait(sessions.local,`typeof window.renderLocalImagePreview==='function'`);
function ready(side) { const s=sessions[side];command(s,'tab','t1');wait(s,`document.fonts.status==='loaded' && document.getAnimations().every(a=>a.playState==='finished')`); }
function open(side) {const s=sessions[side],q=selectors[side];ready(side);command(s,'click',q.trigger);ready(side);}
function isOpen(side){return evaluate(sessions[side],`(()=>{const e=document.querySelector(${JSON.stringify(selectors[side].wrap)});return !!e&&getComputedStyle(e).display!=='none'})()`);}
function state(side){const q=selectors[side];return evaluate(sessions[side],`(()=>{const e=document.querySelector(${JSON.stringify(q.image)}),w=document.querySelector(${JSON.stringify(q.wrapper)}),r=e.getBoundingClientRect();return{image:e.style.transform,position:w.style.transform,rect:[r.x,r.y,r.width,r.height],disabled:${side==='source'?`document.querySelector(${JSON.stringify(q.button(3))}).className.includes('disabled')`:`document.querySelector(${JSON.stringify(q.button(3))}).disabled`}}})()`);}
function equal(name){const source=state('source'),local=state('local');checks.push({name,source,local,pass:source.rect.every((n,i)=>Math.abs(n-local.rect[i])<.02)&&source.disabled===local.disabled});}
async function pair(name,selectorKey='wrap') {
  const result={name};
  for(const side of ['source','local']){ready(side);const s=sessions[side],selector=selectors[side][selectorKey];const box=evaluate(s,`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);const path=`${output}/${name}-${side}.png`;command(s,'screenshot',path);if(selectorKey!=='wrap')await sharp(path).extract({left:Math.round(box.x),top:Math.round(box.y),width:Math.round(box.width),height:Math.round(box.height)}).png().toFile(`${output}/crop-${name}-${side}.png`);result[side]={box,path:selectorKey==='wrap'?path:`${output}/crop-${name}-${side}.png`};}
  const [a,b]=await Promise.all(['source','local'].map(side=>sharp(result[side].path).ensureAlpha().raw().toBuffer({resolveWithObject:true})));
  if(a.info.width===b.info.width&&a.info.height===b.info.height){let changed=0;for(let i=0;i<a.data.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[i+c])))>8)changed++;result.changedOver8=changed;result.pixels=a.info.width*a.info.height;}else result.dimensionsDiffer=true;
  comparisons.push(result);console.log(JSON.stringify({name,changed:result.changedOver8,dimensionsDiffer:result.dimensionsDiffer}));
}
function act(action){for(const side of ['source','local']){ready(side);action(side,sessions[side],selectors[side]);ready(side);}}
for(const side of ['source','local']){command(sessions[side],'set','viewport','1280','900');if(isOpen(side)){command(sessions[side],'press','Escape');ready(side);}}
const fixture={src:'/content/assets/515e10c5eae4b6a80984.png',width:500,hasBorder:false};
evaluate(sessions.source,`renderArticleReference([{type:'Image',content:{file:${JSON.stringify(fixture.src)},metadata:{width:500},has_border:false}}]);true`);
evaluate(sessions.local,`renderLocalImagePreview(${JSON.stringify(fixture)});true`);
act((side,s)=>command(s,'mouse','move','10','800'));
await pair('thumbnail','trigger');
act((side,s,q)=>command(s,'hover',q.trigger));await pair('thumbnail-hover','trigger');
for(const side of ['source','local'])open(side);
equal('initial');await pair('initial');await pair('toolbar-disabled','tools');
act((side,s,q)=>command(s,'click',q.button(2)));equal('zoom-two');await pair('zoom-two');
act((side,s,q)=>command(s,'click',q.button(2)));equal('zoom-three');
act((side,s,q)=>command(s,'click',q.button(4)));equal('rotate-right');await pair('rotate-right');
act((side,s,q)=>command(s,'dblclick',q.image));equal('doubleclick-reset-retains-rotation');
act((side,s,q)=>command(s,'click',q.button(5)));equal('rotate-left');
act((side,s)=>command(s,'mouse','wheel','-100'));equal('wheel-up');
act((side,s)=>command(s,'mouse','wheel','100'));equal('wheel-down');
act((side,s)=>{command(s,'mouse','move','640','445');command(s,'mouse','down');command(s,'mouse','move','940','645');command(s,'mouse','up');});equal('drag-fitting-image-resets');
act((side,s,q)=>{for(let i=0;i<3;i++)command(s,'click',q.button(2));});equal('zoom-four');
act((side,s)=>{command(s,'mouse','move','640','445');command(s,'mouse','down');command(s,'mouse','move','1240','845');command(s,'mouse','up');});equal('drag-large-positive-clamp');await pair('drag-large-positive-clamp');
act((side,s)=>{command(s,'mouse','move','640','445');command(s,'mouse','down');command(s,'mouse','move','40','85');command(s,'mouse','up');});equal('drag-large-negative-clamp');
act((side,s,q)=>command(s,'click',q.button(1)));checks.push({name:'close-button',pass:!isOpen('source')&&!isOpen('local')});
for(const side of ['source','local'])open(side);equal('reopen-resets');
act((side,s)=>command(s,'press','Escape'));checks.push({name:'escape',pass:!isOpen('source')&&!isOpen('local')});
for(const side of ['source','local'])open(side);
act((side,s)=>{command(s,'mouse','move','10','800');command(s,'mouse','down');command(s,'mouse','up');});checks.push({name:'background-close',pass:!isOpen('source')&&!isOpen('local')});
command(sessions.local,'focus',selectors.local.trigger);command(sessions.local,'press','Enter');ready('local');checks.push({name:'local-keyboard-open',pass:isOpen('local')});command(sessions.local,'press','Escape');ready('local');checks.push({name:'local-focus-restored',pass:evaluate(sessions.local,`document.activeElement===document.querySelector('.article-preview-trigger')`)});
await fs.writeFile(`${output}/audit.json`,JSON.stringify({at:new Date().toISOString(),reference:'Original public Ant Image component rendered from unmodified source bundle and styles; real browser mouse/keyboard actions.',checks,comparisons},null,2)+'\n');
await fs.writeFile(`${output}/index.html`,`<!doctype html><meta charset="utf-8"><title>图片预览对照</title><style>body{font:16px system-ui}section{border-top:1px solid #ddd}section>div{display:flex}img{max-width:49vw}</style><h1>原版组件 / 本地图片预览</h1>${comparisons.map(r=>`<section><h2>${r.name} — differing pixels &gt;8: ${r.changedOver8}</h2><div><img src="${r.source.path.split('/').pop()}"><img src="${r.local.path.split('/').pop()}"></div></section>`).join('')}`);
if(checks.some(x=>!x.pass)||comparisons.some(x=>x.dimensionsDiffer||x.changedOver8))process.exitCode=1;
console.log(JSON.stringify({checks:checks.length,failed:checks.filter(x=>!x.pass),comparisons:comparisons.length}));
