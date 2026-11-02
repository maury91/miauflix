/**
 * Definitions are written for Go and .NET regular expressions. JavaScript lacks inline flag
 * groups such as `(?i)` and writes named groups `(?<n>` instead of `(?P<n>`, so those are
 * translated; anything else JavaScript rejects surfaces as an unsupported definition.
 */
export function toRegExp(pattern: string, flags = ''): RegExp {
  const collected = new Set(flags);
  let source = pattern;
  for (;;) {
    const match = /^\(\?([imsu]+)\)/.exec(source);
    if (!match) break;
    for (const flag of match[1]) collected.add(flag === 'u' ? '' : flag);
    source = source.slice(match[0].length);
  }
  source = source.replace(/\(\?P</g, '(?<');
  return new RegExp(source, [...collected].filter(Boolean).join(''));
}
