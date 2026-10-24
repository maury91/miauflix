import { describe, expect, it } from 'vitest';

import { composeHomeCategories, CONTINUE_CATEGORY } from './home-feed';

describe('composeHomeCategories', () => {
  const lists = [{ slug: 'trending' }, { slug: 'popular' }];

  it.each([
    [true, ['continue-watching', 'trending', 'popular']],
    [false, ['trending', 'popular']],
  ])('with Continue watching cards: %s', (hasContinue, expected) => {
    expect(composeHomeCategories(lists, hasContinue).map(row => row.slug)).toEqual(expected);
  });

  it('shows Continue watching alone before any list has loaded', () => {
    expect(composeHomeCategories([], true)).toEqual([CONTINUE_CATEGORY]);
    expect(composeHomeCategories([], false)).toEqual([]);
  });

  it('does not modify the lists it was given', () => {
    const input = [...lists];
    composeHomeCategories(input, true);
    expect(input).toEqual(lists);
  });
});
