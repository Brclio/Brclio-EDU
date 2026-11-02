import {useState,type ReactNode} from 'react';
import './article-quiz.css';
import icons from './article-quiz-icons';
type Data=Record<string,any>;
type Props={data:Data;id:string;answers:Record<string,any>;onAnswer:(id:string,value:any)=>void;renderMarkdown:(text:string)=>ReactNode};
function AnswerIcon({variant,multi}:{variant:string;multi:boolean}){
 const paths=icons[variant==='warning'?(multi?'multiWarning':'singleWarning'):variant];
 return <svg viewBox="64 64 896 896" aria-hidden="true" className="article-answer-icon">{paths.map((d,i)=><path key={i} d={d}/>)}</svg>;
}
export default function ArticleQuiz({data,id,answers,onAnswer,renderMarkdown:md}:Props){
 const questions:Data[]=data.questions||[];const[current,setCurrent]=useState(0);
 return <section className="article-quiz" aria-label={data.title||'课程测验'}><header className="article-quiz-heading">{data.title}</header><div className="article-quiz-body"><div className="article-question-window"><div className="article-question-track" style={{transform:`translateX(-${current*100}%)`}}>{questions.map((q,qi)=>{
  const key=`${id}:${q.question_id||qi}`,saved=answers[key]||{},selected:number[]=saved.selected||[],checked=Boolean(saved.checked),multi=q.question_type==='mult_choice';
  const options:Data[]=q.question_options||[];
  const change=(index:number)=>{if(!checked)onAnswer(key,{...saved,selected:multi?selected.includes(index)?selected.filter(n=>n!==index):[...selected,index]:[index],checked:false,correct:null})};
  const submit=()=>{const expected=options.flatMap((o,i)=>o.correct?[i]:[]);onAnswer(key,{...saved,selected,checked:true,correct:expected.length===selected.length&&expected.every(i=>selected.includes(i)),checkedAt:new Date().toISOString()})};
  return <section key={key} className="article-question edu-quiz" aria-label={`第${qi+1}题`} data-active={qi===current}><div className="article-question-heading"><span className="article-question-number">{current+1}</span><div className="article-question-title">{md(q.question_text||q.question_text_html||'')}</div></div><div className="article-question-options">{options.map((o,i)=>{
   const picked=selected.includes(i),variant=picked?(o.correct?'success':'error'):(o.correct?'info':'warning');
   const explanation=o.explanation?.md_text||o.explanation?.md_html||'';
   return <div key={i} data-option-index={i} className={`article-question-option ${picked&&!checked?'is-selected':''} ${checked?'is-submitted':''}`} onClick={()=>change(i)}>{checked?<div className={`article-answer-alert ${variant}`}><AnswerIcon variant={variant} multi={multi}/><div className="article-answer-copy"><div className="article-answer-label"><div className="article-option-key">{`${String.fromCharCode(65+i)})`}</div><div className="article-answer-text">{md(o.text||o.text_html||'')}</div></div><div className={`article-answer-explanation ${explanation?'':'is-empty'}`}>{explanation&&md(explanation)}</div></div></div>:<><span className="article-choice-control"><input type={multi?'checkbox':'radio'} checked={picked} onChange={()=>change(i)} onClick={e=>e.stopPropagation()} aria-label={String.fromCharCode(65+i)}/><span className={`article-choice-symbol ${multi?'checkbox':'radio'} ${picked?'checked':''}`} aria-hidden="true"/></span><div className="article-option-content"><div className="article-option-key">{`${String.fromCharCode(65+i)})`}</div><div>{md(o.text||o.text_html||'')}</div></div></>}</div>;
  })}</div><footer className="article-question-footer">{questions.length>2?<nav aria-label="测验题目导航"><button type="button" aria-label="上一题" onClick={()=>setCurrent(Math.max(0,current-1))}><svg viewBox="64 64 896 896"><path d={icons.left[0]}/></svg></button><span>第{current+1}/{questions.length}个问题</span><button type="button" aria-label="下一题" onClick={()=>setCurrent(Math.min(questions.length-1,current+1))}><svg viewBox="64 64 896 896"><path d={icons.right[0]}/></svg></button></nav>:<div/>}<button type="button" className="article-quiz-submit" disabled={checked} onClick={submit}>提交答案</button></footer>{checked&&<span className="article-quiz-a11y-status" role="status">{saved.correct?'答案正确':'答案错误'}</span>}</section>;
 })}</div></div></div></section>;
}
