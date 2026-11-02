import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './source-web-preview.css';
import {installNativePreviewDialogs} from './native-web-dialogs';
export function useNativePreviewDialogs(frame: {current:HTMLIFrameElement|null},channel:string){useLayoutEffect(()=>installNativePreviewDialogs(()=>frame.current?.contentWindow,channel),[frame,channel]);}
type ConsoleLine = { method: string; data: string[] };
export default function SourceWebPreview({ html, run, channel }: { html?: string; run?: number; channel: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useNativePreviewDialogs(frame,channel);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  useEffect(() => { setLines([]); }, [run]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.__eduPreviewConsole !== channel || !Array.isArray(event.data.data)) return;
      const method = ['log', 'info', 'warn', 'error', 'system'].includes(event.data.method) ? event.data.method : 'log';
      setLines(previous => [...previous, { method, data: event.data.data.map(String) }].slice(-1000)); setOpen(true);
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [channel]);
  return <div className="edu-source-web-preview"><div className="edu-source-web-frame">{html !== undefined && <iframe ref={frame} key={run} title="HTML 运行结果" sandbox="allow-scripts allow-forms" srcDoc={html} />}</div>{open ? <section className="edu-source-web-console" aria-label="JavaScript 控制台"><header><span>Console</span><button type="button" aria-label="关闭控制台" onClick={() => setOpen(false)}>×</button></header><div className="edu-source-web-console-lines">{lines.map((line, index) => <div key={index} className={`edu-source-web-line ${line.method}`}><i className={line.method} /><div>{line.data.map((value, item) => <span key={item}>{value}</span>)}</div></div>)}</div></section> : <button type="button" className="edu-source-web-console-tag" onClick={() => setOpen(true)}>console</button>}</div>;
}
