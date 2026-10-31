import type { StyleSheetManager } from 'styled-components';
import { compile } from 'stylis';

/**
 * A styled-components (stylis) plugin for the Samsung TV build. 2020 TVs run Chromium 69, which
 * drops any declaration it can't parse and any rule with a selector it doesn't know, so it
 * rewrites what the app uses that Chromium 69 lacks into what it has:
 *
 * - `:focus-visible` (86) becomes `:focus`: a TV has no pointer, every focus is visible.
 * - `inset` and the logical shorthands `inset-inline`/`-block`, `margin-inline`/`-block` and
 *   `padding-inline`/`-block` (87) become their physical longhands (left-to-right).
 * - `dvh`/`svh`/`lvh` and the `w` units (108) become `vh`/`vw`; a TV viewport doesn't change.
 * - `clamp()`, `min()` and `max()` (79) are resolved to pixels against the current viewport and
 *   root font size. Arguments it can't resolve (`%`, `em`, `var()`, `calc()`) are left out: a
 *   `min()`/`max()` keeps the resolvable ones (on a TV-sized screen that is the cap), a `clamp()`
 *   keeps its preferred value.
 * - Flex `gap` (84) becomes margins on the children, when the same rule makes it a flex container.
 * - `aspect-ratio` (88) becomes a height: computed from a resolvable width, or for a percentage
 *   width, the `padding-top` percentage with the children stretched over it.
 * - `mask-image`/`mask` gain the `-webkit-` prefix, and `overflow-wrap: anywhere` (80) becomes
 *   `word-break: break-word`.
 *
 * Styles are compiled in the browser when a component first renders, so the viewport is the TV's.
 */

type StylisPlugin = NonNullable<
  React.ComponentProps<typeof StyleSheetManager>['stylisPlugins']
>[number];
type StylisElement = Parameters<StylisPlugin>[0];

export interface LegacyViewport {
  width: number;
  height: number;
  rootFontSize: number;
}

const DECLARATION = 'decl';
const RULESET = 'rule';
const GAP_PROPERTIES = new Set(['gap', 'row-gap', 'column-gap']);
/** Declarations their rule already rewrote (rules are visited before their declarations). */
const rewritten = new WeakSet<StylisElement>();

