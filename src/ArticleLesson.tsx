import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, NotebookPen, X } from 'lucide-react';
import SourceIcon from './SourceIcon';
import { openEditorHelp } from './EditorHelp';
import { updateLesson, syncProgress } from './progress';
import './article.css';
import './article-fidelity.css';

/** The original educative courses have a separate article reader, not the solo step UI. */
export default function ArticleLesson({ course, lessonId, page, children, progress, status, onAnswer }: {
  course: any; lessonId: string; page: any; children: ReactNode; progress: any; status: string;
  onAnswer: (id: string, value: any) => void;
}) {
  const [sidebar, setSidebar] = useState(() => { try { return JSON.parse(localStorage.getItem('brclio-edu-reader-config-v1') || 'null')?.sideMenuExpanded ?? true; } catch { return true; } });
  const toggleSidebar = () => setSidebar(previous => { const next = !previous; localStorage.setItem('brclio-edu-reader-config-v1', JSON.stringify({ sideMenuExpanded: next })); return next; });
  const [notes, setNotes] = useState(false);
  const categories = course.toc.categories;
  const categoryRows = (cat: any) => cat.pages.map((p: any) => ({ ...p, key: String(p.id) }));
  const rows = categories.flatMap(categoryRows), position = rows.findIndex((p: any) => p.key === lessonId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(categories.map((cat: any) => [cat.id, categoryRows(cat).some((p: any) => p.key === lessonId)])));
  const [activeHeading, setActiveHeading] = useState('');
  const completed = !!progress.lessons[`${course.course_no}:${lessonId}`]?.completed;
  const [markComplete, setMarkComplete] = useState(completed || position + 1 < rows.length);
  useEffect(() => { if (completed) setMarkComplete(true); }, [completed]);
  const changeCompletion = (checked: boolean) => { setMarkComplete(checked); updateLesson(course.course_no, lessonId, { completed: checked }); void syncProgress(); };
  const [headings, setHeadings] = useState<{ text: string; id: string }[]>([]);
  const body = useRef<HTMLDivElement>(null), reader = useRef<HTMLElement>(null);
  const courseProgress = Math.floor(100 * rows.filter((p: any) => progress.lessons[`${course.course_no}:${p.key}`]?.completed).length / Math.max(1, rows.length));
  const answers = progress.lessons[`${course.course_no}:${lessonId}`]?.answers || {};
  useEffect(() => {
    const update = () => {
      const elements = Array.from(body.current?.querySelectorAll('.edu-markdown > h1, .edu-markdown > h2') || []).filter(element => !element.closest('.edu-quiz,.edu-code-block,.edu-mindmap-interactive'));
      const next = elements.map((element, index) => { const id = `article-section-${index}`; element.id = id; return { text: element.textContent || '', id }; });
      setHeadings(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    update();
    const observer = new MutationObserver(update);
    if (body.current) observer.observe(body.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [page]);
  const scrollToHeading = (heading: { text: string; id: string }) => {
    const pane = reader.current, element = document.getElementById(heading.id);
    if (pane && element) pane.scrollTo({ top: pane.scrollTop + element.getBoundingClientRect().top - pane.getBoundingClientRect().top, behavior: 'instant' });
    setActiveHeading(heading.id);
  };
  useEffect(() => {
    const restoreAnchor = () => {
      const prefix = `#/course/${course.course_no}/page/${lessonId}/anchor/`;
      if (!location.hash.startsWith(prefix)) return;
      let text = ''; try { text = decodeURIComponent(location.hash.slice(prefix.length)); } catch { return; }
      const heading = headings.find(item => item.text === text);
      if (heading) scrollToHeading(heading);
    };
    restoreAnchor(); window.addEventListener('hashchange', restoreAnchor);
    return () => window.removeEventListener('hashchange', restoreAnchor);
  }, [headings, course.course_no, lessonId]);
  const go = (key: string) => { location.hash = `/course/${course.course_no}/page/${key}`; };
  const next = () => {
    if (markComplete) { updateLesson(course.course_no, lessonId, { completed: true }); void syncProgress(); }
    if (position + 1 < rows.length) go(rows[position + 1].key);

  };
  return <div className={`article-reader ${sidebar ? 'article-sidebar-open' : ''}`}>
    <header className="article-header"><button className="article-menu" aria-label="切换课程目录" onClick={toggleSidebar}><SourceIcon name="menu" size={14} /></button><a className="article-brand" href="#/course/list"><BookOpen size={25} />Brclio EDU</a><nav><a href="#/course/list">课程列表</a><a href="#/playground">PLAYGROUND</a><a href="#/records">学习记录</a></nav><button className="article-notes-toggle" onClick={() => openEditorHelp({tab:'notes',courseId:course.course_no,lessonId})}><NotebookPen size={17} />学习笔记</button></header>
    {sidebar && <aside className="article-sidebar"><a className="article-back" href={`#/course/${course.course_no}/catalog`}><span className="article-back-icon"><SourceIcon name="arrow-left" size={16} /></span><strong>返回课程主页</strong></a><div className="article-course-info"><h2>{course.title}</h2><p>当前课程已完成 {courseProgress}%</p><div className="article-course-progress"><i style={{ width: `${courseProgress}%` }} /></div></div><div className="article-chapters">{categories.map((cat: any, index: number) => <section key={cat.id}>{cat.title !== '__default' && <button className="article-chapter-toggle" aria-expanded={!!expanded[cat.id]} onClick={() => setExpanded({ ...expanded, [cat.id]: !expanded[cat.id] })}><SourceIcon name="right" size={14} className={expanded[cat.id] ? "expanded" : ""} /><span>{`${cat.seq_no ?? index}. ${cat.title}`}</span></button>}{(cat.title === '__default' || expanded[cat.id]) && <div className={`article-chapter-items ${cat.title === '__default' ? 'article-flat-items' : ''}`}>{categoryRows(cat).map((item: any) => <a key={item.key} href={`#/course/${course.course_no}/page/${item.key}`} className={`${item.key === lessonId ? 'current' : ''} ${item.is_preview || progress.lessons[`${course.course_no}:${item.key}`]?.completed ? 'source-preview' : 'source-regular'}`}><span className="article-row-icon">{item.key === lessonId ? <SourceIcon name="rocket" size={16} /> : progress.lessons[`${course.course_no}:${item.key}`]?.completed ? <svg width={16} height={16} fill="currentColor" aria-hidden="true"><use href="/content/site-ui/article-icons.svg#check-circle-done"/></svg> : <SourceIcon name={item.is_preview ? "clock-circle" : "lock"} size={16} />}</span><span className="article-row-label"><span>{item.title}</span></span></a>)}</div>}</section>)}</div></aside>}
    <main className="article-reading-pane" ref={reader}><div className="article-reading-body"><div className="article-page-heading"><h1>{page?.title || rows[position]?.title}</h1>{page?.summary && <p>{page.summary}</p>}</div>{headings.length > 0 && <details className="article-toc" open><summary><SourceIcon name="right" size={14} className="expanded"/>本节将介绍以下内容</summary><div className="article-toc-panel"><ul>{headings.map(heading => <li key={heading.id} className={activeHeading === heading.id ? 'active' : ''}><a href={`#/course/${course.course_no}/page/${lessonId}/anchor/${encodeURIComponent(heading.text)}`} onClick={event => { event.preventDefault(); scrollToHeading(heading); const hash = `/course/${course.course_no}/page/${lessonId}/anchor/${encodeURIComponent(heading.text)}`; if (location.hash.slice(1) !== hash) location.hash = hash; }}>{heading.text}</a></li>)}</ul></div></details>}<div ref={body} className="article-content">{children}</div>{page && <div className="article-navigation"><div>{position > 0 && <><button onClick={() => go(rows[position - 1].key)}>← 上一节</button><p>{rows[position - 1].title}</p></>}</div><div className={position + 1 === rows.length ? 'article-last-page' : ''}>{position + 1 < rows.length && <><button onClick={next}>下一节 →</button><p>{rows[position + 1].title}</p></>}<label className={`article-completion-status${completed ? ' is-completed' : ''}`}><span className={`article-completion-checkbox${markComplete ? ' is-checked' : ''}`}><input type="checkbox" aria-label="标记为已完成" checked={markComplete} onChange={event => changeCompletion(event.target.checked)}/><span/></span><span>{completed ? '已完成' : '标记为已完成'}</span></label></div></div>}</div></main>
    {notes && <div className="notes-panel"><div><h3>学习笔记</h3><button aria-label="关闭笔记" onClick={() => setNotes(false)}><X size={18} /></button></div><p>{page?.title}</p><textarea aria-label="学习笔记" placeholder="记录你的想法、疑问和收获…" value={answers.__notes || ''} onChange={event => onAnswer('__notes', event.target.value)} /><small>{status}</small></div>}
  </div>;
}
