import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supported = new Set(['MarkdownEditor','Markdown','Text','Note','SpoilerEditor','CanvasImage','Image','MxGraphWidget','Code','TabbedCode','Quiz','QuizRef','QuestionRef','Knowledge','KnowledgeRef','Coach','ChallengeRef','CodeChallengeRef','Columns','JsHtml','RunJS','Graphviz','SequenceDiagrams','CanvasAnimation','EducativeArray','Stack','BinaryTree','Matrix','CanvasText','MxGraph','MarkMap','Video']);
const fillKinds = new Set(['drag_and_drop','typein','type_in','multi_type_in','fill_in','fill_blank']);
const choiceKinds = new Set(['single_choice','mult_choice','multiple_choice','multi_choice']);
const counts = object => Object.fromEntries(Object.entries(object).sort((a,b) => b[1] - a[1]));
const increment = (object, key) => object[key] = (object[key] || 0) + 1;
const snippets = value => String(value || '').slice(0,120);
export async function scan() {
  const report = { generatedAt: new Date().toISOString(), scope: 'all imported lesson pages and standalone challenges', pages: [], challenges: [], componentTypes: {}, questionTypes: {}, codeLanguages: {}, animationFrames: 0, questions: [], codeBlocks: [], issues: [], limitations: ['Static schema coverage does not prove semantic equivalence with the original site.', 'Runnable source code is classified, not executed by this scanner.', 'Current browser runtime supports Python, JavaScript, HTML and SQLite; other languages are separately reported.'] };
  const addIssue = (kind, file, where, details) => report.issues.push({ ...details, kind, file, where });
  function code(data, file, where, componentId, inherited = {}) {
    const language = String(data.language || 'python3').toLowerCase();
    const runtimeSupported = language.startsWith('python') || ['py','javascript','js','nodejs','html','html5','sql','sqlite','sqlite3'].includes(language);
    increment(report.codeLanguages, `${language}:${data.runnable === false ? 'example' : 'runnable'}`);
    const value = { file, where, componentId, language, runnable: data.runnable !== false, runtimeSupported, codeLength: String(data.content ?? data.template ?? '').length, tests: (inherited.testcases || data.testcases || []).length, hasAuthorJudge: Boolean(data.judge_content?.author_code), additionalFiles: (data.additional_content || data.additional_files || []).length };
    report.codeBlocks.push(value);
    if (value.runnable && !runtimeSupported) addIssue('runtime-not-supported',file,where,{language,componentId});
    if (value.runnable && !value.codeLength && !data.judge_content?.author_code) addIssue('empty-code-template',file,where,{language,componentId});
  }
  function question(value, file, where, componentId) {
    const kind = value.question_type || 'single_choice';
    const options = value.question_options || [];
    const text = value.question_text || value.question_text_html || '';
    // Original v6e front-end derives answers by sorting positive match_number values.
    const sortedAnswers=options.filter(option=>Number(option.match_number)>0||option.correct===true).sort((a,b)=>Number(a.match_number)-Number(b.match_number));
    const tokens = kind==='type_in'||kind==='typein' ? ['0'] : [...new Set([...text.matchAll(/__(\d+)__/g)].map(match=>match[1]))];
    if (fillKinds.has(kind) && !tokens.length) sortedAnswers.forEach((_,i)=>tokens.push(String(i)));
    const expected = tokens.map(key => ({key,texts:sortedAnswers[Number(key)] ? [String(sortedAnswers[Number(key)].text ?? '')] : []}));
    const item = { file, where, componentId, questionId: value.question_id, kind, options:options.length, tokens, expected, correctOptions:options.map((o,i)=>o.correct?i:-1).filter(i=>i>=0), textPreview:snippets(text) };
    report.questions.push(item); increment(report.questionTypes,kind);
    if (!fillKinds.has(kind) && !choiceKinds.has(kind) && kind!=='reorder') addIssue('unsupported-question-type',file,where,{kind,componentId});
    if (choiceKinds.has(kind) && !item.correctOptions.length) addIssue('question-has-no-correct-option',file,where,{kind,componentId});
    if (kind==='single_choice' && item.correctOptions.length!==1) addIssue('single-choice-answer-count',file,where,{count:item.correctOptions.length,componentId});
    if (fillKinds.has(kind) && (!tokens.length || expected.some(item=>!item.texts.length))) addIssue('unanswerable-fill',file,where,{kind,componentId,tokens,expected});
    if (kind==='reorder' && options.some((_,i)=>!options.some(option=>Number(option.match_number)===i+1))) addIssue('invalid-reorder-positions',file,where,{componentId});
  }
  function component(node,file,where,ids) {
    const data=node.content || {}, type=node.type, id=String(data.comp_id || node.comp_id || '');
    increment(report.componentTypes,type);
    if (id) { if(ids.has(id))addIssue('duplicate-component-id',file,where,{componentId:id});ids.add(id); }
    if (!supported.has(type)) addIssue('unhandled-component-type',file,where,{type,componentId:id,fields:Object.keys(data)});
    const resolved=node.resolved || data.resolved;
    if (['Knowledge','KnowledgeRef','QuizRef','QuestionRef','Coach','ChallengeRef','CodeChallengeRef'].includes(type) && !resolved) addIssue('unresolved-component',file,where,{type,componentId:id});
    if (['Knowledge','KnowledgeRef'].includes(type) && resolved && !(resolved.knowledges?.length||resolved.components?.length)) addIssue('empty-resolved-knowledge',file,where,{componentId:id,fields:Object.keys(resolved)});
    if (type==='Code') code(data,file,where,id);
    if (type==='TabbedCode') (data.code_contents || data.code_templates || []).forEach((tab,i)=>code(tab,file,`${where}.tabs[${i}]`,tab.comp_id||`${id}:code:${i}`,data));
    if (['Coach','ChallengeRef','CodeChallengeRef'].includes(type) && resolved) challenge(resolved,file,`${where}.resolved`,id);
    if (type==='Quiz') (data.questions||[]).forEach((q,i)=>question(q,file,`${where}.questions[${i}]`,`${id}:${q.question_id||i}`));
    if (['QuizRef','QuestionRef'].includes(type) && resolved) question(resolved,file,`${where}.resolved`,id);
    if (type==='CanvasAnimation') for(const [i,frame] of (data.canvas_objects || data.frames || []).entries()) {
      report.animationFrames++;
      if (!(frame.file||frame.svg_xml||frame.svg_string||frame.components?.length)) addIssue('unrenderable-animation-frame',file,`${where}.frame[${i}]`,{componentId:id,fields:Object.keys(frame)});
    }
    if (type==='Columns' && !Array.isArray(data.comps)) addIssue('missing-column-components',file,where,{componentId:id,fields:Object.keys(data)});
  }
  function challenge(value,file,where,id) {
    const templates=value.code_contents || value.code_templates || [];
    if (!templates.length) addIssue('challenge-without-editor',file,where,{componentId:id,challengeId:value.challenge_id});
    templates.forEach((tab,i)=>code(tab,file,`${where}.tabs[${i}]`,tab.comp_id||`${id}:code:${i}`,value));
  }
  function walk(value,file,where,ids) {
    if (!value || typeof value!=='object') return;
    if (Array.isArray(value)) {value.forEach((item,i)=>walk(item,file,`${where}[${i}]`,ids));return;}
    if (typeof value.type==='string' && value.content && typeof value.content==='object' && !Array.isArray(value.content)) component(value,file,where,ids);
    for (const [key,item] of Object.entries(value)) walk(item,file,`${where}.${key}`,ids);
  }
  for (const filename of (await readdir(path.join(root,'public/content/pages'))).filter(name=>name.endsWith('.json')).sort()) {
    const file=`/content/pages/${filename}`;
    const page=JSON.parse(await readFile(path.join(root,'public',file),'utf8'));
    report.pages.push({file,id:page.id,courseId:page.course_no,title:page.title,components:page.components?.length || 0});
    walk(page,file,'$',new Set());
  }
  for (const filename of (await readdir(path.join(root,'public/content/challenges'))).filter(name=>name.endsWith('.json')).sort()) {
    const file=`/content/challenges/${filename}`, value=JSON.parse(await readFile(path.join(root,'public',file),'utf8'));
    report.challenges.push({file,id:value.challenge_id,title:value.title});challenge(value,file,'$',`challenge-${value.challenge_id}`);
  }
  report.componentTypes=counts(report.componentTypes);report.questionTypes=counts(report.questionTypes);report.codeLanguages=counts(report.codeLanguages);
  report.summary={pages:report.pages.length,standaloneChallenges:report.challenges.length,components:Object.values(report.componentTypes).reduce((a,b)=>a+b,0),questions:report.questions.length,codeBlocks:report.codeBlocks.length,animationFrames:report.animationFrames,issues:counts(report.issues.reduce((out,item)=>(increment(out,item.kind),out),{}))};
  report.sourceComparison=await compareSources([...report.pages,...report.challenges]);
  return report;
}
async function compareSources(jobs) {
  const manifest=JSON.parse(await readFile(path.join(root,'public/content/manifest.json'),'utf8'));
  const mapping=new Map();
  for(const [from,to] of Object.entries(manifest.assets||{})){
    if(/^(https?:)?\/\//.test(from)){mapping.set(from,to);if(from.startsWith('//'))mapping.set('https:'+from,to);}
    if(from.startsWith('fixture:http'))mapping.set(from.slice(8),to);
  }
  for(const recovery of manifest.recoveries||[])for(const from of recovery.originals||[])mapping.set(from,recovery.path);
  const attachmentIndex=JSON.parse(await readFile(path.join(root,'public/content/attachment-index.json'),'utf8'));
  const auto=Object.entries(attachmentIndex.files||{}).find(([,entry])=>entry.file_name==='auto-mpg.data');
  if(auto)mapping.set('http://archive.ics.uci.edu/ml/machine-learning-databases/auto-mpg/auto-mpg.data',auto[0]);
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const urlPattern=new RegExp([...mapping.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|'),'g');
  const localize=value=>value.replace(urlPattern,found=>mapping.get(found)).replace(/https?:\/\/edu\.py2fun\.com\/(?:learn#\/)?course\/([^/]+)\/page\/(\d+)/g,'#/course/$1/page/$2').replace(/https?:\/\/edu\.py2fun\.com\/(?:learn#\/)?course\/([^/]+)\/(?:catalog|overviewn?)/g,'#/course/$1/catalog');
  const svgShape=value=>String(value).replace(/((?:xlink:)?href|src)=("[^"]*"|'[^']*')/g,'$1="RESOURCE"');
  const cache=new Map(),seenRefs=new Set();
  const result={pages:0,challenges:0,resolvedReferences:0,referenceInstances:0,scalarFieldsCompared:0,unchangedFields:0,localizedFields:0,verifiedFrameExternalizations:0,issues:[]};
  const get=async relative=>{if(!cache.has(relative))cache.set(relative,JSON.parse(await readFile(path.join(root,'data/source/api',relative),'utf8')));return cache.get(relative);};
  async function compare(raw,final,file,where){
    if(raw===null||typeof raw!=='object'){
      result.scalarFieldsCompared++;
      if(raw===final){result.unchangedFields++;return;}
      if(typeof raw==='string'&&typeof final==='string'){
        if(localize(raw)===localize(final) || (raw.includes('<svg')&&svgShape(localize(raw))===svgShape(localize(final)))){result.localizedFields++;return;}
      }
      result.issues.push({file,where,kind:final===undefined?'missing-source-field':'changed-source-field',sourcePreview:snippets(raw),finalPreview:snippets(final)});return;
    }
    if(Array.isArray(raw)){
      if(!Array.isArray(final)||raw.length!==final.length){result.issues.push({file,where,kind:'source-array-length',source:raw.length,final:final?.length});return;}
      for(let i=0;i<raw.length;i++)await compare(raw[i],final[i],file,`${where}[${i}]`);return;
    }
    if(!final||typeof final!=='object'){result.issues.push({file,where,kind:'missing-source-object'});return;}
    let externalized=false;
    if(raw.canvas_json && (raw.svg_xml||raw.svg_string) && final.file?.startsWith('/content/assets/')){
      const svg=await readFile(path.join(root,'public',final.file),'utf8');
      externalized=svgShape(localize(raw.svg_xml||raw.svg_string))===svgShape(svg);
      if(externalized)result.verifiedFrameExternalizations++;
      else result.issues.push({file,where,kind:'frame-externalization-shape-diff',asset:final.file});
    }
    for(const [key,value] of Object.entries(raw)){
      if(externalized&&['svg_xml','svg_string','file'].includes(key))continue;
      await compare(value,final[key],file,`${where}.${key}`);
    }
    const type=raw.type,data=raw.content;
    if(data&&typeof data==='object'){
      let ref;
      if(['QuizRef','QuestionRef'].includes(type))ref=`api--challenge--quiz--v2--${data.question_id}.json`;
      if(['Knowledge','KnowledgeRef'].includes(type))ref=`api--knowledge--${data.knowledge_id}.json`;
      if(['Coach','ChallengeRef','CodeChallengeRef'].includes(type))ref=`api--challenge--code--${data.challenge_id}.json`;
      if(ref){
        if(!seenRefs.has(ref))result.resolvedReferences++;seenRefs.add(ref);result.referenceInstances++;
        try{await compare(await get(ref),final.resolved||data.resolved,file,`${where}.resolved`);}catch(error){result.issues.push({file,where,kind:'reference-cache-unavailable',ref,message:error.message});}
      }
    }
  }
  for(const job of jobs){
    const filename=job.file.split('/').at(-1),challenge=job.file.includes('/challenges/');
    const cacheName=challenge?`api--challenge--code--${filename}`:`api--course--${filename.replace('-','--page--')}`;
    try{if(challenge)seenRefs.add(cacheName);const raw=await get(cacheName),final=JSON.parse(await readFile(path.join(root,'public',job.file),'utf8'));await compare(raw,final,job.file,'$');result[challenge?'challenges':'pages']++;}
    catch(error){result.issues.push({file:job.file,kind:'source-cache-unavailable',cacheName,message:error.message});}
  }
  result.totalReferenceResources=seenRefs.size;
  return result;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const report=await scan();
  await writeFile(path.join(root,'tests/browser-audit-schema.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary,null,2));
}
