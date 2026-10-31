import { compile, middleware, rulesheet, serialize, stringify } from 'stylis';
import { describe, expect, it } from 'vitest';

import type { LegacyViewport } from './legacy-chromium';
import { createLegacyChromiumPlugin, resolveLegacyValue } from './legacy-chromium';

const viewport: LegacyViewport = { width: 1920, height: 1080, rootFontSize: 16 };
const plugin = createLegacyChromiumPlugin(() => viewport);

/** Compile like styled-components does: the plugin, stringify, then keep each top-level rule. */
const legacy = (css: string): string => {
  const rules: string[] = [];
  serialize(
    compile(css),
    middleware([plugin, stringify, rulesheet((rule: string) => void rules.push(rule))])
  );
  return rules.join('');
};

describe('resolveLegacyValue', () => {
  it.each([
    ['clamp(1rem, 2vw, 3rem)', '38.4px'],
    ['clamp(1rem, 1vw, 3rem)', '19.2px'],
    ['clamp(1rem, 10vw, 3rem)', '48px'],
    ['min(52.5rem, 100%)', '840px'],
    ['min(440px, calc(100vw - var(--rail-width) - 24px))', '440px'],
    ['calc(max(5vw, 56px) + 2.4vw)', 'calc(96px + 2.4vw)'],
    ['max(min(10vw, 100px), 50px)', '100px'],
    ['min(100%, var(--x))', '100%'],
    ['clamp(1em, 2vw, 3em)', '2vw'],
    ['calc(100dvh - 2rem)', 'calc(100vh - 2rem)'],
    ['minmax(0, 1fr)', 'minmax(0, 1fr)'],
  ])('%s → %s', (value: string, expected: string) => {
    expect(resolveLegacyValue(value, viewport)).toBe(expected);
  });
});

describe('legacyChromiumPlugin', () => {
  it('expands inset and the logical shorthands', () => {
    expect(legacy('.a{inset:0;}')).toBe('.a{top:0;right:0;bottom:0;left:0;}');
    expect(legacy('.a{inset:1px calc(2px + 1rem);}')).toBe(
      '.a{top:1px;right:calc(2px + 1rem);bottom:1px;left:calc(2px + 1rem);}'
    );
    expect(legacy('.a{inset-inline:0 !important;}')).toBe(
      '.a{left:0 !important;right:0 !important;}'
    );
    expect(legacy('.a{margin-inline:auto;padding-block:1px 2px;}')).toBe(
      '.a{margin-left:auto;margin-right:auto;padding-top:1px;padding-bottom:2px;}'
    );
  });

  it('resolves comparison functions in declarations', () => {
    expect(legacy('.a{font-size:clamp(1rem,2vw,3rem);}')).toBe('.a{font-size:38.4px;}');
  });

  it('turns :focus-visible into :focus', () => {
    expect(legacy('.a:focus-visible .b{color:red;}')).toBe('.a:focus .b{color:red;}');
  });

  it('prefixes masks and replaces overflow-wrap: anywhere', () => {
    expect(legacy('.a{mask-image:linear-gradient(red,blue);}')).toBe(
      '.a{-webkit-mask-image:linear-gradient(red,blue);mask-image:linear-gradient(red,blue);}'
    );
    expect(legacy('.a{overflow-wrap:anywhere;}')).toBe(
      '.a{overflow-wrap:break-word;word-break:break-word;}'
    );
  });

  it('replaces flex gap with margins between the children', () => {
    expect(legacy('.a{display:flex;gap:1rem;}')).toBe(
      '.a{display:flex;}.a>:not(:last-child){margin-right:1rem;}'
    );
    expect(legacy('.a{display:flex;flex-direction:column;gap:8px 4px;}')).toBe(
      '.a{display:flex;flex-direction:column;}.a>:not(:last-child){margin-bottom:8px;}'
    );
    expect(legacy('.a{display:inline-flex;flex-direction:row-reverse;column-gap:4px;}')).toBe(
      '.a{display:inline-flex;flex-direction:row-reverse;}.a>:not(:last-child){margin-left:4px;}'
    );
  });

  it('spaces wrapped flex lines and takes the last line back', () => {
    expect(legacy('.a{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:2px;}')).toBe(
      '.a{display:flex;flex-wrap:wrap;margin-bottom:calc(2px - 8px);}' +
        '.a>:not(:last-child){margin-right:8px;}.a>:nth-child(n){margin-bottom:8px;}'
    );
  });

  it('keeps grid gap, which Chromium 69 supports', () => {
    expect(legacy('.a{display:grid;gap:clamp(1rem,2vw,3rem);}')).toBe(
      '.a{display:grid;gap:38.4px;}'
    );
  });

  it('replaces aspect-ratio with a height', () => {
    expect(legacy('.a{width:320px;aspect-ratio:16 / 9;}')).toBe(
      '.a{width:320px;}.a{height:180px;}'
    );
    expect(legacy('.a{width:100%;aspect-ratio:2 / 3;position:relative;}')).toBe(
      '.a{width:100%;position:relative;}' +
        '.a{height:0;padding-top:150%;}' +
        '.a>*{position:absolute;top:0;left:0;width:100%;height:100%;}'
    );
    expect(legacy('.a{width:10px;height:20px;aspect-ratio:1;}')).toBe(
      '.a{width:10px;height:20px;}'
    );
  });

  it('adds rules inside the same media query', () => {
    expect(legacy('@media (min-width: 1px){.a{display:flex;gap:2px;}}')).toBe(
      '@media (min-width: 1px){.a{display:flex;}.a>:not(:last-child){margin-right:2px;}}'
    );
  });

  it('leaves supported CSS alone', () => {
    const css = '.a{display:flex;margin:0 auto;color:red;}';
    expect(legacy(css)).toBe(css);
  });
});
