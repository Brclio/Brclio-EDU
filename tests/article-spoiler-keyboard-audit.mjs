import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const base = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch(), report = { at: new Date().toISOString(), base, checks: [] };
try {
  for (const key of ['Enter', 'Space']) {
    const context = await browser.newContext(), pages = { source: await context.newPage(), local: await context.newPage() };
    const component = { type: 'SpoilerEditor', content: { show_icon: true, show_hint_text: '提示1', hide_hint_text: '隐藏提示1', text: '思考一下该重复数字和它的索引。' } };
    const row = { key, sides: {} };
    for (const [side, page] of Object.entries(pages)) {
      await page.goto(base + (side === 'source' ? '/output/article-reference/index.html' : '/tests/visual-content-harness.html'));
      await page.evaluate(({ side, component }) => side === 'source' ? window.renderArticleReference([component]) : window.renderVisualContent([component], 'article'), { side, component });
      await page.evaluate(() => document.fonts.ready);
      const button = page.locator(side === 'source' ? '[data-component] button' : '.article-spoiler-button');
      const collapse = page.locator(side === 'source' ? '[class*=spoiler_collapse]' : '.article-spoiler-collapse');
      await button.focus(); await page.keyboard.press(key); await page.waitForTimeout(100);
      const wave = await button.evaluate(e => e.getAttribute('ant-click-animating-without-extra-node') ?? e.getAttribute('data-source-wave'));
      await page.waitForTimeout(1000);
      const open = await collapse.evaluate(e => ({ height: parseFloat(e.style.height), opacity: parseFloat(e.style.opacity) }));
      const openLabel = await button.innerText();
      await page.keyboard.press(key); await page.waitForTimeout(1100);
      const closed = await collapse.evaluate(e => ({ height: parseFloat(e.style.height), opacity: parseFloat(e.style.opacity) }));
      row.sides[side] = { wave, open, openLabel, closed, closedLabel: await button.innerText() };
    }
    row.pass = JSON.stringify(row.sides.source) === JSON.stringify(row.sides.local) && row.sides.source.wave === 'true' && row.sides.source.open.height > 0 && row.sides.source.open.opacity === 1 && row.sides.source.closed.height === 0 && row.sides.source.closed.opacity === 0;
    report.checks.push(row); console.log(key, row.pass); await context.close();
  }
} finally { report.pass = report.checks.length === 2 && report.checks.every(x => x.pass); await fs.writeFile('tests/article-spoiler-keyboard-audit.json', JSON.stringify(report, null, 2)); await browser.close(); }
if (!report.pass) process.exitCode = 1;
