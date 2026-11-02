import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const base = process.env.AUDIT_BASE || 'http://127.0.0.1:5173', out = 'output/animation-click-wave';
const sourceDirectory = process.env.SPOILER_SRC || 'src';
const page = JSON.parse(await fs.readFile('public/content/pages/004-117.json', 'utf8'));
const component = page.components.find(x => x.type === 'CanvasAnimation'), reference = structuredClone(component);
for (const frame of reference.content.canvas_objects) frame.svg_xml = await fs.readFile('public' + frame.file, 'utf8');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(), report = {
  at: new Date().toISOString(), base, sourceDirectory,
  implementationHashes: Object.fromEntries(await Promise.all(['ArticleAnimation.tsx', 'useSourceClickWave.ts', 'source-click-wave.css'].map(async f => [f, createHash('sha256').update(await fs.readFile(sourceDirectory + '/' + f)).digest('hex')]))),
  checks: [], errors: [],
};
try {
  for (const width of [1440, 390]) for (const [name, buttonIndex, setup] of [['next', 1, false], ['previous', 0, true], ['replay', 2, true]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const source = await context.newPage(), local = await context.newPage(), pairs = [[source, 'source'], [local, 'local']];
    await source.goto(base + '/output/article-reference/index.html');
    await local.goto(base + '/tests/visual-content-harness.html');
    await source.evaluate(c => window.renderArticleReference([c]), reference);
    await local.evaluate(c => window.renderVisualContent([c], 'article'), component);
    await local.locator('.edu-inline-svg>svg').first().waitFor();
    for (const [p, side] of pairs) {
      if (width < 414) await p.locator(side === 'source' ? '#root' : '.article-content').evaluate(e => e.style.width = 'calc(100% - 32px)');
      await p.evaluate(() => document.fonts.ready);
    }
    const buttons = [source.locator('[data-component] button'), local.locator('.edu-animation-controls button')];
    await source.waitForTimeout(100);
    if (setup) { for (const b of buttons) await b.nth(1).click(); await source.waitForTimeout(2200); }
    const counters = await Promise.all([source.locator('[class*=canvas-animation_extra]').innerText(), local.locator('.animation-counter').innerText()]);
    if (counters.some(c => c !== (setup ? '2/5' : '1/5'))) throw Error('Initial frame mismatch: ' + counters);

    // Bring hover to its settled style before the actual pointer click. The shared
    // context clock advances both original and local timers exactly once.
    for (let i = 0; i < pairs.length; i++) {
      const rect = await buttons[i].nth(buttonIndex).boundingBox();
      await pairs[i][0].mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
    await source.waitForTimeout(400);
    await source.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await source.clock.pauseAt(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < pairs.length; i++) { await pairs[i][0].mouse.down(); await pairs[i][0].mouse.up(); }
    await source.clock.runFor(16);
    // Let the native animationstart event arrive before Ant's ten-rAF guard
    // expires. Virtual rAF can otherwise outrun Chromium's CSS paint clock.
    await new Promise(resolve=>setTimeout(resolve,40));
    await source.clock.runFor(144);
    const row = { width, name, elapsed: 160, sides: {}, files: [] }, buffers = [];
    for (let i = 0; i < pairs.length; i++) {
      const [p, side] = pairs[i];
      // Playwright's virtual rAF clock does not control CSS animation timelines.
      // Align only the actual native CSS animations before comparing their paint.
      await p.evaluate(() => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 160; } });
      row.sides[side] = await buttons[i].nth(buttonIndex).evaluate(e => {
        const after = getComputedStyle(e, ':after');
        return { wave: e.getAttribute('ant-click-animating-without-extra-node') ?? e.getAttribute('data-source-wave'), opacity: after.opacity, shadow: after.boxShadow, radius: after.borderRadius };
      });
      const box = await p.locator(side === 'source' ? '[class*=canvas-animation_actions]' : '.edu-animation-controls').boundingBox();
      const file = `${out}/${width}-${name}-${side}.png`;
      buffers.push(await p.screenshot({ path: file, clip: { x: Math.floor(box.x) - 8, y: Math.floor(box.y) - 8, width: Math.ceil(box.width) + 16, height: Math.ceil(box.height) + 16 } })); row.files.push(file);
    }
    const [a, b] = await Promise.all(buffers.map(buffer => sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
    row.sameSize = a.info.width === b.info.width && a.info.height === b.info.height;
    let changed = 0;
    if (row.sameSize) for (let i = 0; i < a.data.length; i += 3) if (Math.max(...[0, 1, 2].map(k => Math.abs(a.data[i + k] - b.data[i + k]))) > 10) changed++;
    row.changedOver10 = changed;
    row.pass = row.sameSize && changed === 0 && Object.values(row.sides).every(x => x.wave === 'true');
    report.checks.push(row); console.log(width, name, row.changedOver10, row.pass);
    await context.close();
  }
} catch (error) { report.errors.push(error.stack); throw error; }
finally {
  report.pass = report.checks.length === 6 && report.checks.every(x => x.pass) && !report.errors.length;
  await fs.writeFile('tests/animation-click-wave-audit.json', JSON.stringify(report, null, 2)); await browser.close();
}
if (!report.pass) process.exitCode = 1;
