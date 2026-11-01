import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

import { legacyChromiumPostcss } from './legacy-chromium-postcss';

const legacy = (css: string): string =>
  postcss([legacyChromiumPostcss()])
    .process(css, { from: undefined })
    .css.replace(/\s+/g, ' ')
    .replace(/\s*([{};:,>])\s*/g, '$1')
    .trim();

describe('legacyChromiumPostcss', () => {
  it('expands inset and the logical shorthands, keeping !important', () => {
    expect(legacy('.a{inset:auto 12px 12px}')).toBe(
      '.a{top:auto;right:12px;bottom:12px;left:12px}'
    );
    expect(legacy('.a{padding-inline:0 !important}')).toBe(
      '.a{padding-left:0 !important;padding-right:0 !important}'
    );
  });

  it('turns :focus-visible into :focus and the small/large/dynamic viewport units into vh/vw', () => {
    expect(legacy('.a:focus-visible:not(:disabled){height:100dvh;width:50svw}')).toBe(
      '.a:focus:not(:disabled){height:100vh;width:50vw}'
    );
  });

  it('prefixes masks and replaces overflow-wrap: anywhere', () => {
    expect(legacy('.a{mask-image:none;overflow-wrap:anywhere}')).toBe(
      '.a{-webkit-mask-image:none;mask-image:none;overflow-wrap:break-word;word-break:break-word}'
    );
  });

  it('replaces aspect-ratio with a height in the width’s own unit', () => {
    expect(legacy('.a{width:18em;aspect-ratio:16 / 9}')).toBe('.a{width:18em;height:10.125em}');
    expect(legacy('.a{width:320px;aspect-ratio:16/9}')).toBe('.a{width:320px;height:180px}');
    expect(legacy('.a{width:10em;height:2em;aspect-ratio:1}')).toBe('.a{width:10em;height:2em}');
  });

  it('replaces aspect-ratio of a percentage width with padding', () => {
    expect(legacy('.a{width:100%;aspect-ratio:2}')).toBe(
      '.a{width:100%;height:0;padding-top:50%;position:relative}' +
        '.a>*{position:absolute;top:0;left:0;width:100%;height:100%}'
    );
  });

  it('replaces flex gap with margins between the children', () => {
    expect(legacy('.a{display:flex;gap:1rem}')).toBe(
      '.a{display:flex}.a>:not(:last-child){margin-right:1rem}'
    );
    expect(legacy('.a{display:flex;flex-direction:column;row-gap:2vh}')).toBe(
      '.a{display:flex;flex-direction:column}.a>:not(:last-child){margin-bottom:2vh}'
    );
  });

  it('keeps grid gap, which Chromium 69 supports', () => {
    expect(legacy('.a{display:grid;gap:0.225em}')).toBe('.a{display:grid;gap:0.225em}');
  });

  it('adds rules inside the same media query and leaves keyframes alone', () => {
    expect(legacy('@media (min-width:1px){.a{display:flex;gap:1px}}')).toBe(
      '@media (min-width:1px){.a{display:flex}.a>:not(:last-child){margin-right:1px}}'
    );
    expect(legacy('@keyframes k{from{opacity:0}to{opacity:1}}')).toBe(
      '@keyframes k{from{opacity:0}to{opacity:1}}'
    );
  });

  it('fails the build on viewport-relative comparison functions', () => {
    expect(() => legacy('.a{width:clamp(1rem, 5vw, 3rem)}')).toThrow(
      /clamp\(\), min\(\) and max\(\)/
    );
    expect(() => legacy('.a{grid-template-columns:repeat(2, minmax(0, 1fr))}')).not.toThrow();
  });
});
