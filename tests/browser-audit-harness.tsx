import React, { Component as ReactComponent, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Content from '../src/Content';

const root = createRoot(document.getElementById('root')!);
const errors: string[] = [];
class Boundary extends ReactComponent<{children:React.ReactNode},{error:string}> {
  state={error:''};
  static getDerivedStateFromError(error:Error){return {error:error.message};}
  componentDidCatch(error:Error){errors.push(error.stack||error.message);}
  render(){return this.state.error?<pre data-audit-error>{this.state.error}</pre>:this.props.children;}
}
function Page({data,mode='article'}:{data:any;mode?:'solo'|'article'}) {
  const[answers,setAnswers]=useState<Record<string,any>>({});
  return <><h1>{data.title}</h1>{data.components.map((component:any,index:number)=><section key={index} data-audit-component={component.content?.comp_id||`${component.type}-${index}`} data-audit-type={component.type}><Content mode={mode} components={[component]} answers={answers} onAnswer={(id,value)=>setAnswers(previous=>({...previous,[id]:value}))}/></section>)}</>;
}
const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
(window as any).contentAudit={
  async render(file:string,mode?:'solo'|'article',singleQuestionId?:number){
    if(!mode){const catalog=await (await fetch('/content/catalog.json')).json();const no=file.match(/pages\/(\d+)-/)?.[1];mode=catalog.courses.find((course:any)=>course.course_no===no)?.is_educative?'article':'solo';}
    errors.length=0;
    const response=await fetch(file);if(!response.ok)throw Error(`Page fetch ${response.status}: ${file}`);
    let data=await response.json();
    if(file.includes('/challenges/'))data={title:data.title,components:[{type:'ChallengeRef',content:{comp_id:`challenge-${data.challenge_id}`},resolved:data}]};
    if(singleQuestionId!==undefined){let question:any;const walk=(v:any)=>{if(v&&typeof v==='object'){if(v.question_id===singleQuestionId&&v.question_options)question=v;Object.values(v).forEach(walk);}};walk(data);if(!question)throw Error('Missing isolated original question '+singleQuestionId);data={title:data.title,components:[{type:'Quiz',content:{comp_id:'isolated-question',title:'测验',questions:[question]}}]};}
    flushSync(()=>root.render(<Boundary key={file+mode+String(singleQuestionId)+Math.random()}><Page data={data} mode={mode}/></Boundary>));
    await tick();
    return {mode,objectStringLeak:document.body.innerText.includes('[object Object]')&&!JSON.stringify(data).includes('[object Object]'),errors:[...errors],quizCount:document.querySelectorAll('.edu-quiz').length,codeEditors:document.querySelectorAll('.edu-code-block').length,animations:document.querySelectorAll('.edu-animation').length,placeholders:[...document.querySelectorAll('.edu-unavailable')].map(e=>e.textContent),blankComponents:[...document.querySelectorAll('[data-audit-component]')].filter(e=>!e.textContent?.trim()&&!e.querySelector('img,iframe,video,audio,canvas,svg,input')).map(e=>({id:e.getAttribute('data-audit-component'),type:e.getAttribute('data-audit-type')})),textLength:document.body.innerText.length};
  },
  async tick(){await tick();},
  errors(){return [...errors];},
};
