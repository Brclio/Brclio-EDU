import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const root=process.cwd(), audit=JSON.parse(await fs.readFile('tests/animation-data-audit.json','utf8'));
const tasks=audit.animations.flatMap(a=>a.frames.map(f=>({...f,page:a.page,animation_id:a.animation_id,key:`${a.page}-${a.animation_id}-${f.index}`})));
const publicRoot=path.join(root,'public');
const server=http.createServer(async(req,res)=>{
 const file=path.resolve(publicRoot,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(publicRoot+path.sep)){res.writeHead(403).end();return;}
 try{const stat=await fs.stat(file);res.writeHead(200,{'content-type':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream','content-length':stat.size});createReadStream(file).pipe(res);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const baseURL=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const results=[];let cursor=0;
await Promise.all(Array.from({length:4},async()=>{
 const page=await browser.newPage({viewport:{width:600,height:400},deviceScaleFactor:1});
 await page.setContent('<html><head><style>html,body{margin:0;width:600px;height:400px;background:white;overflow:hidden}img{display:block;width:600px;height:400px;object-fit:contain}</style></head><body><img id="frame"></body></html>');
 while(cursor<tasks.length){
  const t=tasks[cursor++];
  try{
   const dimensions=await page.evaluate(async url=>{const img=document.querySelector('#frame');img.src=url;await img.decode();await document.fonts.ready;return {width:img.naturalWidth,height:img.naturalHeight}},baseURL+t.actual_path);
   const screenshot=`data/source/animation-renderings/${t.key}.png`;
   await page.locator('#frame').screenshot({path:screenshot,animations:'disabled'});
   results.push({key:t.key,page:t.page,animation_id:t.animation_id,index:t.index,file:t.actual_path,source_model_sha256:t.source_model_sha256,expected_sha256:t.expected_sha256,dimensions,screenshot});
  }catch(e){results.push({key:t.key,error:e.message});}
  if(results.length%100===0)process.stdout.write(`Rendered ${results.length}/${tasks.length}\n`);
 }
 await page.close();
}));
const report={browser:browser.version(),viewport:{width:600,height:400},frames:results.sort((a,b)=>a.key.localeCompare(b.key))};
await fs.writeFile('tests/animation-rendering-audit.json',JSON.stringify(report,null,2)+'\n');
await browser.close();
await new Promise(resolve=>server.close(resolve));
console.log(JSON.stringify({rendered:results.length,errors:results.filter(x=>x.error).length}));
