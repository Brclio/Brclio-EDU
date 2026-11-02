import { useEffect, useState } from 'react';
import { BookOpen, Check, ChevronDown, Code2, FileText, Play, Trophy } from 'lucide-react';
import { useProgress } from './progress';
import { CourseSiteFooter, CourseSiteHeader } from './CourseCatalog';
import './course-overview.css';

export function courseRows(category: any): any[] {
  return [...(category.pages || []).flatMap((page: any) => [{ ...page, key: String(page.id) }, ...(page.coaches || []).map((coach: any) => ({ ...coach, key: `challenge-${coach.id}` }))]), ...(category.coaches || []).map((coach: any) => ({ ...coach, key: `challenge-${coach.id}` }))];
}

export default function CourseOverview({ course }: { course: any }) {
  const { progress } = useProgress();
  const categories = course.toc.categories;
  const [opened, setOpened] = useState<Record<string, boolean>>({ [categories[0]?.id]: true });
  useEffect(() => { document.title = `${course.title} · Brclio EDU`; setOpened({ [categories[0]?.id]: true }); }, [course.course_no]);
  const completed = (key: string) => !!progress.lessons[`${course.course_no}:${key}`]?.completed;
  const pages = categories.flatMap((cat: any) => cat.pages || []);
  const challenges = categories.flatMap((cat: any) => courseRows(cat).filter((row) => row.key.startsWith('challenge-')));
  const learnedPercent = pages.length ? Math.round(pages.filter((page: any) => completed(String(page.id))).length / pages.length * 100) : 0;
  const practicePercent = challenges.length ? Math.round(challenges.filter((row: any) => completed(row.key)).length / challenges.length * 100) : 0;
  const stats = course.widget_stats || {};
  const card = (item: any, fullWidth = false) => {
    const key = item.type === 'collection_lesson' ? String(item.id) : `challenge-${item.id}`;
    const done = completed(key);
    return <a className={`co-lesson-card${done ? ' co-done' : ''}${fullWidth ? ' co-wide-card' : ''}`} href={`#/course/${course.course_no}/page/${key}`} key={key}><div className="co-lesson-title">{item.number} {item.title}</div><div className="co-lesson-subtitle">{item.sub_title}</div><div className="co-lesson-status"><span>{done ? '已完成' : '未学习'}</span><span className="co-play-icon">{done ? <Check size={15} /> : <Play size={11} fill="currentColor" />}</span></div></a>;
  };
  return <div className="co-solo"><CourseSiteHeader /><main><section className="co-hero"><div className="co-hero-inner"><img className="co-mini-cover" src={course.mini_cover_img || course.cover_img} alt="" /><div className="co-hero-copy"><h1>{course.title}</h1><div className="co-hero-tags"><div>{[[FileText, stats.lesson, '小节'], [BookOpen, stats.quiz, '测验'], [Trophy, stats.challenge, '挑战'], [Code2, stats.playground, '代码']].map(([Icon, value, label]: any) => <span key={label}><Icon size={19} />{value || 0}{label}</span>)}</div><span className="co-public-label">全部公开</span></div><p className="co-description">{course.summary}</p><div className="co-progress-row">{[[learnedPercent, '学习进度'], [practicePercent, '练习进度']].map(([value, label]: any) => <div key={label} className="co-progress-item"><div className="co-progress-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></div><span>{label}<b>{value}%</b></span></div>)}</div></div></div></section><section className="co-timeline"><div className="co-timeline-inner">{categories.map((cat: any) => { const open = !!opened[cat.id]; const doneCount = cat.pages.filter((page: any) => completed(String(page.id))).length; return <section className={`co-chapter${open ? ' co-open' : ''}`} key={cat.id}><button className="co-chapter-header" aria-expanded={open} aria-controls={`chapter-${cat.id}`} onClick={() => setOpened((value) => ({ ...value, [cat.id]: !value[cat.id] }))}><span className="co-chapter-name">{cat.icon_url ? <img src={cat.icon_url} alt="" /> : <span className="co-chapter-fallback"><BookOpen size={24} /></span>}<span>{cat.title}</span></span><span className="co-chapter-count">{doneCount}/{cat.pages.length}<ChevronDown size={24} style={{ transform: open ? '' : 'rotate(-90deg)' }} /></span></button>{open && <div className="co-chapter-body" id={`chapter-${cat.id}`}>{cat.pages.map((page: any) => <div className={`co-timeline-row${completed(String(page.id)) ? ' co-done' : ''}`} key={page.id}>{card(page)}{(page.coaches || []).map((coach: any) => card(coach))}</div>)}{(cat.coaches || []).map((coach: any) => <div className={`co-timeline-row${completed(`challenge-${coach.id}`) ? ' co-done' : ''}`} key={`challenge-${coach.id}`}>{card(coach, true)}</div>)}</div>}</section>; })}</div></section></main><CourseSiteFooter /></div>;
}
