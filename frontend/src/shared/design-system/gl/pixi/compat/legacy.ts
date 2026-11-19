/**
 * String methods Pixi uses that Chromium 69 (the 2020 Samsung TVs) lacks: `replaceAll` (85, path
 * utilities) and `matchAll` (73, shader precision while the renderer initializes).
 */
const proto = String.prototype as unknown as Record<string, unknown>;

if (!proto['replaceAll'])
  proto['replaceAll'] = function (this: string, search: string | RegExp, replacement: string) {
    if (typeof search === 'string') return this.split(search).join(replacement);
    const flags = search.flags.includes('g') ? search.flags : `${search.flags}g`;
    return this.replace(new RegExp(search.source, flags), replacement);
  };

if (!proto['matchAll'])
  proto['matchAll'] = function (this: string, pattern: string | RegExp) {
    const source =
      typeof pattern === 'string' ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern.source;
    const flags =
      typeof pattern === 'string'
        ? 'g'
        : pattern.flags.includes('g')
          ? pattern.flags
          : `${pattern.flags}g`;
    const regex = new RegExp(source, flags);
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(this))) {
      matches.push(match);
      // An empty match moves on one character: a whole code point with the u flag (as the
      // spec's AdvanceStringIndex), or it lands inside a surrogate pair and matches forever
      if (match[0] === '') regex.lastIndex = advance(this, regex.lastIndex, regex.unicode);
    }
    return matches[Symbol.iterator]();
  };

function advance(text: string, index: number, unicode: boolean) {
  if (!unicode || index + 1 >= text.length) return index + 1;
  const first = text.charCodeAt(index);
  const second = text.charCodeAt(index + 1);
  return first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff
    ? index + 2
    : index + 1;
}