/** Split on top-level occurrences of `separator` (not inside parentheses). */
function splitTopLevel(value: string, separator: RegExp): string[] {
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
function toPixels(value: string, viewport: LegacyViewport): number | null {
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

const pixels = (value: number): string => `${Number(value.toFixed(2))}px`;

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

/** Rewrite the units and functions Chromium 69 lacks in a declaration value. */
export function resolveLegacyValue(value: string, viewport: LegacyViewport): string {
  let result = value.replace(/(\d*\.?\d+)[dsl]v([hw])\b/g, '$1v$2');
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

function pairSides(value: string): [string, string] {
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
function legacyDeclarations(property: string, value: string): [string, string][] | null {
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

function setDeclarations(element: StylisElement, declarations: [string, string][]): void {
  element.value = declarations
    .map(([property, value]: [string, string]) => `${property}:${value};`)
    .join('');
  element.return = '';
}

function rewriteDeclaration(element: StylisElement, viewport: LegacyViewport): void {
  if (rewritten.has(element)) return;
  const property = String(element.props);
  const original = String(element.children);
  const value = resolveLegacyValue(original, viewport);
  const declarations = legacyDeclarations(property, value);
  if (declarations) setDeclarations(element, declarations);
  else if (value !== original) setDeclarations(element, [[property, value]]);
}

function declarationsOf(rule: StylisElement): StylisElement[] {
  return Array.isArray(rule.children)
    ? rule.children.filter((child: StylisElement) => child.type === DECLARATION)
    : [];
}

function lastValue(declarations: StylisElement[], property: string): string | undefined {
  const found = declarations.filter((declaration: StylisElement) => declaration.props === property);
  const last = found[found.length - 1];
  return last === undefined ? undefined : String(last.children).trim();
}

function drop(declaration: StylisElement): void {
  setDeclarations(declaration, []);
  rewritten.add(declaration);
}

const forEachSelector = (selectors: string[], suffix: string): string =>
  selectors.map((selector: string) => `${selector}${suffix}`).join(',');

/** Margins standing in for flex `gap`, which Chromium 69 only applies to grids. */
function flexGapRules(
  selectors: string[],
  declarations: StylisElement[],
  viewport: LegacyViewport
): string {
  const display = lastValue(declarations, 'display');
  if (!display || !/^(inline-)?flex$/.test(display)) return '';
  const gaps = declarations.filter((declaration: StylisElement) =>
    GAP_PROPERTIES.has(String(declaration.props))
  );
  if (!gaps.length) return '';

  let rowGap = '0';
  let columnGap = '0';
  for (const gap of gaps) {
    const value = resolveLegacyValue(String(gap.children), viewport);
    if (gap.props === 'gap') [rowGap, columnGap] = pairSides(value);
    else if (gap.props === 'row-gap') rowGap = value;
    else columnGap = value;
    drop(gap);
  }

  const flow = lastValue(declarations, 'flex-flow') ?? '';
  const direction =
    lastValue(declarations, 'flex-direction') ??
    /\b(row|column)(-reverse)?\b/.exec(flow)?.[0] ??
    'row';
  const wrap = lastValue(declarations, 'flex-wrap') ?? flow;
  const wraps = /(^|\s)wrap(-reverse)?(\s|$)/.test(wrap);
  // Pseudo-classes outrank the children's own single-class rules
  const between = forEachSelector(selectors, '>:not(:last-child)');
  const children = forEachSelector(selectors, '>:nth-child(n)');
  const isZero = (value: string): boolean => toPixels(value, viewport) === 0;

  if (direction.startsWith('column')) {
    if (isZero(rowGap)) return '';
    const side = direction === 'column-reverse' ? 'margin-top' : 'margin-bottom';
    return `${between}{${side}:${rowGap};}`;
  }
  const side = direction === 'row-reverse' ? 'margin-left' : 'margin-right';
  let rules = isZero(columnGap) ? '' : `${between}{${side}:${columnGap};}`;
  if (wraps && !isZero(rowGap)) {
    // Space the lines apart and take the space under the last line back from the container, in
    // the rule itself so its own margin-bottom doesn't override it
    rules += `${children}{margin-bottom:${rowGap};}`;
    const margins = declarations.filter(
      (declaration: StylisElement) => declaration.props === 'margin-bottom'
    );
    const margin = margins[margins.length - 1] ?? gaps[0];
    const ownMargin =
      margin === gaps[0] ? '0px' : resolveLegacyValue(String(margin.children), viewport);
    setDeclarations(margin, [['margin-bottom', `calc(${ownMargin} - ${rowGap})`]]);
    rewritten.add(margin);
  }
  return rules;
}

/** A height standing in for `aspect-ratio`. */
function aspectRatioRules(
  selectors: string[],
  declarations: StylisElement[],
  viewport: LegacyViewport
): string {
  const ratioDeclaration = declarations.find(
    (declaration: StylisElement) => declaration.props === 'aspect-ratio'
  );
  if (!ratioDeclaration) return '';
  const [widthPart, heightPart = '1'] = String(ratioDeclaration.children).split('/');
  const ratio = Number(widthPart) / Number(heightPart);
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  drop(ratioDeclaration);
  if (lastValue(declarations, 'height') !== undefined) return '';

  const width = resolveLegacyValue(lastValue(declarations, 'width') ?? '', viewport);
  const widthPixels = toPixels(width, viewport);
  if (widthPixels != null) return `${selectors.join(',')}{height:${pixels(widthPixels / ratio)};}`;

  const percent = /^(\d*\.?\d+)%$/.exec(width);
  if (!percent || lastValue(declarations, 'padding') !== undefined) return '';
  const position = lastValue(declarations, 'position');
  return (
    `${selectors.join(',')}{height:0;padding-top:${Number((Number(percent[1]) / ratio).toFixed(4))}%;` +
    `${position === 'absolute' || position === 'relative' ? '' : 'position:relative;'}}` +
    `${forEachSelector(selectors, '>*')}{position:absolute;top:0;left:0;width:100%;height:100%;}`
  );
}

function rewriteRule(rule: StylisElement, viewport: LegacyViewport): string {
  const selectors = (Array.isArray(rule.props) ? rule.props : [String(rule.props)]).map(
    (selector: string) => selector.replace(/:focus-visible\b/g, ':focus')
  );
  rule.props = selectors;
  if (rule.parent?.type === '@keyframes') return '';
  // Extra rules can't hang off pseudo-elements (`::before > *` matches nothing)
  const elementSelectors = selectors.filter((selector: string) => !selector.includes('::'));
  if (!elementSelectors.length) return '';
  const declarations = declarationsOf(rule);
  return (
    flexGapRules(elementSelectors, declarations, viewport) +
    aspectRatioRules(elementSelectors, declarations, viewport)
  );
}

export function createLegacyChromiumPlugin(viewport: () => LegacyViewport): StylisPlugin {
  const plugin: StylisPlugin = (
    element: StylisElement,
    index: number,
    siblings: StylisElement[]
  ): void => {
    if (element.type === DECLARATION) rewriteDeclaration(element, viewport());
    if (element.type !== RULESET) return;
    const extraRules = rewriteRule(element, viewport());
    if (!extraRules) return;
    // styled-components keeps only each rule's own output, so the extra rules go into the
    // stylesheet right after it, where they are serialized (and pass through here) like the rest
    const nodes = compile(extraRules).map((node: StylisElement) =>
      Object.assign(node, { root: element.root, parent: element.parent })
    );
    siblings.splice(index + 1, 0, ...nodes);
  };
  // styled-components tells plugins apart by name
  Object.defineProperty(plugin, 'name', { value: 'miauflix-legacy-chromium' });
  return plugin;
}

let cachedViewport: LegacyViewport | null = null;

/** The window's size and root font size, re-read after a resize. */
export function currentViewport(): LegacyViewport {
  if (!cachedViewport) {
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    cachedViewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      rootFontSize: Number.isFinite(rootFontSize) ? rootFontSize : 16,
    };
    window.addEventListener('resize', () => (cachedViewport = null), { once: true });
  }
  return cachedViewport;
}

export const legacyChromiumPlugin: StylisPlugin = createLegacyChromiumPlugin(currentViewport);
