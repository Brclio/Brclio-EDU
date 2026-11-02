/** Preserve source prose and code; match the source's empty math block handling. */
export function courseMathMarkdown(source: string) {
  let result = '', position = 0;
  while (position < source.length) {
    // Lute treats a standalone $$$$ as an empty formula. CommonMark math
    // otherwise consumes the following lesson as a four-dollar fenced block.
    if (position === 0 || source[position - 1] === '\n') {
      const end = source.indexOf('\n', position);
      if (source.slice(position, end < 0 ? source.length : end).trim() === '$$$$') {
        result += end < 0 ? '' : '\n'; position = end < 0 ? source.length : end + 1; continue;
      }
    }
    if (source[position] === '`' || source.startsWith('~~~', position)) {
      const character = source[position]; let length = 1;
      while (source[position + length] === character) length++;
      const marker = character.repeat(length), end = source.indexOf(marker, position + length);
      if (end >= 0) { result += source.slice(position, end + length); position = end + length; continue; }
    }
    result += source[position++];
  }
  return result;
}
