import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const pkg=JSON.parse(await readFile(path.join(root,'node_modules/monaco-editor/package.json'),'utf8'));
if(pkg.version!=='0.34.0')throw Error('Original site uses Monaco 0.34.0; refusing another version');
const dest=path.join(root,'public/runtime/monaco');
await mkdir(dest,{recursive:true});await cp(path.join(root,'node_modules/monaco-editor/min/vs'),path.join(dest,'vs'),{recursive:true});
await cp(path.join(root,'node_modules/monaco-editor/LICENSE'),path.join(dest,'LICENSE'));
const files=[];
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else{const content=await readFile(file);files.push({path:path.relative(dest,file),bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});}}}
await walk(path.join(dest,'vs'));files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(path.join(dest,'manifest.json'),JSON.stringify({version:pkg.version,originalEntry:'https://python2fun.oss-cn-beijing.aliyuncs.com/@quark-app/learn/vs/editor/editor.main.js',originalEntrySha256:'4d54c8adae6f8fba4d68d25fe0cc0c307afe30e7bb69ed37ede53a8653556085',files},null,2)+'\n');
console.log(`Monaco ${pkg.version}: ${files.length} local files`);
