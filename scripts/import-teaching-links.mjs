/** Localize links to the two archived teaching HTML fixtures, preserving labels and code. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),out=path.join(root,'public/content');
const map=JSON.parse(await fs.readFile(path.join(out,'fixture-map.json'),'utf8'));
const targets=Object.fromEntries(['http://api.pythontip.com/course/hello_html','http://api.pythontip.com/course/fake_baidu'].map(url=>[url,map[url]?.path]).filter(([,local])=>local));
const parser=unified().use(remarkParse).use(remarkGfm),fields=new Set(['text','text_html','question_text','question_text_html','md_text','md_html']),changes=[];
const sha=s=>createHash('sha256').update(s).digest('hex');
function transform(text,file,trail){
 const edits=[];function walk(node){
  const start=node.position?.start.offset,end=node.position?.end.offset;
  if(start!=null&&end!=null&&['link','definition'].includes(node.type)&&targets[node.url]){
   const raw=text.slice(start,end),at=raw.lastIndexOf(node.url);let replacement;
   if(raw.startsWith('[')&&at>=0)replacement=raw.slice(0,at)+targets[node.url]+raw.slice(at+node.url.length);
   else replacement=`[${node.url}](${targets[node.url]})`;
   edits.push({start,end,replacement,url:node.url,local:targets[node.url]});return;
  }
  if(start!=null&&end!=null&&node.type==='html'){
   const raw=text.slice(start,end);let replaced=raw;
   for(const[url,local]of Object.entries(targets))replaced=replaced.replace(/(<a\b[^>]*?\bhref\s*=\s*)(["'])([^"']*)(\2)/gi,(match,prefix,quote,href)=>href===url?prefix+quote+local+quote:match);
   if(raw!==replaced)edits.push({start,end,replacement:replaced,htmlLinks:true});
  }
  node.children?.forEach(walk);
 }walk(parser.parse(text));
 let result=text;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.replacement+result.slice(edit.end);
 if(result!==text)changes.push({file,trail,sourceSha256:sha(text),localizedSha256:sha(result),edits:edits.map(({start,end,replacement,...e})=>e)});
 return result;
}
function walk(value,file,trail=''){
 if(Array.isArray(value))return value.map((x,i)=>walk(x,file,trail+'/'+i));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,x])=>[key,typeof x==='string'&&fields.has(key)?transform(x,file,trail+'/'+key):walk(x,file,trail+'/'+key)]));
 return value;
}
for(const group of ['pages','challenges'])for(const name of(await fs.readdir(path.join(out,group))).filter(n=>n.endsWith('.json')).sort()){
 const file=group+'/'+name,p=path.join(out,file),original=await fs.readFile(p,'utf8'),before=changes.length,updated=JSON.stringify(walk(JSON.parse(original),file))+'\n';if(changes.length!==before)await fs.writeFile(p,updated);
}
const report={generatedAt:new Date().toISOString(),targets,changes,changedFiles:new Set(changes.map(r=>r.file)).size,notes:['Only actual Markdown links, definitions and HTML anchor hrefs are changed. Fenced code, inline code, original URL labels and other reference links remain untouched.','hello_html is explicitly reconstructed; fake_baidu is exported from the complete original lesson HTML.']};
// Keep the original mapping evidence when a maintenance rerun is a no-op.
const reportFile=path.join(out,'teaching-link-audit.json');if(changes.length||!await fs.access(reportFile).then(()=>true,()=>false))await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({changedFiles:report.changedFiles,changedFields:changes.length}));
