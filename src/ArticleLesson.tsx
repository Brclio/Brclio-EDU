import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, Clock, Menu, NotebookPen, Rocket, X } from 'lucide-react';
import { updateLesson, syncProgress } from './progress';
import './article.css';

/** The original educative courses have a separate article reader, not the solo step UI. */
export default function ArticleLesson({ course, lessonId, page, children, progress, status, onAnswer }: {
  course: any; lessonId: string; page: any; children: ReactNode; progress: any; status: string;
  onAnswer: (id: string, value: any) => void;
}) {
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 700);
  const [notes, setNotes] = useState(false);
  const categories = course.toc.categories;
  const categoryRows = (cat: any) => [...cat.pages.flatMap((p: any) => [{ ...p, key: String(p.id) }, ...(p.coaches || []).map((c: any) => ({ ...c, key: `challenge-${c.id}` }))]), ...(cat.coaches || []).map((c: any) => ({ ...c, key: `challenge-${c.id}` }))];
  const rows = categories.flatMap(categoryRows), position = rows.findIndex((p: any) => p.key === lessonId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(categories.map((cat: any) => [cat.id, categoryRows(cat).some((p: any) => p.key === lessonId)])));
  const [headings, setHeadings] = useState<{ text: string; id: string }[]>([]);
  const body = useRef<HTMLDivElement>(null), reader = useRef<HTMLElement>(null);
  const courseProgress = Math.round(100 * rows.filter((p: any) => progress.lessons[`${course.course_no}:${p.key}`]?.completed).length / Math.max(1, rows.length));
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
  const go = (key: string) => { location.hash = `/course/${course.course_no}/page/${key}`; };
  const next = () => {
    updateLesson(course.course_no, lessonId, { completed: true }); void syncProgress();
    if (position + 1 < rows.length) go(rows[position + 1].key);
    else location.hash = `/course/${course.course_no}/catalog`;
  };
  return <div className={`article-reader ${sidebar ? 'article-sidebar-open' : ''}`}>
    <header className="article-header"><button className="article-menu" aria-label="切换课程目录" onClick={() => setSidebar(!sidebar)}><Menu size={21} /></button><a className="article-brand" href="#/course/list"><BookOpen size={25} />Brclio EDU</a><nav><a href="#/course/list">课程列表</a><a href="#/playground">PLAYGROUND</a><a href="#/records">学习记录</a></nav><button className="article-notes-toggle" onClick={() => setNotes(!notes)}><NotebookPen size={17} />学习笔记</button></header>
    {sidebar && <aside className="article-sidebar"><a className="article-back" href={`#/course/${course.course_no}/catalog`}><ArrowLeft size={17} />返回课程主页</a><div className="article-course-info"><h2>{course.title}</h2><p>当前课程已完成 {courseProgress}%</p><div className="article-course-progress"><i style={{ width: `${courseProgress}%` }} /></div></div><div className="article-chapters">{categories.map((cat: any, index: number) => <section key={cat.id}><button className="article-chapter-toggle" aria-expanded={!!expanded[cat.id]} onClick={() => setExpanded({ ...expanded, [cat.id]: !expanded[cat.id] })}>{expanded[cat.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span>{cat.seq_no ?? index}. {cat.title}</span></button>{expanded[cat.id] && <div className="article-chapter-items">{categoryRows(cat).map((item: any) => <a key={item.key} href={`#/course/${course.course_no}/page/${item.key}`} className={item.key === lessonId ? 'current' : ''}>{progress.lessons[`${course.course_no}:${item.key}`]?.completed ? <Check size={16} /> : item.key === lessonId ? <Rocket size={16} /> : <Clock size={16} />}<span>{item.title}</span></a>)}</div>}</section>)}</div></aside>}
    <main className="article-reading-pane" ref={reader}><div className="article-page-heading"><h1>{page?.title || rows[position]?.title}</h1>{page?.summary && <p>{page.summary}</p>}</div>{headings.length > 0 && <details className="article-toc" open><summary>本节将介绍以下内容</summary><ul>{headings.map(heading => <li key={heading.id}><a href={`#${heading.id}`} onClick={event => { event.preventDefault(); document.getElementById(heading.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>{heading.text}</a></li>)}</ul></details>}<div ref={body} className="article-content">{children}</div>{page && <div className="article-navigation"><button disabled={position <= 0} onClick={() => go(rows[position - 1].key)}><ArrowLeft size={17} />上一节</button><span>{status}</span><button onClick={next}>{position + 1 < rows.length ? '下一节' : '完成课程'}<ArrowRight size={17} /></button></div>}</main>
    {notes && <div className="notes-panel"><div><h3>学习笔记</h3><button aria-label="关闭笔记" onClick={() => setNotes(false)}><X size={18} /></button></div><p>{page?.title}</p><textarea aria-label="学习笔记" placeholder="记录你的想法、疑问和收获…" value={answers.__notes || ''} onChange={event => onAnswer('__notes', event.target.value)} /><small>{status}</small></div>}
  </div>;
}
