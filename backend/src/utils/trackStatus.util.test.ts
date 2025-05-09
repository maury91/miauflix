import { describe, expect, it } from 'bun:test';

import { groupTimestampsByInterval } from './trackStatus.util';

describe('groupTimestampsByInterval', () => {
  it('groups timestamps into correct buckets', () => {
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;
    const timestamps = [now - fiveMin * 2, now - fiveMin * 2 + 1000, now - fiveMin, now];
    const buckets = groupTimestampsByInterval(timestamps, fiveMin, fiveMin * 3);
    expect(buckets.length).toBeGreaterThan(0);
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(4);
  });

  it('returns empty array if all timestamps are out of range', () => {
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;
    const timestamps = [now - fiveMin * 10];
    const buckets = groupTimestampsByInterval(timestamps, fiveMin, fiveMin);
    expect(buckets).toEqual([]);
  });
});
