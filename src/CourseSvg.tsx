import {useEffect,useState} from 'react';
const cache=new Map<string,Promise<string>>();
export function loadCourseSvg(src:string) {
  let request=cache.get(src);
  if(!request){request=fetch(src).then(r=>{if(!r.ok)throw Error(`SVG ${r.status}`);return r.text()}).then(cleanCourseSvg).catch(e=>{cache.delete(src);throw e});cache.set(src,request)}
  return request;
}
function cleanCourseSvg(svg:string) {
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')return '';
  doc.querySelectorAll('script,iframe,object,embed').forEach(e=>e.remove());
  doc.querySelectorAll('*').forEach(e=>{for(const a of [...e.attributes])if(/^on/i.test(a.name)||/^(?:javascript|vbscript):/i.test(a.value.trim()))e.removeAttribute(a.name)});
  return new XMLSerializer().serializeToString(doc.documentElement);
}
/** Inline SVG retains the original renderer's inherited font metrics and anti-aliasing. */
export default function CourseSvg({src,source,width,height,className='',label='课程图示'}:{src?:string;source?:string;width?:number;height?:number;className?:string;label?:string}) {
  const [svg,setSvg]=useState(()=>source?cleanCourseSvg(source):'');
  useEffect(()=>{let live=true;if(source){setSvg(cleanCourseSvg(source));return}setSvg('');if(src)void loadCourseSvg(src).then(s=>{if(live)setSvg(s)}).catch(()=>{});return()=>{live=false}},[src,source]);
  return <div className={`edu-inline-svg ${className}`} role="img" aria-label={label} style={{width,height}} dangerouslySetInnerHTML={{__html:svg}}/>;
}
