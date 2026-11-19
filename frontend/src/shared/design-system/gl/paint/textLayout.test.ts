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

  it('ellipsizes a long last line in a few measures', () => {
    let measures = 0;
    const counting = (text: string) => {
      measures++;
      return measure(text);
    };
    const words = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ');
    const lines = wrapText(counting, words, 200, 3);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith('…')).toBe(true);
    expect(measure(lines[2])).toBeLessThanOrEqual(200);
    const wrapping = measures;
    measures = 0;
    wrapText(counting, words, 200, 3);
    // The wrap measures each candidate line; the ellipsis adds a binary search, not one per character
    expect(wrapping).toBeLessThan(40);
  });
});
