import { describe, expect, it } from 'vitest';

import { wrapText } from './textLayout';

/** Every character 10 px wide. */
const measure = (text: string) => text.length * 10;

describe('wrapText', () => {
  it('keeps text that fits on one line', () => {
    expect(wrapText(measure, 'The Matrix', 200, 1)).toEqual(['The Matrix']);
  });

  it('wraps at word boundaries', () => {
    expect(wrapText(measure, 'one two three four', 90, 3)).toEqual(['one two', 'three', 'four']);
  });

  it('ellipsizes the last line with what is left', () => {
    expect(wrapText(measure, 'one two three four five', 90, 2)).toEqual(['one two', 'three fo…']);
  });

  it('ellipsizes a single word too long for the line', () => {
    expect(wrapText(measure, 'Supercalifragilistic', 60, 1)).toEqual(['Super…']);
  });

  it('ellipsizes a long word on a line before the last', () => {
    expect(wrapText(measure, 'abcdefghij ok', 60, 2)).toEqual(['abcde…', 'ok']);
  });

  it('collapses whitespace and handles empty text', () => {
    expect(wrapText(measure, '  a   b  ', 100, 1)).toEqual(['a b']);
    expect(wrapText(measure, '   ', 100, 1)).toEqual([]);
  });
});
