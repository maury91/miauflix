import { describe, expect, it } from 'vitest';

import { getNavigationResult } from './categoryNavigation';

describe('getNavigationResult', () => {
  it('bounds horizontal movement and supports row endpoints', () => {
    expect(getNavigationResult('ArrowLeft', 0, 10)).toEqual({ type: 'media', index: 0 });
    expect(getNavigationResult('ArrowRight', 9, 10)).toEqual({ type: 'media', index: 9 });
    expect(getNavigationResult('Home', 6, 10)).toEqual({ type: 'media', index: 0 });
    expect(getNavigationResult('End', 2, 10)).toEqual({ type: 'media', index: 9 });
  });

  it('returns explicit vertical row changes and ignores unrelated keys', () => {
    expect(getNavigationResult('ArrowUp', 4, 10)).toEqual({ type: 'category', delta: -1 });
    expect(getNavigationResult('ArrowDown', 4, 10)).toEqual({ type: 'category', delta: 1 });
    expect(getNavigationResult('Enter', 4, 10)).toBeNull();
  });
});
