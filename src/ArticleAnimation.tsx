import {useEffect,useRef,useState} from 'react';
import CourseSvg, {loadCourseSvg} from './CourseSvg';
import SourceIcon from './SourceIcon';
import useSourceClickWave from './useSourceClickWave';

/** Source Carousel CSS disables fading; afterChange still updates after 500 ms. */
export default function ArticleAnimation({data}:{data:Record<string,any>}) {
  const frames:any[]=data.canvas_objects||data.frames||[];
  const wave=useSourceClickWave();
  const [index,setIndex]=useState(0),[target,setTarget]=useState(0),[fading,setFading]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),busy=useRef(false),touch=useRef<number|null>(null);
  const height=Number(data.height||frames[0]?.height||380),width=Number(data.width||frames[0]?.width||600);
  useEffect(()=>{for(const f of frames)if(f.file?.endsWith('.svg'))void loadCourseSvg(f.file).catch(()=>{});return()=>{if(timer.current)clearTimeout(timer.current)}},[frames]);
  function go(next:number){
    if(!frames.length||busy.current)return;
    next=(next+frames.length)%frames.length;
    if(timer.current)clearTimeout(timer.current);
    if(next===index){busy.current=false;setFading(false);setTarget(next);setIndex(next);return;}
    busy.current=true;setTarget(next);setFading(true);
    timer.current=setTimeout(()=>{setIndex(next);setFading(false);busy.current=false;timer.current=null},500);
  }
  function slide(i:number,phase:string){const f=frames[i];return <div key={i} className={`edu-animation-slide ${phase}`} aria-hidden={fading?i!==target:false}>
    {f?.file?.endsWith('.svg')?<CourseSvg src={f.file} width={width} height={height} label={f.caption||'课程分步动画'}/>:f?.file?<img className="edu-animation-image" src={f.file} alt={f.caption||'课程分步动画'}/>:<CourseSvg source={f?.svg_xml||f?.svg_string} width={width} height={height}/>}
    {f?.caption&&<figcaption>{f.caption}</figcaption>}
  </div>}
  return <figure className="edu-animation edu-article-animation">
    <div className="edu-animation-stage" style={{height,'--frame-height':`${height}px`} as any} onTouchStart={e=>{touch.current=e.touches[0]?.clientX??null}} onTouchCancel={()=>{touch.current=null}} onTouchEnd={e=>{if(touch.current!==null){const dx=(e.changedTouches[0]?.clientX??touch.current)-touch.current;if(Math.abs(dx)>e.currentTarget.clientWidth/5)go(index+(dx<0?1:-1));touch.current=null}}} onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();go(index+1)}else if(e.key==='ArrowLeft'){e.preventDefault();go(index-1)}}}>
      {fading&&slide(index,'is-leaving')}{slide(fading?target:index,fading?'is-entering':'is-current')}
    </div>
    <div className="edu-animation-controls" style={frames.length<2?{display:'none'}:undefined}>
      <button {...wave} className="animation-previous" type="button" disabled={index===0} aria-label="上一步" onClick={()=>go(index-1)}><span className="animation-icon"><SourceIcon name="left"/></span></button>
      <div className="animation-extra"><span className="animation-counter" aria-live="polite">{frames.length?index+1:0}/{frames.length}</span></div>
      <button {...wave} className="animation-next" type="button" disabled={index>=frames.length-1} aria-label="下一步" onClick={()=>go(index+1)}><span className="animation-icon"><SourceIcon name="right"/></span></button>
      <button {...wave} className="animation-reset" type="button" title="重播动画" aria-label="重播动画" onClick={()=>go(0)}><span className="animation-icon"><SourceIcon name="reload"/></span></button>
    </div>
  </figure>;
}
