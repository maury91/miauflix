import { KeyedTokenBucket } from './keyed-token-bucket';

describe('KeyedTokenBucket', () => {
  it('allows a burst up to capacity, then the refill rate', () => {
    let now = 0;
    const bucket = new KeyedTokenBucket(3, 2, () => now);
    expect([1, 2, 3, 4].map(() => bucket.take('a'))).toEqual([true, true, true, false]);
    expect(bucket.take('b')).toBe(true); // keys are independent
    now = 500; // one token back
    expect(bucket.take('a')).toBe(true);
    expect(bucket.take('a')).toBe(false);
  });

  it('forgets keys whose bucket refilled', () => {
    let now = 0;
    const bucket = new KeyedTokenBucket(3, 2, () => now);
    bucket.take('a');
    now = 30_000;
    bucket.take('b');
    expect(bucket.size).toBe(2);
    now = 61_000;
    bucket.take('b');
    expect(bucket.size).toBe(1);
  });
});
