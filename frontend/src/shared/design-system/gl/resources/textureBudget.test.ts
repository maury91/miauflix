import { describe, expect, it } from 'vitest';

import { pickEvictions } from './textureBudget';

const MB = 1024 * 1024;

describe('pickEvictions', () => {
  it('frees nothing within the budget', () => {
    expect(pickEvictions([{ lastUsed: 1, bytes: 10 * MB }], 100 * MB, 100 * MB)).toEqual([]);
  });

  it('frees the least recently used until 90% of the budget', () => {
    const old = { lastUsed: 1, bytes: 5 * MB };
    const older = { lastUsed: 0, bytes: 4 * MB };
    const recent = { lastUsed: 9, bytes: 5 * MB };
    const newest = { lastUsed: 10, bytes: 5 * MB };

    expect(pickEvictions([recent, old, newest, older], 101 * MB, 100 * MB)).toEqual([
      older,
      old,
      recent,
    ]);
  });

  it('frees everything it can when that is not enough', () => {
    const only = { lastUsed: 0, bytes: MB };
    expect(pickEvictions([only], 200 * MB, 100 * MB)).toEqual([only]);
  });
});
