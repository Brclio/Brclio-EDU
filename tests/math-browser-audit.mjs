// Start Vite, then: npx tsx tests/math-browser-audit.mjs --base=http://127.0.0.1:5173
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { buildMathPlan } from './math-audit-plan.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const separator = argument.indexOf('=');
  return separator < 0 ? [argument.replace(/^--/, ''), true]
    : [argument.slice(2, separator), argument.slice(separator + 1)];
}));
const base = String(args.base || 'http://127.0.0.1:5173').replace(/\/$/, '');
const origin = new URL(base).origin;
const output = path.resolve(root, String(args.output || 'tests/math-browser-audit.json'));
const normalize = value => value.replace(/\s+/g, '');
const plan = buildMathPlan(root);
if (typeof args.plan === 'string') fs.writeFileSync(path.resolve(root, args.plan), JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ plan: plan.summary }));
if (args['plan-only']) {
  process.exitCode = plan.summary.unexpectedSourceErrors ? 1 : 0;
} else {
  await audit();
}

function rendererHash() {
  const hash = createHash('sha256');
  for (const name of ['src/Content.tsx', 'src/content-math.ts', 'src/content.css']) {
    hash.update(fs.readFileSync(path.join(root, name)));
  }
  return hash.digest('hex');
}
async function audit() {
  const report = {
    startedAt: new Date().toISOString(), base, rendererHashBefore: rendererHash(), plan: plan.summary,
    expectedFormulas: plan.formulas.length, rows: [], externalRequests: [], fontRequests: [],
    fontFailures: [], pageErrors: [], sourceErrors: plan.errors,
    limitations: [
      'Each source Markdown, question, option or explanation field uses the actual shared Content Markdown renderer in the existing isolated harness.',
      'This audit does not repeat quiz submission, course navigation, code execution or screenshot pixel equivalence.',
      'Source formulas are checked against KaTeX annotations; headings, tables and code block counts come from the original Markdown before math adaptation.',
      'Non-math text fragments of at least eight characters and literal custom tags in code are checked for preservation; whitespace is normalized.',
    ],
  };
  const browser = await chromium.launch({ headless: true });
  let current;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (new URL(url).pathname === '/__math-audit.json') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          title: current.file,
          components: [{ type: 'MarkdownEditor', content: { comp_id: 'math-audit', text: current.text } }],
        }) });
        return;
      }
      if (/\.woff2?(\?|$)/.test(url)) report.fontRequests.push(url);
      if (new URL(url).origin === origin || /^(data:|blob:)/.test(url)) await route.continue();
      else { report.externalRequests.push(url); await route.abort(); }
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('requestfailed', request => {
      if (/\.woff2?(\?|$)/.test(request.url())) report.fontFailures.push({ url: request.url(), error: request.failure()?.errorText });
    });
    page.on('response', response => {
      if (/\.woff2?(\?|$)/.test(response.url()) && response.status() >= 400) {
        report.fontFailures.push({ url: response.url(), status: response.status() });
      }
    });
    await page.goto(`${base}/tests/browser-audit-harness.html`);
    await page.waitForFunction(() => Boolean(window.contentAudit));
    for (let index = 0; index < plan.fields.length; index++) {
      current = plan.fields[index];
      const rendered = await page.evaluate(async file => {
        const state = await window.contentAudit.render(file);
        const element = document.querySelector('.edu-markdown');
        if (!element) throw new Error('Content did not render a Markdown element');
        await document.fonts.ready;
        return {
          state, katex: element.querySelectorAll('.katex').length,
          fallbackErrors: element.querySelectorAll('.katex-error').length,
          sourceErrors: [...element.querySelectorAll('.katex-error, mstyle[mathcolor="#cc0000"]')]
            .map(node => ({ text: node.textContent, title: node.getAttribute('title') })),
          annotations: [...element.querySelectorAll('annotation[encoding="application/x-tex"]')].map(node => node.textContent),
          text: element.textContent,
          heading: element.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
          code: element.querySelectorAll('pre').length, table: element.querySelectorAll('table').length,
          codeTexts: [...element.querySelectorAll('code')].map(node => node.textContent),
        };
      }, `/__math-audit.json?field=${index}`);
      const missingLiterals = current.literals.filter(value => !normalize(rendered.text).includes(normalize(value)));
      const missingCode = current.literalCode.filter(value => !rendered.codeTexts.includes(value));
      const missingFormulas = current.expected.filter(formula =>
        !current.sourceErrors.some(error => error.value === formula.value) && !rendered.annotations.includes(formula.value));
      const problems = [];
      if (rendered.katex + rendered.fallbackErrors !== current.expected.length) problems.push('formula_count');
      if (rendered.sourceErrors.length !== current.sourceErrors.length) problems.push('source_error_count');
      if (current.sourceErrors.some(error => !error.known)) problems.push('unexpected_source_error');
      if (missingLiterals.length) problems.push('lost_literal_text');
      if (missingCode.length) problems.push('lost_literal_code');
      if (missingFormulas.length) problems.push('missing_formula');
      for (const kind of Object.keys(current.structures)) {
        if (rendered[kind] < current.structures[kind]) problems.push(`lost_${kind}`);
      }
      if (rendered.state.errors?.length) problems.push('render_error');
      report.rows.push({
        file: current.file, trail: current.trail, kind: current.kind,
        expected: current.expected.length, rendered: rendered.katex,
        sourceErrors: rendered.sourceErrors.length, structures: current.structures, problems,
        ...(problems.length ? { missingLiterals, missingCode, missingFormulas, actualErrors: rendered.sourceErrors } : {}),
      });
      if ((index + 1) % 50 === 0) console.log(JSON.stringify({
        completed: index + 1, total: plan.fields.length, failures: report.rows.filter(row => row.problems.length).length,
      }));
    }
  } catch (error) {
    report.fatalError = error.stack || error.message;
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.rendererHashAfter = rendererHash();
  report.summary = {
    fields: report.rows.length, formulas: report.rows.reduce((total, row) => total + row.rendered, 0),
    expectedSourceErrors: report.rows.reduce((total, row) => total + row.sourceErrors, 0),
    failures: report.rows.filter(row => row.problems.length).length,
    headings: report.rows.reduce((total, row) => total + row.structures.heading, 0),
    codeBlocks: report.rows.reduce((total, row) => total + row.structures.code, 0),
    tables: report.rows.reduce((total, row) => total + row.structures.table, 0),
    externalRequests: report.externalRequests.length, fontRequests: new Set(report.fontRequests).size,
    fontFailures: report.fontFailures.length, allFontsSameOrigin: report.fontRequests.every(url => new URL(url).origin === origin),
    pageErrors: report.pageErrors.length, sourceChangedDuringRun: report.rendererHashBefore !== report.rendererHashAfter,
  };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary));
  if (report.fatalError) console.error(report.fatalError);
  if (report.fatalError || report.summary.failures || report.summary.pageErrors || report.summary.fontFailures
    || report.summary.externalRequests || report.summary.sourceChangedDuringRun || report.rows.length !== plan.fields.length) {
    process.exitCode = 1;
  }
}
