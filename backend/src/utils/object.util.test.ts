
import { describe, expect,it } from 'bun:test';

import { objectKeys } from './object.util';

describe('objectKeys', () => {
  it('returns the keys of an object as typed array', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const keys = objectKeys(obj);
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for an empty object', () => {
    const obj = {};
    const keys = objectKeys(obj);
    expect(keys).toEqual([]);
  });
});
