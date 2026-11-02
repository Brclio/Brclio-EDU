import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Content from '../src/Content';
import '../src/styles.css';
import '../src/solo-fidelity.css';
import '../src/article.css';
import '../src/article-fidelity.css';
const root=createRoot(document.getElementById('root')!);
function QuizPage({question,mode,initialAnswers={}}:any){
 const [answers,setAnswers]=useState(initialAnswers);
 (window as any).quizVisual.alignOrder=(order:number[],kind:string)=>setAnswers((old:any)=>{const key=`visual-quiz:${question.question_id}`;return {...old,[key]:{...old[key],[kind==='reorder'?'order':'optionOrder']:order}}});
 const content=<Content mode={mode} components={[{type:'Quiz',content:{comp_id:'visual-quiz',title:mode==='article'?'测验':undefined,questions:question.questions||[question]}}]} answers={answers} onAnswer={(id,value)=>setAnswers((old:any)=>({...old,[id]:value}))}/>;
 return mode==='solo'?<div className="learning solo" style={{paddingTop:120}}><main className="lesson-main"><h1>测验</h1>{content}</main></div>:<div className="article-reader"><div className="article-content" style={{width:960,margin:'32px auto'}}>{content}</div></div>;

}
(window as any).quizVisual={render(question:any,mode='solo',initialAnswers={}){root.render(<QuizPage key={Math.random()} question={question} mode={mode} initialAnswers={initialAnswers}/>);}};
