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
