import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5173',out='output/editor-web-header-final';await fs.mkdir(out,{recursive:true});
const reference='output/editor-visual/web-workspace-source.png',historical='output/editor-visual/report.json';
const hash=async f=>createHash('sha256').update(await fs.readFile(f)).digest('hex');
const files=['src/content-workspace.css','src/Content.tsx','src/styles.css','src/solo-fidelity.css'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,await hash(f)])));
const stat=await fs.stat(reference),report={startedAt:new Date().toISOString(),sourceReference:{path:reference,sha256:await hash(reference),captureFileModifiedAt:stat.mtime.toISOString(),captureTimeBasis:'Existing raw source PNG filesystem mtime; screenshot does not embed a timestamp.',sourceURL:'https://edu.py2fun.com/learn#/course/022/page/1177',viewport:{width:1280,height:900},deviceScaleFactor:1,crop:{left:0,top:0,width:1280,height:60}},historicalMainReportHashBefore:await hash(historical),sourceFilesBefore:await hashes(),errors:[]};
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1}),page=await context.newPage();
try{
 await page.goto(base+'/#/course/022/page/1177',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'尝试一下',exact:true}).first().click();await page.locator('.edu-web-workspace-body [data-editor-ready=true]').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.mouse.move(500,800);
 const header=page.locator('.edu-code-workspace .edu-workspace-header');
 report.local=await header.evaluate(el=>{const s=getComputedStyle(el),title=el.querySelector(':scope>span'),t=getComputedStyle(title);return{header:el.getBoundingClientRect().toJSON(),title:{text:title.textContent,rect:title.getBoundingClientRect().toJSON(),height:t.height,font:t.font,lineHeight:t.lineHeight,color:t.color},border:s.border,padding:s.padding}});
 assert.equal(report.local.title.height,'24px');assert.equal(report.local.title.text,'尝试一下');assert.equal(report.local.header.width,1280);assert.equal(report.local.header.height,60);
 await header.screenshot({path:out+'/header-local.png',animations:'disabled'});await sharp(reference).extract(report.sourceReference.crop).png().toFile(out+'/header-source.png');
 const titleCrop={left:49,top:12,width:110,height:34};await sharp(out+'/header-source.png').extract(titleCrop).png().toFile(out+'/title-source.png');await sharp(out+'/header-local.png').extract(titleCrop).png().toFile(out+'/title-local.png');
 report.comparisons=[];
 for(const name of ['header','title']){
  const a=await sharp(out+'/'+name+'-source.png').removeAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(out+'/'+name+'-local.png').removeAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual(a.info,b.info);const diff=Buffer.alloc(a.data.length);let changedPixels=0,over8=0,over20=0,sum=0,max=0;let box=[a.info.width,a.info.height,-1,-1];for(let i=0;i<a.data.length;i+=3){const ds=[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[i+c]));ds.forEach((n,c)=>{diff[i+c]=n;sum+=n;max=Math.max(max,n)});const d=Math.max(...ds);if(d){changedPixels++;const n=i/3,x=n%a.info.width,y=Math.floor(n/a.info.width);box=[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y)];}if(d>8)over8++;if(d>20)over20++;}
  await sharp(diff,{raw:a.info}).png().toFile(out+'/'+name+'-diff.png');await sharp({create:{width:a.info.width*2,height:a.info.height,channels:3,background:'#fff'}}).composite([{input:out+'/'+name+'-source.png',left:0,top:0},{input:out+'/'+name+'-local.png',left:a.info.width,top:0}]).png().toFile(out+'/'+name+'-compare.png');report.comparisons.push({name,width:a.info.width,height:a.info.height,changedPixels,over8,over20,maximumChannelDifference:max,meanAbsoluteChannelDifference:sum/a.data.length,differenceBounds:changedPixels?box:null});
 }
 assert.equal(report.comparisons.find(r=>r.name==='title').changedPixels,0,'The last 24px title change must match the retained original screenshot exactly');
}catch(error){report.errors.push(error.stack);process.exitCode=1}finally{await browser.close();report.finishedAt=new Date().toISOString();report.sourceReference.sha256After=await hash(reference);report.historicalMainReportHashAfter=await hash(historical);report.sourceFilesAfter=await hashes();report.changedFiles=files.filter(f=>report.sourceFilesBefore[f]!==report.sourceFilesAfter[f]);assert.equal(report.sourceReference.sha256,report.sourceReference.sha256After);assert.equal(report.historicalMainReportHashBefore,report.historicalMainReportHashAfter);assert.deepEqual(report.changedFiles,[]);await fs.writeFile('tests/web-header-final-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
