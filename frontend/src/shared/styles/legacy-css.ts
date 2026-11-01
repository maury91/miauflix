/**
 * The declaration-level CSS rewrites Chromium 69 (2020 Samsung TVs) needs, shared by the runtime
 * stylis plugin for styled-components (legacy-chromium.ts) and the build-time PostCSS pass for
 * extracted stylesheets (legacy-chromium-postcss.ts). Plain string functions, no dependencies.
 */

export interface LegacyViewport {
  width: number;
  height: number;
  rootFontSize: number;
}

/** Split on top-level occurrences of `separator` (not inside parentheses). */
export function splitTopLevel(value: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && separator.test(char)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** A length in pixels, or null when it depends on layout (`%`, `em`, `var()`, `calc()`). */
export function toPixels(value: string, viewport: LegacyViewport): number | null {
  const match = /^(-?\d*\.?\d+)(px|rem|vw|vh|vmin|vmax)?$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  switch (match[2]) {
    case undefined:
      return amount === 0 ? 0 : null;
    case 'px':
      return amount;
    case 'rem':
      return amount * viewport.rootFontSize;
    case 'vw':
      return (amount * viewport.width) / 100;
    case 'vh':
      return (amount * viewport.height) / 100;
    case 'vmin':
      return (amount * Math.min(viewport.width, viewport.height)) / 100;
    case 'vmax':
      return (amount * Math.max(viewport.width, viewport.height)) / 100;
    default:
      return null;
  }
}

export const pixels = (value: number): string => `${Number(value.toFixed(2))}px`;

/** Replace one `clamp()`/`min()`/`max()` call (without nested ones) by a value Chromium 69 parses. */
function resolveComparison(name: string, args: string[], viewport: LegacyViewport): string {
  const resolved = args.map((arg: string) => toPixels(arg, viewport));
  if (name === 'clamp') {
    const [low, preferred, high] = resolved;
    if (low != null && preferred != null && high != null) {
      return pixels(Math.min(Math.max(preferred, low), high));
    }
    return args[1] ?? args[0] ?? '';
  }
  const known = resolved.filter((value: number | null): value is number => value != null);
  if (!known.length) return args[0] ?? '';
  return pixels(name === 'min' ? Math.min(...known) : Math.max(...known));
}

/** `dvh`/`svh`/`lvh` and the `w` units become `vh`/`vw`: a TV viewport doesn't change. */
export function legacyUnits(value: string): string {
  return value.replace(/(\d*\.?\d+)[dsl]v([hw])\b/g, '$1v$2');
}

/** Rewrite the units and functions Chromium 69 lacks in a declaration value. */
export function resolveLegacyValue(value: string, viewport: LegacyViewport): string {
  let result = legacyUnits(value);
  // Resolve the last call first: it holds no further calls, so nested ones resolve inside out.
  for (;;) {
    // No matchAll: Chromium 69 lacks it
    const pattern = /\b(clamp|min|max)\(/g;
    let call: RegExpExecArray | null = null;
    for (let found = pattern.exec(result); found; found = pattern.exec(result)) call = found;
    if (!call) return result;
    const start = call.index + call[0].length;
    let depth = 1;
    let end = start;
    for (; end < result.length && depth > 0; end++) {
      if (result[end] === '(') depth += 1;
      if (result[end] === ')') depth -= 1;
    }
    if (depth !== 0) return result;
    const args = splitTopLevel(result.slice(start, end - 1), /,/);
    result =
      result.slice(0, call.index) + resolveComparison(call[1], args, viewport) + result.slice(end);
  }
}

/** The four `top right bottom left` values of a 1–4 value box shorthand. */
function boxSides(value: string): [string, string, string, string] {
  const [top, right = top, bottom = top, left = right] = splitTopLevel(value, /\s/);
  return [top, right, bottom, left];
}

export function pairSides(value: string): [string, string] {
  const [start, end = start] = splitTopLevel(value, /\s/);
  return [start, end];
}

const LOGICAL_PAIRS: Record<string, [string, string]> = {
  'inset-inline': ['left', 'right'],
  'inset-block': ['top', 'bottom'],
  'margin-inline': ['margin-left', 'margin-right'],
  'margin-block': ['margin-top', 'margin-bottom'],
  'padding-inline': ['padding-left', 'padding-right'],
  'padding-block': ['padding-top', 'padding-bottom'],
};

/** The declarations to emit instead of `property: value`, or null to keep it. */
export function legacyDeclarations(property: string, value: string): [string, string][] | null {
  const important = /\s*!important\s*$/.exec(value);
  const plain = important ? value.slice(0, important.index) : value;
  const suffix = important ? ' !important' : '';
  const emit = (declarations: [string, string][]): [string, string][] =>
    declarations.map(([name, side]: [string, string]) => [name, `${side}${suffix}`]);

  if (property === 'inset') {
    const [top, right, bottom, left] = boxSides(plain);
    return emit([
      ['top', top],
      ['right', right],
      ['bottom', bottom],
      ['left', left],
    ]);
  }
  const pair = LOGICAL_PAIRS[property];
  if (pair) {
    const [start, end] = pairSides(plain);
    return emit([
      [pair[0], start],
      [pair[1], end],
    ]);
  }
  if (property === 'mask-image' || property === 'mask') {
    return emit([
      [`-webkit-${property}`, plain],
      [property, plain],
    ]);
  }
  if (property === 'overflow-wrap' && plain.trim() === 'anywhere') {
    return emit([
      ['overflow-wrap', 'break-word'],
      ['word-break', 'break-word'],
    ]);
  }
  return null;
}
