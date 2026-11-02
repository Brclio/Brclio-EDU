import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const gifFrames=new Map();
// Screenshot fixtures alone replace animated GIFs with their decoded first frame.
// Live course data and files remain animated; asset integrity is audited separately.
export async function stabilizeGifFrames(page){
 const sources=await page.locator('img').evaluateAll(imgs=>[...new Set(imgs.map(i=>new URL(i.src,location.href).pathname).filter(s=>s.startsWith('/content/')&&/\.gif$/i.test(s)))]);
 const evidence=[];
 for(const src of sources){
  if(!gifFrames.has(src)){
   const bytes=await fs.readFile('public'+src),frame=await sharp(bytes,{page:0,pages:1}).png().toBuffer();
   gifFrames.set(src,{src,assetSha256:createHash('sha256').update(bytes).digest('hex'),firstFrameSha256:createHash('sha256').update(frame).digest('hex'),data:'data:image/png;base64,'+frame.toString('base64')});
  }
  const {data,...record}=gifFrames.get(src);evidence.push(record);
  await page.evaluate(async({src,data})=>{await Promise.all([...document.images].filter(i=>new URL(i.src,location.href).pathname===src).map(i=>new Promise(resolve=>{i.onload=resolve;i.onerror=resolve;i.src=data})))},{src,data});
 }
 return evidence;
}
