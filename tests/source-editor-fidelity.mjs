import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readCode, replaceCode, editorReadOnly } from './editor-helper.mjs';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5173';
const report={startedAt:new Date().toISOString(),checks:[],errors:[],externalRequests:[],runtimeRequests:[]};
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});
await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base)||/^(data:|blob:)/.test(url))return route.continue();report.externalRequests.push(url);return route.abort();});
page.on('request',r=>{if(r.url().includes('/runtime/monaco/'))report.runtimeRequests.push(r.url().slice(base.length));});
page.on('pageerror',e=>report.errors.push(e.message));
try{
 const manifest=JSON.parse(await readFile('public/runtime/monaco/manifest.json','utf8'));
 for(const file of manifest.files){const data=await readFile('public/runtime/monaco/'+file.path);assert.equal(data.length,file.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256);}
 assert.equal(manifest.files.find(f=>f.path==='vs/editor/editor.main.js').sha256,manifest.originalEntrySha256);
 report.checks.push({name:'111 local Monaco assets match the pinned package; entry matches observed source bytes',files:manifest.files.length});
 await page.goto(base+'/#/course/015/page/937');const source=page.locator('.edu-solo-code').first();assert.equal(await editorReadOnly(source),true);
 const original=await readCode(source);await source.locator('.edu-source-editor').evaluate(e=>e.eduEditor.focus());await page.keyboard.insertText('blocked');assert.equal(await readCode(source),original);
 await source.getByRole('button',{name:'尝试一下',exact:true}).click();const dialog=page.getByRole('dialog',{name:'代码练习',exact:true});await dialog.waitFor();
 await replaceCode(dialog,'if True:\n    print("keyboard")');
 const options=await dialog.locator('.edu-source-editor').evaluate(e=>e.eduEditor.getRawOptions());assert.equal(options.fontSize,16);assert.equal(options.minimap.enabled,false);assert.equal(options.scrollBeyondLastLine,false);
 await page.keyboard.press(process.platform==='darwin'?'Meta+Z':'Control+Z');assert.equal(await readCode(dialog),original);
 await page.keyboard.press(process.platform==='darwin'?'Meta+Shift+Z':'Control+Y');assert.equal(await readCode(dialog),'if True:\n    print("keyboard")');
 await page.keyboard.press(process.platform==='darwin'?'Meta+F':'Control+F');await dialog.locator('.find-widget.visible').waitFor();await page.keyboard.press('Escape');await dialog.locator('.find-widget.visible').waitFor({state:'hidden'});assert.equal(await dialog.count(),1);
 await dialog.getByRole('button',{name:'关闭代码练习',exact:true}).click();await dialog.waitFor({state:'detached'});
 report.checks.push({name:'Monaco original options, read-only source, native undo/redo/find, Escape dismisses find without closing workspace',options});
 await page.goto(base+'/#/course/004/page/117');const block=page.locator('.edu-code-block').first();await block.locator('.CodeMirror').waitFor();const article=await block.locator('.CodeMirror').evaluate(e=>({version:e.CodeMirror.constructor.version,options:{theme:e.CodeMirror.getOption('theme'),lineNumbers:e.CodeMirror.getOption('lineNumbers'),mode:e.CodeMirror.getOption('mode'),styleSelectedText:e.CodeMirror.getOption('styleSelectedText')},height:e.getBoundingClientRect().height}));
 assert.equal(article.version,'5.65.3');assert.deepEqual(article.options,{theme:'monokai',lineNumbers:true,mode:'python',styleSelectedText:true});assert.equal(article.height,159);
 const longCode=page.locator('.edu-code-block').nth(5);const longHeight=await longCode.boundingBox();assert.equal(longHeight.height,775);const scrolled=await longCode.locator('.edu-source-editor').evaluate(e=>{e.scrollTop=e.scrollHeight;return {height:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop};});assert.equal(scrolled.height,720);assert.ok(scrolled.scrollTop>0);report.checks.push({name:'long article code retains source 720px scrolling viewport and 775px total block',...scrolled});
 const articleSource=await readCode(block);await replaceCode(block,'print("history")');await page.keyboard.press(process.platform==='darwin'?'Meta+Z':'Control+Z');assert.equal(await readCode(block),articleSource);report.checks.push({name:'CodeMirror exact version/options/159px source height and native undo',...article});
 await page.goto(base+'/#/course/022/page/1177');const webSource=page.locator('.edu-solo-code').first();await readCode(webSource);await webSource.getByRole('button',{name:'尝试一下'}).click();const web=page.getByRole('dialog',{name:'网页代码练习'});await readCode(web.getByRole('region',{name:'JS 编辑器'}));
 const worker=await page.evaluate(async()=>{const models=window.monaco.editor.getModels();const js=models.find(m=>m.getLanguageId()==='javascript');const accessor=await window.monaco.languages.typescript.getJavaScriptWorker();const client=await accessor(js.uri);return {semantic:(await client.getSemanticDiagnostics(js.uri.toString())).length,syntactic:(await client.getSyntacticDiagnostics(js.uri.toString())).length};});
 assert.equal(worker.syntactic,0);assert.ok(report.runtimeRequests.some(url=>url.includes('/language/typescript/tsWorker.js')));report.checks.push({name:'real JavaScript language worker loads locally and returns syntax diagnostics',...worker});
 assert.equal(report.externalRequests.length,0);assert.equal(report.errors.length,0);
}catch(error){report.errors.push(error.stack||String(error));process.exitCode=1;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('tests/source-editor-fidelity.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
