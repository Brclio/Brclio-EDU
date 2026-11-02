import { useEffect, useState } from 'react';
import { BookOpen, History } from 'lucide-react';
import './course-catalog.css';

export function CourseSiteHeader({ article = false }: { article?: boolean }) {
  return <>{!article && <div className="cc-announcement"><b>公开学习</b><span>全部课程免费开放，无需登录，边学边练，学习记录自动保存。</span></div>}<header className={`cc-header${article ? ' cc-header-article' : ''}`}><a className="cc-brand" href="#/course/list">{article ? <><BookOpen size={25} />Brclio EDU</> : <>Brclio<span>EDU</span></>}</a><nav aria-label="主导航"><a className="cc-nav-active" href="#/course/list">{article ? '课程列表' : '课程'}</a><a href="#/playground">{article ? 'PLAYGROUND' : '在线编程'}</a><a href="#/records">学习记录</a></nav><a className="cc-record-link" href="#/records"><History size={16} />学习记录</a></header></>;
}

export function CourseSiteFooter() {
  return <footer className="cc-footer"><a className="cc-brand" href="#/course/list">Brclio<span>EDU</span></a><div><a href="#/course/list">全部课程</a><a href="#/playground">在线编程</a><a href="#/records">学习记录</a></div><p>公开课程 · 交互式学习 · 无需登录</p></footer>;
}

function Difficulty({ audience }: { audience: string }) {
  const level = audience === 'beginner' ? 1 : audience === 'intermediate' ? 2 : 3;
  return <span className="cc-difficulty"><svg width="40" height="34" viewBox="0 0 40 34" aria-hidden="true"><rect y="18" width="8" height="16" rx="4" fill="#575BFD" /><rect x="16" y="11" width="8" height="23" rx="4" fill={level > 1 ? '#575BFD' : '#E9F0F3'} /><rect x="32" width="8" height="34" rx="4" fill={level > 2 ? '#575BFD' : '#E9F0F3'} /></svg><span>{level === 1 ? '入门' : level === 2 ? '进阶' : '高级'}</span></span>;
}

export default function CourseCatalog({ catalog }: { catalog: any }) {
  const [category, setCategory] = useState('全部');
  const group = catalog.categories.find((item: any) => item.name === category) || catalog.categories[0];
  const courseById = new Map(catalog.courses.map((course: any) => [course.course_no, course]));
  const courses: any[] = group.courseNos.map((id: string) => courseById.get(id)).filter(Boolean);
  useEffect(() => { document.title = '全部课程 · Brclio EDU'; }, []);
  return <div className="cc-site"><CourseSiteHeader /><div className="cc-category-bar"><div role="tablist" aria-label="课程分类">{catalog.categories.map((item: any) => <button key={item.name} type="button" role="tab" aria-selected={category === item.name} onClick={() => setCategory(item.name)}>{item.name}</button>)}</div></div><main className="cc-catalog"><div className="cc-grid" role="tabpanel" aria-label={category}>{courses.map((course: any, index: number) => <article className="cc-card" key={`${category}:${course.course_no}`} style={{ animationDelay: `${index * .1}s` }}><div className="cc-cover"><img src={course.cover_img} alt={course.title} onLoad={(event) => { const image = event.currentTarget; image.classList.toggle('cc-wide-image', image.naturalWidth / image.naturalHeight > 2); }} /></div><div className="cc-card-copy"><h2>{course.title}</h2><p>{course.summary}</p></div><div className="cc-card-footer"><Difficulty audience={course.target_audience} /><button type="button" className="cc-study" onClick={() => { location.hash = `/course/${course.course_no}/catalog`; }}>去学习<svg width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden="true"><path d="M10.6125 3.9375H0.625V5.35417H10.6125L8.41667 7.55L9.40833 8.54167L13.3042 4.64583L9.47917 0.75L8.4875 1.74167L10.6125 3.9375Z" fill="currentColor" /></svg></button></div></article>)}</div></main><CourseSiteFooter /></div>;
}
