/** Screenshot and paint-property review. Source/local run in the same Chromium version.
 * Existing source sessions retain successfully loaded CDN images; new source sessions
 * currently encounter failed CDN images. No missing image is treated as a match.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import sharp from 'sharp';
const output = 'output/catalog-visual-review';
await fs.mkdir(output, { recursive: true });
const command = (session, ...args) => {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 35000 }));
  if (!result.success) throw Error(JSON.stringify(result));
  return result.data;
};
const evaluate = (session, code) => command(session, 'eval', code).result;
const wait = (session, expression) => command(session, 'wait', '--fn', expression);
const localSession = 'visual-catalog-local';
const props = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft', 'borderRadius', 'boxShadow', 'opacity', 'textShadow', 'textDecorationLine', 'cursor'];
const styles = (session, selector) => evaluate(session, `(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e);return {text:e.textContent,rect:(()=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(),styles:Object.fromEntries(${JSON.stringify(props)}.map(k=>[k,s[k]])),svg:[...e.querySelectorAll('svg')].map(s=>({box:s.getAttribute('viewBox'),width:s.getBoundingClientRect().width,height:s.getBoundingClientRect().height,html:s.innerHTML}))}})()`);
async function capture(session, selector, name, center = true) {
  if (center) evaluate(session, `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'center'});true`);
  wait(session, `document.fonts.status==='loaded' && document.getAnimations().every(a=>a.playState==='finished'||a.effect?.getTiming().iterations===Infinity)`);
  const box = styles(session, selector);
  const viewport = `${output}/viewport-${session}.png`;
  command(session, 'screenshot', viewport);
  const metadata = await sharp(viewport).metadata();
  const left = Math.max(0, Math.round(box.rect.x)), top = Math.max(0, Math.round(box.rect.y));
  const width = Math.min(metadata.width - left, Math.round(box.rect.width)), height = Math.min(metadata.height - top, Math.round(box.rect.height));
  if (width <= 0 || height <= 0) throw Error(`Offscreen crop ${name}`);
  await sharp(viewport).extract({ left, top, width, height }).png().toFile(`${output}/${name}.png`);
  return { ...box, screenshot: `${output}/${name}.png`, clipped: width < Math.round(box.rect.width) || height < Math.round(box.rect.height) };
}
const report = { at: new Date().toISOString(), browser: 'agent-browser Chrome 150', stateComparisons: [], courses: [], limitations: [
  'Branding and local course access remain intentional differences. Source account/payment actions and locked lessons are not reproduced as restrictions.',
  'Completed source appearance is rendered as an explicitly labelled source-component fixture, not an authenticated completed lesson.',
  'Pixel metrics describe screenshot crops, not a whole-site equality claim. Different source text/access state is not silently masked.',
] };
async function navigate(session, url, selector, title) {
  evaluate(session, `location.href=${JSON.stringify(url)};true`);
  wait(session, `document.querySelector(${JSON.stringify(selector)})?.textContent.trim()===${JSON.stringify(title)}`);
  wait(session, `document.fonts.status==='loaded' && [...document.images].every(i=>i.complete)`);
  // Source and local solo pages intentionally perform delayed (400ms) automatic positioning.
  evaluate(session, `window.__visualReadyAt=performance.now();true`);
  wait(session, `performance.now()-window.__visualReadyAt>700`);
  evaluate(session, `window.scrollTo({top:0,left:0,behavior:'instant'});document.querySelector('.courses_body__1xrEB,.co-article-scroll')?.scrollTo({top:0,left:0,behavior:'instant'});true`);
}
const catalog = JSON.parse(await fs.readFile('public/content/catalog.json', 'utf8'));
if (process.argv.includes('--all-courses')) {
  const sourceSession = 'catalog-fidelity-full-source';
  for (const course of catalog.courses) {
    const article = course.is_educative;
    const sourceUrl = article ? `https://edu.py2fun.com/course/${course.course_no}/overview` : `https://edu.py2fun.com/learn#/course/${course.course_no}/catalog`;
    const entry = { course: course.course_no, title: course.title, family: article ? 'article' : 'solo', sides: {} };
    for (const side of ['source', 'local']) {
      const session = side === 'source' ? sourceSession : localSession;
      command(session, 'set', 'viewport', '1280', '900');
      await navigate(session, side === 'source' ? sourceUrl : `http://127.0.0.1:5173/#/course/${course.course_no}/catalog`, side === 'source' ? article ? '.overview_row__3n6Vw h1' : '._name_1sclx_53' : article ? '.co-article-body h1' : '.co-hero h1', course.title);
      const imageSelector = side === 'source' ? article ? '.overview_main__1G8zf img' : '._courseCatalog_1sclx_1 img' : article ? '.co-article-main img' : '.co-solo main img';
      const images = evaluate(session, `[...document.querySelectorAll(${JSON.stringify(imageSelector)})].map(e=>({src:e.src,loaded:e.complete&&e.naturalWidth>0,natural:[e.naturalWidth,e.naturalHeight],box:[e.getBoundingClientRect().width,e.getBoundingClientRect().height]}))`);
      const path = `${output}/course-${course.course_no}-${side}.png`;
      command(session, 'screenshot', path);
      // Crop the retained screenshot below the deliberately retained branding area.
      await sharp(path).extract({ left: 0, top: article ? 72 : 110, width: 1280, height: article ? 828 : 790 }).png().toFile(`${output}/course-${course.course_no}-${side}-content.png`);
      entry.sides[side] = { screenshot: path, images, brokenImages: images.filter(i => i.src && !i.loaded), originalEmptySlots: images.filter(i => !i.src) };
    }
    report.courses.push(entry);
    console.log(JSON.stringify({ course: course.course_no, images: Object.fromEntries(Object.entries(entry.sides).map(([k,v])=>[k,{count:v.images.length,broken:v.brokenImages.length}])) }));
  }
  for (let sheet = 0; sheet < 4; sheet++) {
    const subset = report.courses.slice(sheet * 7, sheet * 7 + 7), parts = [];
    for (let row = 0; row < subset.length; row++) {
      const course = subset[row];
      for (let side = 0; side < 2; side++) {
        const label = side ? 'LOCAL' : 'SOURCE';
        parts.push({ input: await sharp(`${output}/course-${course.course}-${side ? 'local' : 'source'}-content.png`).resize({ width: 640, height: 414, fit: 'contain', background: '#fff' }).toBuffer(), left: side * 640, top: row * 450 + 36 });
        parts.push({ input: Buffer.from(`<svg width="640" height="36"><rect width="640" height="36" fill="#e8eaf0"/><text x="12" y="24" font-size="18" font-family="sans-serif">${course.course} ${course.family} ${label}</text></svg>`), left: side * 640, top: row * 450 });
      }
    }
    await sharp({ create: { width: 1280, height: subset.length * 450, channels: 3, background: '#fff' } }).composite(parts).png().toFile(`${output}/all-courses-sheet-${sheet + 1}.png`);
  }
}
if (process.argv.includes('--all-courses')) await fs.writeFile(`${output}/all-courses.json`, JSON.stringify(report, null, 2) + '\n');
export { command, evaluate, wait, navigate, capture, styles, output, report, localSession };
