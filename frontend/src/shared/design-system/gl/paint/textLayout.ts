/**
 * Text wrapped to `maxWidth` in at most `maxLines` lines, the last one ellipsized when the text
 * doesn't fit. Words longer than a line stay whole on their own line (then ellipsized if last).
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
  const last = lines.length - 1;
  if (last >= 0 && measure(lines[last]) > maxWidth) {
    let cut = lines[last];
    while (cut.length > 1 && measure(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
    lines[last] = `${cut.trimEnd()}…`;
  }
  return lines;
}
