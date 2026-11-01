import type { AtRule, Declaration, Plugin, Rule } from 'postcss';

import { legacyDeclarations, legacyUnits, pairSides } from './legacy-css';

/**
 * The build-time counterpart of legacy-chromium.ts, for stylesheets extracted at build time
 * (vanilla-extract `*.css.ts`, global.css): the Samsung TV build runs it over them, so Chromium 69
 * gets CSS it parses without anything compiled in the browser.
 *
 * It applies the same rewrites, except that nothing is resolved against a viewport: the build
 * doesn't know the TV's. So `clamp()`, `min()` and `max()` fail the build (size with `vh`, `rem` or
 * `em` instead, see docs/development/css-architecture.md), and `aspect-ratio` becomes a height in
 * the width's own unit (`18em` wide at 16 / 9 is `10.125em` high).
 */

const GAP_PROPERTIES = new Set(['gap', 'row-gap', 'column-gap']);
const COMPARISON = /\b(clamp|min|max)\(/;
const LENGTH = /^(-?\d*\.?\d+)(px|em|rem|vw|vh|vmin|vmax)$/;

const isZero = (value: string): boolean => /^-?0*\.?0+([a-z]+)?$/.test(value.trim());
const rounded = (value: number): number => Number(value.toFixed(4));

function declarationsOf(rule: Rule): Declaration[] {
  return (rule.nodes ?? []).filter((node): node is Declaration => node.type === 'decl');
}

function lastValue(declarations: Declaration[], property: string): string | undefined {
  const found = declarations.filter(declaration => declaration.prop === property);
  return found[found.length - 1]?.value.trim();
}

const forEachSelector = (selectors: string[], suffix: string): string =>
  selectors.map(selector => `${selector}${suffix}`).join(',');

function rewriteDeclaration(declaration: Declaration): void {
  if (COMPARISON.test(declaration.value)) {
    throw declaration.error(
      'clamp(), min() and max() need the viewport, which the TV build cannot know: size with vh, rem or em'
    );
  }
  const value = legacyUnits(declaration.value);
  const replacements = legacyDeclarations(declaration.prop, value);
  if (!replacements) {
    declaration.value = value;
    return;
  }
  for (const [prop, replacement] of replacements) {
    declaration.cloneBefore({ prop, value: replacement });
  }
  declaration.remove();
}

/** Margins standing in for flex `gap`, which Chromium 69 only applies to grids. */
function replaceFlexGap(rule: Rule, selectors: string[], declarations: Declaration[]): void {
  const display = lastValue(declarations, 'display');
  if (!display || !/^(inline-)?flex$/.test(display)) return;
  const gaps = declarations.filter(declaration => GAP_PROPERTIES.has(declaration.prop));
  if (!gaps.length) return;

  let rowGap = '0';
  let columnGap = '0';
  for (const gap of gaps) {
    const value = legacyUnits(gap.value);
    if (gap.prop === 'gap') [rowGap, columnGap] = pairSides(value);
    else if (gap.prop === 'row-gap') rowGap = value;
    else columnGap = value;
    gap.remove();
  }

  const flow = lastValue(declarations, 'flex-flow') ?? '';
  const direction =
    lastValue(declarations, 'flex-direction') ??
    /\b(row|column)(-reverse)?\b/.exec(flow)?.[0] ??
    'row';
  const wraps = /(^|\s)wrap(-reverse)?(\s|$)/.test(lastValue(declarations, 'flex-wrap') ?? flow);
  // Pseudo-classes outrank the children's own single-class rules
  const between = forEachSelector(selectors, '>:not(:last-child)');
  const extra: string[] = [];

  if (direction.startsWith('column')) {
    const side = direction === 'column-reverse' ? 'margin-top' : 'margin-bottom';
    if (!isZero(rowGap)) extra.push(`${between}{${side}:${rowGap}}`);
  } else {
    const side = direction === 'row-reverse' ? 'margin-left' : 'margin-right';
    if (!isZero(columnGap)) extra.push(`${between}{${side}:${columnGap}}`);
    if (wraps && !isZero(rowGap)) {
      // Space the lines apart and take the space under the last line back from the container
      extra.push(`${forEachSelector(selectors, '>:nth-child(n)')}{margin-bottom:${rowGap}}`);
      const ownMargin = lastValue(declarations, 'margin-bottom') ?? '0px';
      rule.append({ prop: 'margin-bottom', value: `calc(${ownMargin} - ${rowGap})` });
    }
  }
  if (extra.length) rule.after(extra.join(''));
}

/** A height standing in for `aspect-ratio`. */
function replaceAspectRatio(rule: Rule, selectors: string[], declarations: Declaration[]): void {
  const ratioDeclaration = declarations.find(declaration => declaration.prop === 'aspect-ratio');
  if (!ratioDeclaration) return;
  const [widthPart, heightPart = '1'] = ratioDeclaration.value.split('/');
  const ratio = Number(widthPart) / Number(heightPart);
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  if (lastValue(declarations, 'height') !== undefined) {
    ratioDeclaration.remove();
    return;
  }

  const width = legacyUnits(lastValue(declarations, 'width') ?? '');
  const length = LENGTH.exec(width);
  if (length) {
    ratioDeclaration.replaceWith({
      prop: 'height',
      value: `${rounded(Number(length[1]) / ratio)}${length[2]}`,
    });
    return;
  }
  const percent = /^(\d*\.?\d+)%$/.exec(width);
  if (!percent || lastValue(declarations, 'padding') !== undefined) return;
  const position = lastValue(declarations, 'position');
  ratioDeclaration.replaceWith(
    { prop: 'height', value: '0' },
    { prop: 'padding-top', value: `${rounded(Number(percent[1]) / ratio)}%` }
  );
  if (position !== 'absolute' && position !== 'relative') {
    rule.append({ prop: 'position', value: 'relative' });
  }
  rule.after(
    `${forEachSelector(selectors, '>*')}{position:absolute;top:0;left:0;width:100%;height:100%}`
  );
}

function insideKeyframes(rule: Rule): boolean {
  return rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as AtRule).name);
}

function rewriteRule(rule: Rule): void {
  if (insideKeyframes(rule)) return;
  rule.selectors = rule.selectors.map(selector => selector.replace(/:focus-visible\b/g, ':focus'));
  // Extra rules can't hang off pseudo-elements (`::before > *` matches nothing)
  const elementSelectors = rule.selectors.filter(selector => !selector.includes('::'));
  if (!elementSelectors.length) return;
  replaceFlexGap(rule, elementSelectors, declarationsOf(rule));
  replaceAspectRatio(rule, elementSelectors, declarationsOf(rule));
}

export function legacyChromiumPostcss(): Plugin {
  return {
    postcssPlugin: 'miauflix-legacy-chromium',
    Once(root) {
      // Rules first: they read the declarations (gap, aspect-ratio) as written
      const rules: Rule[] = [];
      root.walkRules(rule => {
        rules.push(rule);
      });
      rules.forEach(rewriteRule);
      root.walkDecls(rewriteDeclaration);
    },
  };
}
