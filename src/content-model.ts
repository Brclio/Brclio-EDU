export type QuizOption = { text?: string; correct?: boolean; match_number?: number | string; [key: string]: any };

// The source renderer sorts matching options into an answer list. match_number
// is an ordering key, not a required consecutive blank number (e.g. 1, 2, 4).
export function orderedQuizAnswers(options: QuizOption[]) {
  return options.filter(option => Number(option.match_number) > 0 || option.correct === true)
    .sort((a, b) => Number(a.match_number || 0) - Number(b.match_number || 0));
}
export function quizBlankKeys(kind: string, text: string, options: QuizOption[]) {
  // Output questions can contain ordinary Python/Go brace syntax: {0}, T{5}.
  if (kind === 'type_in' || kind === 'typein') return ['0'];
  const keys = [...new Set(Array.from(text.matchAll(/__(\d+)__/g), match => match[1]))];
  return keys.length ? keys : orderedQuizAnswers(options).map((_, i) => String(i));
}
export function quizExpectedBlank(kind: string, options: QuizOption[], position: number) {
  const ordered = orderedQuizAnswers(options);
  if (kind === 'type_in' || kind === 'typein') return ordered.length ? ordered : options;
  return ordered[position] ? [ordered[position]] : [];
}
export function normalizeQuizAnswer(value: unknown) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

export function validQuizOrder(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && new Set(value).size === length
    && value.every(index => Number.isInteger(index) && index >= 0 && index < length);
}
export function shuffledQuizOrder(options: QuizOption[], reorder = false, random = Math.random) {
  const order = options.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const expected = orderedQuizAnswers(options);
  if (reorder && order.length > 1 && order.every((index, position) => options[index] === expected[position])) order.push(order.shift()!);
  return order;
}

export function codeNeedsInput(language: string, code: string) {
  const source = code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|^\s*#[^\n]*/gm, '');
  const patterns: Record<string, RegExp> = {
    python: /\binput\s*\(|\bsys\.stdin\b/,
    c: /\b(?:scanf|getchar|gets)\s*\(|\bf(?:gets|getc)\s*\([^;\n]*\bstdin\b/,
    cpp: /\b(?:scanf|getchar|gets)\s*\(|\bcin\s*>>|\bgetline\s*\([^;\n]*\bcin\b/,
    java: /\bSystem\.in\b/,
    go: /\bfmt\.Scan(?:ln|f)?\s*\(|\bos\.Stdin\b/,
    csharp: /\bConsole\.Read(?:Line|Key)?\s*\(/,
    ruby: /\bgets\b|\bSTDIN\b/,
    sh: /\bread\s+/, bash: /\bread\s+/,
  };
  return patterns[language]?.test(source) || false;
}
