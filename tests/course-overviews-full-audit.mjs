/** Live, same-viewport source/local layout audit. Requires agent-browser and npm run dev.
 * Run: node tests/course-layout-audit.mjs
 * Override AUDIT_BASE to measure a deployed build. Source selectors intentionally
 * identify the public source bundle observed on 2026-11-02; fail if it changes.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
const base = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const auditWidth = Number(process.env.AUDIT_WIDTH || 1280);
const auditHeight = Number(process.env.AUDIT_HEIGHT || 900);
const suffix = auditWidth === 1280 ? '' : `-${auditWidth}`;
const directory = `output/course-overviews-full-audit${suffix}`;
await fs.mkdir(directory, { recursive: true });
const browser = (session, ...args) => { try { return JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 55000 })); } catch (error) { if (args[0] === 'open' && String(error.stdout).includes('Operation timed out')) return {success:false, navigationTimedOut:true}; throw error; }};
const evaluate = (session, script) => {
  const response = browser(session, 'eval', script);
  if (!response.success) throw new Error(JSON.stringify(response));
  return response.data.result;
};
const samples = [
  { name: 'catalog', source: 'https://edu.py2fun.com/learn#/course/list', local: '/#/course/list', sourceSession: 'edu-catalog-reference', localSession: 'edu-catalog-local', waitSource: '._course-card_nf0sm_11', waitLocal: '.cc-card', selectors: [
    ['categories', '._tab-container_1e2ny_12', '.cc-category-bar>div'],
    ['cards', '._course-card_nf0sm_11', '.cc-card'],
    ['coverBoxes', '._card-img_3i0ur_1', '.cc-cover'],
    ['titles', '._title_nf0sm_47', '.cc-card-copy h2'],
    ['summaries', '._summary_nf0sm_60', '.cc-card-copy p'],
    ['footers', '._footer_nf0sm_71', '.cc-card-footer'],
  ] },
  { name: 'solo-015', source: 'https://edu.py2fun.com/learn#/course/015/catalog', local: '/#/course/015/catalog', sourceSession: 'edu-catalog-style', localSession: 'edu-solo-local', waitSource: '._name_1sclx_53', waitLocal: '.co-hero h1', selectors: [
    ['hero', '._header_1sclx_7', '.co-hero'],
    ['heroTitle', '._name_1sclx_53', '.co-hero h1'],
    ['heroTags', '._tags_1sclx_59', '.co-hero-tags'],
    ['statTags', '._tags_1sclx_59 ._tag_1m2k6_1', '.co-hero-tags>div>span'],
    ['summary', '._descriptions_1sclx_69', '.co-description'],
    ['progress', '._inlineProgress_1f6ie_1', '.co-progress-item'],
    ['chapters', '._header_1gkvy_6', '.co-chapter-header'],
    ['lessonCards', '._pageCard_jevq3_1', '.co-lesson-card'],
  ] },
  { name: 'article-002', source: 'https://edu.py2fun.com/course/002/overview', local: '/#/course/002/catalog', sourceSession: 'edu-overview-style', localSession: 'edu-overview-local', waitSource: '.overview_row__3n6Vw h1', waitLocal: '.co-article-body h1', selectors: [
    ['title', '.overview_row__3n6Vw h1', '.co-article-body h1'],
    ['statTags', '.overview_row__3n6Vw>.ant-col:first-child>.ant-space .ant-tag', '.co-stat-item>span'],
    ['sectionHeadings', '.overview_row__3n6Vw:not(.overview_evaluates__2TcHv)>.ant-col:first-child h4.ant-typography', '.co-article-body h2'],
    ['summary', '.overview_row__3n6Vw>.ant-col:first-child>.markdown_markdown__2qCx2', '.co-article-summary'],
    ['summaryParagraphs', '.overview_row__3n6Vw>.ant-col:first-child>.markdown_markdown__2qCx2>div', '.co-article-summary>p'],
    ['cover', '.overview_cover__1JQUJ', '.co-article-cover'],
    ['learnInfo', '.overview_learnInfo__2TXa5', '.co-article-learn-info'],
    ['toc', '.course-catelog_courseCatalog__2tqkS', '.co-article-toc'],
    ['chapters', '.course-catelog_courseCatalog__2tqkS .ant-collapse-header', '.co-article-chapter'],
    ['lessonRows', '.course-catelog_courseCatalog__2tqkS .ant-list-item', '.co-article-lessons>a'],
  ] },
];
const catalog = JSON.parse(await fs.readFile('public/content/catalog.json', 'utf8'));
const soloTemplate = samples[1]; const articleTemplate = samples[2];
samples.splice(1, 2, ...catalog.courses.map(course => ({...(course.is_educative ? articleTemplate : soloTemplate), title:course.title, name: (course.is_educative ? 'article-' : 'solo-') + course.course_no, source: course.is_educative ? 'https://edu.py2fun.com/course/' + course.course_no + '/overview' : 'https://edu.py2fun.com/learn#/course/' + course.course_no + '/catalog', local: '/#/course/' + course.course_no + '/catalog', sourceSession: 'catalog-fidelity-full-source' + suffix, localSession: 'catalog-fidelity-full-local' + suffix})));
samples[0].sourceSession='catalog-fidelity-full-source'+suffix;samples[0].localSession='catalog-fidelity-full-local'+suffix;
if (process.env.AUDIT_COURSES) { const selected = process.env.AUDIT_COURSES.split(','); samples.splice(0, samples.length, ...samples.filter(sample => sample.name === 'catalog' || selected.some(id => sample.name.endsWith('-' + id)))); }
function measurements(session, selectors, side) {
  return evaluate(session, `(() => {const groups=${JSON.stringify(selectors.map(([name, source, local]) => [name, side === 'source' ? source : local]))};return Object.fromEntries(groups.map(([name,selector])=>[name,[...document.querySelectorAll(selector)].filter(element=>element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0).map(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return {rect:[r.x+window.scrollX,r.y+window.scrollY,r.width,r.height],fontSize:s.fontSize,lineHeight:s.lineHeight,fontWeight:s.fontWeight,text:element.innerText?.slice(0,80)||''}})]));})()`);
}
const report = { createdAt: new Date().toISOString(), base, viewport: { width: auditWidth, height: auditHeight }, comparisons: [], intentionalDifferences: [
  'User confirmed Brclio branding and local navigation remain; source account, sales and payments are not local course functions.',
  'All lesson links remain public and enabled; source lock icons are replaced with learning status. Source page/challenge ordering and dimensions remain intact.',
  'Remote instructor service, testimonials about the source service and sales calls to action are not represented as services of this deployment.',
  'Course layouts follow the source widths; source global brand and navigation are intentionally retained as Brclio.',
], scope: 'Live document-space geometry and screenshots for the catalog and all 28 course overviews at 1280x900. Source empty groups are validated against matching local empty groups. This does not claim pixel equality for every interaction state.' };
for (const sample of samples) {
  for (const [side, session, url, wait] of [['source', sample.sourceSession, sample.source, sample.waitSource], ['local', sample.localSession, base + sample.local, sample.waitLocal]]) {
    browser(session, 'open', url); browser(session, 'set', 'viewport', String(auditWidth), String(auditHeight)); browser(session, 'wait', wait);
    if (sample.title) browser(session, 'wait', '--fn', `document.querySelector(${JSON.stringify(wait)})?.textContent.trim() === ${JSON.stringify(sample.title)}`);
    if (sample.name.startsWith('solo-') && side === 'source') {
      if (evaluate(session, `!!document.querySelector('._action_14z4n_30')`)) { browser(session, 'click', '._action_14z4n_30'); browser(session, 'open', url); browser(session, 'wait', wait); }
    }
    browser(session, 'wait', '--fn', 'Array.from(document.images).every(image => image.complete)');
    browser(session, 'wait', '--fn', 'document.getAnimations().every(animation => animation.playState === "finished" || animation.effect?.getTiming().iterations === Infinity)');
    evaluate(session, `window.scrollTo({top:0,left:0,behavior:'instant'});document.querySelector('.courses_body__1xrEB,.co-article-scroll')?.scrollTo({top:0,left:0,behavior:'instant'});true`);
    browser(session, 'screenshot', `${directory}/${sample.name}-${side}.png`);
  }
  const source = measurements(sample.sourceSession, sample.selectors, 'source');
  const local = measurements(sample.localSession, sample.selectors, 'local');
  const groups = Object.keys(source).map(name => {
    const deltas = source[name].map((item, i) => local[name][i] ? item.rect.map((v, axis) => Math.abs(v - local[name][i].rect[axis])) : [Infinity]);
    return { name, sourceCount: source[name].length, localCount: local[name].length, maxAbsolutePixelDelta: Math.max(0, ...deltas.flat()), passed: (source[name].length > 0 || (name === 'chapters' && ['article-001', 'article-006'].includes(sample.name))) && source[name].length === local[name].length && deltas.flat().every(delta => delta <= 0.1) };
  });
  const result = { name: sample.name, sourceUrl: sample.source, localUrl: base + sample.local, source, local, groups };
  if (sample.name === 'article-002') {
    for (const [side, session, selector] of [['source', sample.sourceSession, '.courses_body__1xrEB'], ['local', sample.localSession, '.co-article-scroll']]) {
      evaluate(session, `document.querySelector(${JSON.stringify(selector)}).scrollTop=900`);
      browser(session, 'screenshot', `${directory}/${sample.name}-toc-${side}.png`);
    }
    result.afterScrolling900 = { source: measurements(sample.sourceSession, sample.selectors, 'source'), local: measurements(sample.localSession, sample.selectors, 'local') };
  }
  report.comparisons.push(result);
  console.log(JSON.stringify({ page: result.name, groups }));
}
report.summary = { comparedGroups: report.comparisons.reduce((sum, page) => sum + page.groups.length, 0), failedGroups: report.comparisons.flatMap(page => page.groups.filter(group => !group.passed).map(group => ({ page: page.name, ...group }))) };
await fs.writeFile(`tests/course-overviews-full-audit${suffix}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary, null, 2));

if (report.summary.failedGroups.length) process.exitCode = 1;
