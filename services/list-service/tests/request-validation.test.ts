import { describe, expect, it } from 'bun:test';

import { parsePositivePage } from '../src/request-validation';

describe('list page validation', () => {
  it('defaults an omitted page to the first page', () => {
    expect(parsePositivePage(null)).toBe(1);
  });

  it('accepts only positive safe integers', () => {
    expect(parsePositivePage('1')).toBe(1);
    expect(parsePositivePage('50')).toBe(50);
    expect(parsePositivePage('0')).toBeNull();
    expect(parsePositivePage('1.5')).toBeNull();
    expect(parsePositivePage('abc')).toBeNull();
    expect(parsePositivePage(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
  });
});
