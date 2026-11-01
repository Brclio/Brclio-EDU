import fs from 'node:fs';
import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import katex from 'katex';
import { courseMathMarkdown } from '../src/content-math.ts';

const markdown = unified().use(remarkParse).use(remarkGfm);
const mathMarkdown = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const markdownTypes = new Set(['MarkdownEditor', 'Markdown', 'Text', 'Note', 'SpoilerEditor']);
export const fieldKey = item => `${item.file}#${item.trail}`;
export function visit(node, callback) {
  callback(node);
  node.children?.forEach(child => visit(child, callback));
}

// This is an existing source typo, not a renderer exception to silently broaden.
export function isKnownSourceError(formula) {
  return formula.file === 'pages/010-526.json'
    && formula.trail === '/components/4/content/text'
    && formula.value === 'O(log\\n)';
}

export function buildMathPlan(root) {
  const records = [];
  const add = (file, trail, kind, text) => {
    if (typeof text === 'string' && text) records.push({ file, trail, kind, text });
  };
  function collect(value, file, trail = '') {
    if (Array.isArray(value)) {
      value.forEach((child, index) => collect(child, file, `${trail}/${index}`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (markdownTypes.has(value.type)) {
      const content = value.content || {};
      add(file, `${trail}/content/text`, value.type, content.text || content.text_html || '');
    }
    if ('question_text' in value || 'question_text_html' in value) {
      add(file, `${trail}/question_text`, 'quiz', value.question_text || value.question_text_html || '');
      (value.question_options || []).forEach((option, index) => {
        const optionPath = `${trail}/question_options/${index}`;
        add(file, `${optionPath}/text`, 'option', option.text || option.text_html || '');
        add(file, `${optionPath}/explanation/md_text`, 'explanation',
          option.explanation?.md_text || option.explanation?.md_html || '');
      });
    }
    if ('challenge_id' in value && 'code_templates' in value) {
      for (const name of ['problem_statement_md', 'input_format_md', 'output_format_md', 'constraints_md', 'hint_md']) {
        add(file, `${trail}/${name}`, 'challenge', value[name] || '');
      }
    }
    for (const [name, child] of Object.entries(value)) {
      if (child && typeof child === 'object') collect(child, file, `${trail}/${name}`);
    }
  }
  let sourceFiles = 0;
  for (const group of ['pages', 'challenges']) {
    const directory = path.join(root, 'public/content', group);
    for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
      collect(JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')), `${group}/${name}`);
      sourceFiles++;
    }
  }

  const fields = [], formulas = [], errors = [];
  for (const record of records) {
    const adapted = courseMathMarkdown(record.text);
    const tree = mathMarkdown.parse(adapted);
    const nodes = [], literals = [], literalCode = [];
    visit(tree, node => {
      if (node.type === 'math' || node.type === 'inlineMath') nodes.push(node);
      if (['text', 'code', 'inlineCode'].includes(node.type) && node.value.trim().length >= 8) {
        literals.push(node.value);
      }
      if (['code', 'inlineCode'].includes(node.type) && node.value.includes('<katex>')) {
        literalCode.push(node.value);
      }
    });
    if (!nodes.length && !literalCode.length) continue;

    // Count structural content independently of the math transform. A mistaken
    // $$$$ fence must not turn following tables, headings or code into a formula.
    const structures = { heading: 0, code: 0, table: 0 };
    visit(markdown.parse(record.text), node => {
      if (node.type in structures) structures[node.type]++;
    });
    const expected = nodes.map(node => ({
      file: record.file, trail: record.trail, kind: record.kind,
      type: node.type, value: node.value, position: node.position,
    }));
    const sourceErrors = [];
    for (const formula of expected) {
      try {
        katex.renderToString(formula.value, { throwOnError: true, strict: 'ignore', trust: false });
      } catch (error) {
        sourceErrors.push({ ...formula, error: error.message, known: isKnownSourceError(formula) });
      }
    }
    formulas.push(...expected);
    errors.push(...sourceErrors);
    fields.push({ ...record, expected, sourceErrors, structures, literals, literalCode });
  }
  const countBy = (items, name) => items.reduce((counts, item) => {
    counts[item[name]] = (counts[item[name]] || 0) + 1;
    return counts;
  }, {});
  return {
    summary: {
      sourceFiles, markdownFields: records.length, selectedFields: fields.length,
      mathFields: fields.filter(field => field.expected.length).length,
      mathFiles: new Set(formulas.map(formula => formula.file)).size,
      formulas: formulas.length, byType: countBy(formulas, 'type'), byKind: countBy(formulas, 'kind'),
      sourceInvalidFormulas: errors.length, unexpectedSourceErrors: errors.filter(error => !error.known).length,
      literalCodeFields: fields.filter(field => field.literalCode.length).length,
    },
    fields, formulas, errors,
  };
}
