import fs from 'node:fs/promises';
import {visualInventory} from '../scripts/course-visual-inventory.mjs';
import {command,evaluate,wait} from './catalog-visual-review.mjs';
const directory='output/image-inventory-review';await fs.mkdir(directory,{recursive:true});
const source=await fs.readFile('data/source/index-c6fcd669.js','utf8'),anchor='$i.extend(cWt);const U$t=';
if(!source.includes(anchor))throw Error('Original solo bundle mount changed');
await fs.writeFile(`${directory}/solo-components.js`,source.slice(0,source.indexOf(anchor))+`const visualRoot=JL.createRoot(document.getElementById('root'));window.renderSoloImages=items=>visualRoot.render(g.jsx('div',{style:{width:638,margin:'32px auto'},children:items.map((c,i)=>g.jsx('div',{'data-image-index':i,children:g.jsx(H5t,{src:c.content.file,width:c.content.metadata?.width})},Math.random()))}));});export default G$t();`);
await fs.writeFile(`${directory}/solo.html`,'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/output/quiz-visual/source-solo.css"><div id="root"></div><script type="module" src="solo-components.js"></script>');
const items=(await visualInventory()).filter(i=>i.type==='Image');
const sessions={article:'visual-all-article-images',solo:'visual-all-solo-images',local:'visual-all-local-images'};
for(const [side,url]of Object.entries({article:'/output/article-reference/index.html',solo:`/${directory}/solo.html`,local:'/tests/visual-content-harness.html'})){command(sessions[side],'open',`http://127.0.0.1:5173${url}`);command(sessions[side],'set','viewport','1280','900');}
const rows=[];
const probe=`(()=>[...document.querySelectorAll('#root img')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{src:e.getAttribute('src'),loaded:e.complete&&e.naturalWidth>0,natural:[e.naturalWidth,e.naturalHeight],rect:[r.width,r.height],border:[s.borderTopWidth,s.borderTopColor,s.borderTopStyle],display:s.display}}))()`;
for(const mode of ['article','solo']){
 const all=items.filter(i=>i.mode===mode);
 for(let start=0;start<all.length;start+=75){
  const batch=all.slice(start,start+75),components=batch.map(i=>i.component),sides={};
  for(const side of ['source','local']){
   const session=sessions[side==='source'?mode:'local'];command(session,'tab','t1');
   if(side==='local')evaluate(session,`renderVisualContent(${JSON.stringify(components)},${JSON.stringify(mode)});true`);
   else evaluate(session,`${mode==='article'?'renderArticleReference':'renderSoloImages'}(${JSON.stringify(components)});true`);
   wait(session,`document.querySelectorAll('#root img').length===${batch.length}`);
   evaluate(session,`[...document.querySelectorAll('#root img')].forEach(e=>e.loading='eager');true`);
   wait(session,`[...document.querySelectorAll('#root img')].every(e=>e.complete)&&document.fonts.status==='loaded'`);
   sides[side]=evaluate(session,probe);
  }
  batch.forEach((item,index)=>{const a=sides.source[index],b=sides.local[index];rows.push({file:item.file,path:item.path,mode,width:item.content.metadata?.width??null,height:item.content.metadata?.height??null,source:a,local:b,pass:a.loaded&&b.loaded&&JSON.stringify(a.natural)===JSON.stringify(b.natural)&&a.rect.every((n,j)=>Math.abs(n-b.rect[j])<.02)&&JSON.stringify(a.border)===JSON.stringify(b.border)});});
  console.log(JSON.stringify({mode,start,count:batch.length,failed:rows.filter(r=>!r.pass).length}));
 }
}
const report={at:new Date().toISOString(),viewport:[1280,900],reference:'Original article Nc and solo H5t components, rendered from original bundles and styles at the corresponding 960px / 638px content width.',count:rows.length,failed:rows.filter(r=>!r.pass).length,missingMetadata:rows.filter(r=>!r.width).map(r=>({file:r.file,path:r.path,mode:r.mode})),rows};
await fs.writeFile(`${directory}/audit.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({count:report.count,failed:report.failed,missingMetadata:report.missingMetadata.length}));if(report.failed)process.exitCode=1;
