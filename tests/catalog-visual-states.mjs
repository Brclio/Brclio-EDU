import fs from 'node:fs/promises';
import sharp from 'sharp';
import { command, evaluate, wait, navigate, capture, output } from './catalog-visual-review.mjs';
const local = 'visual-catalog-states';
const comparisons = [];
async function pair(name, source, selector, localSelector, { hover = false, note = '' } = {}) {
  const result = { name, hover, note };
  for (const [side, session, sel] of [['source',source,selector],['local',local,localSelector]]) {
    evaluate(session, `document.querySelector(${JSON.stringify(sel)}).scrollIntoView({behavior:'instant',block:'center'});true`);
    command(session, 'hover', hover ? sel : 'body');
    wait(session, `document.getAnimations().every(a=>a.playState==='finished'||a.effect?.getTiming().iterations===Infinity)`);
    result[side] = await capture(session, sel, `${name}-${side}`, false);
  }
  const a = await sharp(result.source.screenshot).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const b = await sharp(result.local.screenshot).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if (a.info.width === b.info.width && a.info.height === b.info.height) {
    let changed = 0, totalDifference = 0;
    for (let i = 0; i < a.data.length; i += 4) { const difference = Math.max(...[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[i+c]))); if (difference > 8) changed++; totalDifference += difference; }
    result.pixels = { width:a.info.width,height:a.info.height,changedOver8:changed,changedPercent:changed/(a.info.width*a.info.height)*100,meanMaxChannelDifference:totalDifference/(a.info.width*a.info.height) };
  } else result.pixels = { dimensionsDiffer:true,source:[a.info.width,a.info.height],local:[b.info.width,b.info.height] };
  comparisons.push(result); console.log(JSON.stringify({name,pixels:result.pixels}));
}
for (const session of [local,'edu-catalog-reference','edu-catalog-style','edu-overview-style']) command(session,'set','viewport','1280','900');
await navigate(local,'http://127.0.0.1:5173/#/course/list','.cc-card-copy h2','Python 小白入门课New');
await pair('list-card','edu-catalog-reference','._course-card_nf0sm_11','.cc-card');
await pair('list-button','edu-catalog-reference','._course-card_nf0sm_11 button','.cc-study');
await pair('list-button-hover','edu-catalog-reference','._course-card_nf0sm_11 button','.cc-study',{hover:true});
await pair('list-card-hover','edu-catalog-reference','._course-card_nf0sm_11','.cc-card',{hover:true});
await pair('list-tab-selected','edu-catalog-reference','._tab_1wixy_1','[role=tab]');
await pair('list-tab-hover','edu-catalog-reference','._tab_1wixy_1:nth-child(2)','[role=tab]:nth-child(2)',{hover:true});
evaluate(local,`localStorage.clear();true`);
await navigate(local,`http://127.0.0.1:5173/?visual=${Date.now()}#/course/015/catalog`,'.co-hero h1','Python 小白入门课New');
await pair('solo-stat-tags','edu-catalog-style','._tags_1sclx_59>div:first-child','.co-hero-tags>div');
await pair('solo-chapter-name','edu-catalog-style','._header_1gkvy_6>div:first-child','.co-chapter-name');
await pair('solo-chapter-arrow-open','edu-catalog-style','._arrow_1gkvy_67','.co-chapter-arrow');
await pair('solo-lesson','edu-catalog-style','._pageCard_jevq3_1','.co-lesson-card');
await pair('solo-lesson-hover','edu-catalog-style','._pageCard_jevq3_1','.co-lesson-card',{hover:true});
command('edu-catalog-style','click','._header_1gkvy_6');command(local,'click','.co-chapter-header');
await pair('solo-chapter-arrow-closed','edu-catalog-style','._arrow_1gkvy_67','.co-chapter-arrow');
command('edu-catalog-style','click','._header_1gkvy_6');command(local,'click','.co-chapter-header');
// Explicit source fixture uses its real done classes, text and raster icon; it is not an account result.
evaluate('edu-catalog-style',`(()=>{const e=document.querySelector('._pageCard_jevq3_1');window.__visualSourceCard=e.outerHTML;e.classList.replace('_undo_jevq3_76','_done_jevq3_60');e.querySelector('._status_jevq3_34').textContent='已完成';return true})()`);
const course = JSON.parse(await fs.readFile('public/content/courses/015.json','utf8'));
const firstId = String(course.toc.categories[0].pages[0].id);
evaluate(local,`(()=>{const key='brclio-edu-progress-v1',now=new Date().toISOString(),value=JSON.stringify({version:1,updatedAt:now,lessons:{['015:'+${JSON.stringify(firstId)}]:{completed:true,updatedAt:now}}});localStorage.setItem(key,value);window.dispatchEvent(new StorageEvent('storage',{key,newValue:value}));return true})()`);
wait(local,`document.querySelector('.co-lesson-card')?.classList.contains('co-done')`);
await pair('solo-completed-fixture','edu-catalog-style','._pageCard_jevq3_1','.co-lesson-card',{note:'Source done-class fixture from public source implementation; local state changed through its supported storage event.'});
evaluate('edu-catalog-style',`document.querySelector('._pageCard_jevq3_1').outerHTML=window.__visualSourceCard;true`);
await navigate(local,'http://127.0.0.1:5173/#/course/002/catalog','.co-article-body h1','从零开始学Python');
await pair('article-stats','edu-overview-style','.overview_row__3n6Vw>.ant-col:first-child>.ant-space','.co-article-stats');
await pair('article-feature','edu-overview-style','.overview_row__3n6Vw>.ant-col:first-child>.ant-row','.co-learning-features');
await pair('article-chapter-open','edu-overview-style','.ant-collapse-header','.co-article-chapter');
await pair('article-preview-row','edu-overview-style','.ant-list-item','.co-article-lessons>a');
await pair('article-preview-row-hover','edu-overview-style','.ant-list-item','.co-article-lessons>a',{hover:true});
await pair('article-time','edu-overview-style','.overview_learnInfo__2TXa5>div:nth-last-child(2)','.co-article-time');
await pair('article-level','edu-overview-style','.overview_learnInfo__2TXa5>div:last-child','.co-article-level');
command('edu-overview-style','click','.ant-collapse-header');command(local,'click','.co-article-chapter');
await pair('article-chapter-closed','edu-overview-style','.ant-collapse-header','.co-article-chapter');
command('edu-overview-style','click','.ant-collapse-header');command(local,'click','.co-article-chapter');
await fs.writeFile(`${output}/states.json`,JSON.stringify({at:new Date().toISOString(),comparisons},null,2)+'\n');
const rows = comparisons.map(r=>`<section><h2>${r.name}</h2><p>${r.note||''}</p><div><figure><figcaption>原站</figcaption><img src="${r.name}-source.png"></figure><figure><figcaption>本地</figcaption><img src="${r.name}-local.png"></figure></div><small>${JSON.stringify(r.pixels)}</small></section>`).join('');
await fs.writeFile(`${output}/index.html`,`<!doctype html><meta charset="utf-8"><title>课程视觉细节对照</title><style>body{font:16px system-ui;padding:24px}section{border-top:1px solid #ddd;padding:16px}section>div{display:flex;gap:24px}figure{margin:0;min-width:300px}figcaption{padding:8px;background:#eee}img{display:block;max-width:600px;image-rendering:auto}small{color:#555}</style><h1>课程视觉细节：原站 / 本地</h1><p>1280×900，同版 Chromium。裁片来自完整视口截图，不修改页面外观。完成态原站样式是明确标注的组件 fixture。</p>${rows}`);
