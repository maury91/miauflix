import { describe, expect, it } from 'bun:test';
import { retryAfterMs } from '../src/trakt-rate-limit';

describe('Trakt Retry-After', () => {
  it('honors delays longer than thirty seconds and HTTP dates', () => {
    const now = Date.parse('2026-10-04T10:00:00Z');
    expect(retryAfterMs('120', now)).toBe(120_000);
    expect(retryAfterMs('Sun, 04 Oct 2026 10:02:00 GMT', now)).toBe(120_000);
    expect(retryAfterMs(null, now)).toBe(5_000);
  });
});
