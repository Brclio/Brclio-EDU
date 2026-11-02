import test from 'node:test';
import assert from 'node:assert/strict';
import { courseMathMarkdown } from '../src/content-math.ts';
test('source custom tags and quoted code stay literal; empty formula does not consume following content', () => {
  assert.equal(courseMathMarkdown('复杂度是<katex>O(n^2)</katex>。'), '复杂度是<katex>O(n^2)</katex>。');
  const literal = '`<katex>θ(n^3)</katex>` 与 ```html\n<katex>x</katex>\n```';
  assert.equal(courseMathMarkdown(literal), literal);
  assert.equal(courseMathMarkdown('$$ \\dfrac{G Mm}{r^2}$$'), '$$ \\dfrac{G Mm}{r^2}$$');
  assert.equal(courseMathMarkdown('before\n$$$$\n|table|\n\n## heading'), 'before\n\n|table|\n\n## heading');
  assert.equal(courseMathMarkdown('```text\n$$$$\n```'), '```text\n$$$$\n```');
});
