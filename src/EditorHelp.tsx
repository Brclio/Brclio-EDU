import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { updateLesson, useProgress } from './progress';
import './editor-help.css';

export type EditorHelpRequest = { tab?: 'ai' | 'notes' | 'teacher'; courseId?: string; lessonId?: string; code?: string; hints?: string[]; solution?: string };
const openEvent = 'brclio:open-help';
const closeEvent = 'brclio:close-help';
let helpVisible = false;
export function openEditorHelp(detail: EditorHelpRequest = {}) { window.dispatchEvent(new CustomEvent(openEvent, { detail })); }
function CloseIcon() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
export function EditorHelpLauncher({ request = {}, className = '' }: { request?: EditorHelpRequest; className?: string }) {
  const [visible, setVisible] = useState(helpVisible);
  useEffect(() => { const listener = (event: Event) => setVisible((event as CustomEvent).detail); window.addEventListener('brclio:help-state', listener); return () => window.removeEventListener('brclio:help-state', listener); }, []);
  return <button type="button" className={`editor-help-launcher ${visible ? 'is-open' : ''} ${className}`} aria-label={visible ? '关闭学习助手' : 'AI助手'} onClick={() => visible ? window.dispatchEvent(new Event(closeEvent)) : openEditorHelp(request)}>{visible ? <CloseIcon /> : <img src="/content/site-ui/ai-assistant.png" alt="" />}</button>;
}

/** One shared panel for page tools and fullscreen editors; no simulated remote replies. */
export default function EditorHelp() {
  const [request, setRequest] = useState<EditorHelpRequest | null>(null);
  const [tab, setTab] = useState<'ai' | 'notes' | 'teacher'>('ai');
  const [portal, setPortal] = useState<Element | null>(null);
  const { progress, status } = useProgress();
  const close = () => { setRequest(null); helpVisible = false; window.dispatchEvent(new CustomEvent('brclio:help-state', { detail: false })); };
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<EditorHelpRequest>).detail || {};
      const route = location.hash.match(/\/course\/([^/]+)\/page\/([^/?#]+)/);
      setRequest({ courseId: route?.[1], lessonId: route?.[2], ...detail }); setTab(detail.tab || 'ai');
      setPortal([...document.querySelectorAll('dialog[open]')].at(-1) || document.body);
      helpVisible = true; window.dispatchEvent(new CustomEvent('brclio:help-state', { detail: true }));
    };
    window.addEventListener(openEvent, open); window.addEventListener(closeEvent, close); window.addEventListener('hashchange', close);
    return () => { window.removeEventListener(openEvent, open); window.removeEventListener(closeEvent, close); window.removeEventListener('hashchange', close); helpVisible = false; };
  }, []);
  useEffect(() => { if (!portal || portal === document.body) return; const observer = new MutationObserver(() => { if (!portal.isConnected) close(); }); observer.observe(document.body, { childList: true, subtree: true }); return () => observer.disconnect(); }, [portal]);
  if (!request || !portal) return null;
  const saved = request.courseId && request.lessonId ? progress.lessons[`${request.courseId}:${request.lessonId}`] : undefined;
  const saveNote = (value: string) => { if (request.courseId && request.lessonId) updateLesson(request.courseId, request.lessonId, { answers: { ...saved?.answers, __notes: value } }); };
  return createPortal(<section className="editor-help-panel" role="dialog" aria-label="学习助手"><header><div className="editor-help-tabs" role="tablist" aria-label="学习助手功能">{([['ai', 'AI助手'], ['notes', '笔记'], ['teacher', '助教答疑']] as const).map(([key, title]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{title}</button>)}</div><button type="button" className="editor-help-close" aria-label="关闭学习助手面板" onClick={close}><CloseIcon /></button></header><div className="editor-help-content">
    {tab === 'ai' && <div className="editor-help-chat"><div className="editor-help-messages"><div className="editor-help-empty"><svg viewBox="0 0 1024 1024" width="200" height="200" aria-hidden="true"><path d="M896 685.408V192a32 32 0 0 0-32-32H160c-17.632 0-32 14.336-32 32v668.064l145.984-126.944a64.192 64.192 0 0 1 41.984-15.712H864a32 32 0 0 0 32-32zM864 96c52.928 0 96 43.072 96 96v493.408c0 52.928-43.072 96-96 96H315.968l-145.952 126.944a63.552 63.552 0 0 1-46.464 15.552A64.096 64.096 0 0 1 64 860.064V192c0-52.928 43.072-96 96-96h704z m-204.576 252.576a32 32 0 1 1 0 64H333.696a32 32 0 0 1 0-64h325.76z m-131.776 148.576a32 32 0 1 1 0 64h-193.92a32 32 0 0 1 0-64h193.92z" fill="#e5e5e5" /></svg><span>请输入问题</span></div>{request.hints?.filter(Boolean).map((hint, index) => <details className="editor-help-resource" key={index}><summary>课程提示 {index + 1}</summary><pre>{hint}</pre></details>)}{request.solution?.trim() && <details className="editor-help-resource"><summary>课程参考答案</summary><pre>{request.solution}</pre></details>}</div><div className="editor-help-send"><p role="status">本地 AI 服务尚未配置，暂不能生成答复。</p><textarea aria-label="AI 提问" disabled placeholder="你也可以在此输入你想咨询的问题哟~" /></div></div>}
    {tab === 'notes' && <div className="editor-help-notes">{request.courseId && request.lessonId ? <><textarea autoFocus aria-label="学习笔记" placeholder="记录你的想法、疑问和收获…" value={saved?.answers?.__notes || ''} onChange={event => saveNote(event.target.value)} /><small role="status">{status}</small></> : <p>进入课节后即可记录学习笔记。</p>}</div>}
    {tab === 'teacher' && <div className="editor-help-teacher"><p>本地助教答疑服务尚未配置。</p><p>可以先在笔记中保存问题。</p><button type="button" onClick={() => setTab('notes')}>记录问题</button></div>}
  </div></section>, portal);
}
