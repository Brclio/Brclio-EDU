import {useEffect,useRef,useState} from 'react';
import {EditorHelpLauncher} from './EditorHelp';
import {syncProgress,updateLesson,useProgress} from './progress';
import './solo-completion.css';

export default function SoloCompletion({courseId,lessonId}:{courseId:string;lessonId:string}) {
  const {progress}=useProgress();
  const saved=progress.lessons[`${courseId}:${lessonId}`];
  const firstCompletion=useRef(!saved?.completed);
  const recorded=useRef(false);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    document.title='学习完成 · Brclio EDU';
    if(!recorded.current){
      recorded.current=true;
      updateLesson(courseId,lessonId,{completed:true,answers:{...saved?.answers,...(firstCompletion.current?{__completionReward:10}:{})}});
      void syncProgress();
    }
    const timer=window.setTimeout(()=>setReady(true),5000);
    return()=>window.clearTimeout(timer);
  },[courseId,lessonId]);
  return <main className="solo-completed">
    <div className="solo-completed-picture"/>
    <div className="solo-completed-title">学习完成</div>
    <div className="solo-completed-description">你可以学习其他课程了，但是不要忘记用练习去测试你的知识！</div>
    {firstCompletion.current?<div className="solo-completed-reward"><div>你获得了：</div><div className="solo-completed-diamond">+10 <i/></div></div>:<div style={{height:89}}/>}
    <div className="solo-completed-footer"><div className="solo-completed-container">{ready?<button onClick={()=>{location.replace(`#/course/${courseId}/catalog`);window.scrollTo(0,0);}}>继续</button>:<div className="solo-completed-loading" role="status" aria-label="加载中"><img src="/content/site-ui/loading.gif" alt="loading" width="100"/></div>}</div></div>
    <EditorHelpLauncher request={{courseId,lessonId}}/>
  </main>;
}
