import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import SourceIcon from './SourceIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useProgress } from './progress';
import { CourseSiteHeader, CourseSiteFooter } from './CourseCatalog';
import { courseRows } from './CourseOverview';
import './course-overview.css';

function SourceCourseIcon({ name, size = 16 }: { name: string; size?: number }) { return <svg width={size} height={size} fill="currentColor" aria-hidden="true"><use href={`/content/site-ui/article-icons.svg#${name}`} /></svg>; }

const learningFeatures = [
  { icon: 'code', title: '实时编译环境', text: '看别人游泳并不会让你擅长游泳，编程也不例外。浏览器中的实时编码环境可以让你边学习边练习。' },
  { icon: 'font-size', title: '比看视频学得更快', text: '视频教程平均每分钟说150词，但是基于文章的教程你每分钟平均可以看250词，这就是为什么我们的课程全是基于文章的形式呈现给你的原因。' },
  { icon: 'profile', title: '编码环境零配置', text: '不需要下载安装SDK和IDE，课程中提供了基于云的可直接运行编码环境。' },
  { icon: 'pull-request', title: '清晰明了的课程学习路线', text: '课程中有非常多的测验和题目等着你去挑战。随着对课程的深入学习及编码的积累，你的编码技能也会越来越扎实牢固。' },
];

export default function ArticleOverview({ course }: { course: any }) {
  const { progress } = useProgress();
  const initialClosed = () => Object.fromEntries(course.toc.categories.slice(10).map((category: any) => [category.id, true]));
  const [closed, setClosed] = useState<Record<string, boolean>>(initialClosed);
  const lessons = course.toc.categories.flatMap(courseRows);
  const completed = (key: string) => !!progress.lessons[`${course.course_no}:${key}`]?.completed;
  const next = lessons.find((page: any) => !completed(page.key)) || lessons[0];
  useEffect(() => { document.title = `${course.title} · Brclio EDU`; setClosed(initialClosed()); }, [course.course_no, course.title]);
  const stats = course.widget_stats || {};
  return <div className="co-article"><CourseSiteHeader article /><div className="co-article-scroll"><main className="co-article-main"><div className="co-article-row"><div className="co-article-body"><h1>{course.title}</h1><div className="co-article-stats">{[['menu', stats.lesson, '课程'], ['read', stats.quiz, '测验'], ['read', stats.challenge, '挑战'], ['code', stats.playground, '代码'], ['picture', stats.illustration, '插图']].filter(([, count]) => count).map(([icon, count, label]: any) => <span className="co-stat-item" key={label}><span><SourceCourseIcon name={icon} size={14} /><span>{count} {label}</span></span></span>)}</div><hr /><h2>课程概要</h2><div className="co-article-summary"><ReactMarkdown remarkPlugins={[remarkGfm]}>{String(course.summary || '')}</ReactMarkdown></div>{course.clos?.length > 0 && <><h2 className="co-target-heading">课程目标</h2><div className="co-course-targets">{course.clos.map((objective: string) => <div key={objective}><p><SourceCourseIcon name="check" />{objective}</p></div>)}</div></>}<h2 className="co-section-heading">如何学习</h2><div className="co-learning-features">{learningFeatures.map(({ icon, title, text }) => <section key={title}><strong><SourceCourseIcon name={icon} /> {title}</strong><p>{text}</p></section>)}</div><h2 className="co-section-heading">课程目录</h2><div className="co-article-toc">{course.toc.categories.map((cat: any, index: number) => <section className={cat.title === '__default' ? 'co-flat-category' : undefined} key={cat.id}>{cat.title !== '__default' && <button className="co-article-chapter" aria-expanded={!closed[cat.id]} aria-controls={`article-chapter-${cat.id}`} onClick={() => setClosed((value) => ({ ...value, [cat.id]: !value[cat.id] }))}><SourceIcon name="right" size={14} className="co-article-expand-icon" /><span className="co-article-chapter-title"><strong>{`${cat.seq_no ?? index}. ${cat.title}`}</strong></span><span className="co-article-chapter-total">共{courseRows(cat).length}节</span></button>}{(cat.title === '__default' || !closed[cat.id]) && <div className="co-article-lessons" id={`article-chapter-${cat.id}`}>{courseRows(cat).map((item: any) => <a className={`${item.is_preview ? 'co-preview' : ''}${completed(item.key) ? ' co-completed' : ''}`} key={item.key} href={`#/course/${course.course_no}/page/${item.key}`}>{completed(item.key) ? <SourceCourseIcon name="check-circle-done" size={16} /> : <SourceIcon name="clock-circle" size={16} />}<span>{item.title}</span></a>)}</div>}</section>)}</div></div><aside className="co-article-aside"><img className="co-article-cover" src={course.cover_img} alt={course.title} /><div className="co-article-learn-info"><p>等你好久了！快开学习吧，学习使人快乐！</p><ol><li>交互式学习，代码随处运行，无须安装环境</li><li>课程精简无废话，边学边练，比视频更加高效</li><li>全部课程公开，学习记录自动保存</li></ol><hr /><div className="co-article-actions"><a href={`#/course/${course.course_no}/page/${next?.key || ''}`}><Play size={14} />开始学习</a><a href="#/records">学习记录</a></div><hr /><div className="co-article-time"><SourceCourseIcon name="field-time" /> 预计{course.read_hour}小时完成</div><div className="co-article-level"><SourceCourseIcon name="aim" /> {course.level_display}</div></div></aside></div></main><CourseSiteFooter /></div></div>;
}
