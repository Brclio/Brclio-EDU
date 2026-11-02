import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='output/quiz-visual';await fs.mkdir(out,{recursive:true});
const scriptUrl='https://python2fun.oss-cn-beijing.aliyuncs.com/@quark-app/learn/assets/index-c6fcd669.js';
const cssUrl='https://python2fun.oss-cn-beijing.aliyuncs.com/@quark-app/learn/assets/index-9cef5da8.css';
async function cached(file,url){try{return await fs.readFile(file,'utf8')}catch(error){if(error.code!=='ENOENT')throw error;const response=await fetch(url);if(!response.ok)throw Error(`${url}: ${response.status}`);const body=await response.text();if(body.startsWith('<'))throw Error('Expected source asset, received HTML');await fs.mkdir(file.slice(0,file.lastIndexOf('/')),{recursive:true});await fs.writeFile(file,body);return body}}
const source=await cached('data/source/index-c6fcd669.js',scriptUrl);
const css=await cached('data/source/index-9cef5da8.css',cssUrl);
await fs.writeFile(`${out}/source-solo.css`,css);
// Only replace the public application's final mount. All six original question components,
// their Markdown/Note children, CSS, and React runtime remain verbatim. The wrapper's judge
// uses public answer metadata to expose states without invoking the authenticated server judge.

const marker='$i.extend(cWt);const U$t=';if(!source.includes(marker))throw Error('Original mount anchor changed');
const replacement=`
const visualRoot=JL.createRoot(document.getElementById('root'));
const visualComponents={single_choice:e6t,mult_choice:r6t,type_in:o6t,multi_type_in:i6t,drag_and_drop:a6t,reorder:u6t};
function VisualQuiz({question:q}) {
 const [right,setRight]=N.useState(null),[answer,setAnswer]=N.useState([]);
 const options=q.question_options.map((o,i)=>({...o,key:o.key||String(i)}));
 const expected=options.filter(o=>o.correct||Number(o.match_number)>0).sort((a,b)=>Number(a.match_number)-Number(b.match_number));
 return g.jsx(visualComponents[q.question_type],{title:'测验',content:q.question_text,options,quizAnswer:expected,userAnswer:answer,isRight:right,onPrev:()=>{},onNext:()=>{},onSubmit:async values=>{const norm=a=>a.map(v=>String(v.text).trim());const a=norm(values),b=norm(expected);if(q.question_type==='mult_choice'){a.sort();b.sort()}const correct=JSON.stringify(a)===JSON.stringify(b);setAnswer(values);setRight(correct);return correct;}});
}
window.quizReference={React:N,jsx:g,createRoot:JL.createRoot,refractor:Ee,Markdown:yi,Note:lge,components:visualComponents,render:q=>visualRoot.render(g.jsx(VisualQuiz,{question:q},Math.random()))};
});export default G$t();`;
await fs.writeFile('output/quiz-visual/reference-components.js',source.slice(0,source.indexOf(marker))+replacement);
await fs.writeFile('output/quiz-visual/reference-harness.html','<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/output/quiz-visual/source-solo.css"><style>#root{padding-top:120px}</style></head><body><div id="root"></div><script type="module" src="/output/quiz-visual/reference-components.js"></script></body></html>');

await fs.writeFile(`${out}/reference-provenance.json`,JSON.stringify({preparedAt:new Date().toISOString(),script:{url:scriptUrl,sha256:createHash('sha256').update(source).digest('hex')},css:{url:cssUrl,sha256:createHash('sha256').update(css).digest('hex')},modification:'Replaces final application bootstrap with named original component exports and a public-answer state fixture; does not modify original component implementations.'},null,2)+'\n');
