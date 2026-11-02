import { lazy, Suspense, useEffect, useState } from 'react';
import { useProgress } from './progress';
import { CourseSiteFooter, CourseSiteHeader } from './CourseCatalog';
import './course-overview.css';
const ChallengeDialog = lazy(() => import('./ChallengeDialog'));

export function courseRows(category: any): any[] {
  return [...(category.pages || []).flatMap((page: any) => [{ ...page, key: String(page.id) }, ...(page.coaches || []).map((coach: any) => ({ ...coach, key: `challenge-${coach.id}` }))]), ...(category.coaches || []).map((coach: any) => ({ ...coach, key: `challenge-${coach.id}` }))];
}

export default function CourseOverview({ course }: { course: any }) {
  const { progress } = useProgress();
  const [challenge, setChallenge] = useState<number | null>(null);
  const categories = course.toc.categories;
  const firstPending = () => categories.find((cat: any) => cat.pages.some((page: any) => !progress.lessons[`${course.course_no}:${page.id}`]?.completed)) || categories[0];
  const [opened, setOpened] = useState<Record<string, boolean>>({ [firstPending()?.id]: true });
  useEffect(() => {
    document.title = `${course.title} · Brclio EDU`;
    const category = firstPending(); setOpened({ [category?.id]: true });
    const pending = category?.pages.find((page: any) => !progress.lessons[`${course.course_no}:${page.id}`]?.completed);
    const timer = pending ? setTimeout(() => document.getElementById(`page-${pending.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400) : undefined;
    return () => clearTimeout(timer);
  }, [course.course_no]);
  const completed = (key: string) => !!progress.lessons[`${course.course_no}:${key}`]?.completed;
  const pages = categories.flatMap((cat: any) => cat.pages || []);
  const challenges = categories.flatMap((cat: any) => courseRows(cat).filter((row) => row.key.startsWith('challenge-')));
  const learnedPercent = pages.length ? Math.ceil(pages.filter((page: any) => completed(String(page.id))).length / pages.length * 100) : 0;
  const practicePercent = challenges.length ? Math.ceil(challenges.filter((row: any) => completed(row.key)).length / challenges.length * 100) : 0;
  const stats = course.widget_stats || {};
  const card = (item: any, fullWidth = false, popup = false) => {
    const key = item.type === 'collection_lesson' ? String(item.id) : `challenge-${item.id}`;
    const done = completed(key);
    return <a className={`co-lesson-card${done ? ' co-done' : ''}${fullWidth ? ' co-wide-card' : ''}`} href={`#/course/${course.course_no}/page/${key}`} onClick={popup ? event => { event.preventDefault(); setChallenge(Number(item.id)); } : undefined} key={key}><div className="co-lesson-title">{item.number} {item.title}</div><div className="co-lesson-subtitle">{item.sub_title}</div><div className="co-lesson-status"><span>{done ? '已完成' : '未学习'}</span><span className="co-play-icon" aria-hidden="true" /></div></a>;
  };
  return <div className="co-solo"><CourseSiteHeader /><main><section className="co-hero"><div className="co-hero-inner"><img className="co-mini-cover" src={course.mini_cover_img || undefined} alt="" /><div className="co-hero-copy"><h1>{course.title}</h1><div className="co-hero-tags"><div>{[['lesson', stats.lesson, '小节'], ['quiz', stats.quiz, '测验'], ['challenge', stats.challenge, '挑战'], ['illustration', stats.illustration >= 10 ? stats.illustration : 0, '插图'], ['playground', stats.playground >= 10 ? stats.playground : 0, '代码']].filter(([, value]) => value).map(([icon, value, label]: any) => <span key={label}><img src={`/content/site-ui/${icon}.png`} alt="" />{value}{label}</span>)}</div><span className="co-public-label">全部公开</span></div><div className="co-description">{course.details}</div><div className="co-progress-row">{[[learnedPercent, '学习进度'], [practicePercent, '练习进度']].map(([value, label]: any) => <div key={label} className="co-progress-item"><div className="co-progress-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></div><span>{label}<b>{value}%</b></span></div>)}</div></div></div></section><section className="co-timeline"><div className="co-timeline-inner">{categories.map((cat: any) => { const open = !!opened[cat.id]; const doneCount = cat.pages.filter((page: any) => completed(String(page.id))).length; return <section className={`co-chapter${open ? ' co-open' : ''}${doneCount > 0 ? doneCount === cat.pages.length ? ' co-chapter-done' : ' co-chapter-progress' : ''}`} key={cat.id}><button className="co-chapter-header" aria-expanded={open} aria-controls={`chapter-${cat.id}`} onClick={() => setOpened((value) => ({ [cat.id]: !value[cat.id] }))}><span className="co-chapter-name">{cat.icon_url ? <img src={cat.icon_url} alt="" /> : <span className="co-chapter-fallback" />}<span>{cat.title}</span></span><span className="co-chapter-count">{doneCount}/{cat.pages.length}<span className="co-chapter-arrow" aria-hidden="true" /></span></button>{open && <div className="co-chapter-body" id={`chapter-${cat.id}`}>{cat.pages.map((page: any) => <div className={`co-timeline-row${completed(String(page.id)) ? ' co-done' : ''}`} id={`page-${page.id}`} key={page.id}>{card(page)}{(page.coaches || []).map((coach: any) => card(coach, false, true))}</div>)}{(cat.coaches || []).map((coach: any) => <div className={`co-timeline-row${completed(`challenge-${coach.id}`) ? ' co-done' : ''}`} key={`challenge-${coach.id}`}>{card(coach, true)}</div>)}</div>}</section>; })}</div></section></main><CourseSiteFooter />{challenge !== null && <Suspense fallback={<div role="status">正在加载挑战…</div>}><ChallengeDialog key={challenge} courseId={course.course_no} challengeId={challenge} onClose={() => setChallenge(null)} /></Suspense>}</div>;
}
