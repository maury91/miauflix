/**
 * Text wrapped to `maxWidth` in at most `maxLines` lines, the last one ellipsized when the text
 * doesn't fit. A word longer than a line gets its own line, ellipsized.
 * `measure` gives a string's width in the font the text is drawn with.
 */
export function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let index = 0; index < words.length; index++) {
    const candidate = line ? `${line} ${words[index]}` : words[index];
    if (measure(candidate) <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = words[index];
    if (lines.length === maxLines) {
      line = '';
      // What's left goes into the last line's ellipsis
      lines[maxLines - 1] = `${lines[maxLines - 1]} ${words.slice(index).join(' ')}`;
      break;
    }
  }
  if (line) lines.push(line);
  return lines.map(line => (measure(line) > maxWidth ? ellipsize(measure, line, maxWidth) : line));
}

/**
 * The longest start of `text` that fits `maxWidth` with an ellipsis (at least one character).
 * A binary search: the last line of a long overview holds every word that didn't fit, and
 * trimming it a character at a time took about 150 measures (40 ms on the TV).
 */
function ellipsize(measure: (text: string) => number, text: string, maxWidth: number) {
  const fits = (length: number) => measure(`${text.slice(0, length).trimEnd()}…`) <= maxWidth;
  let low = 1;
  let high = text.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}
