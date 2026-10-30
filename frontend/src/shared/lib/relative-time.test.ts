import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './relative-time';

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it.each([
    [10_000, 'just now'],
    [5 * 60_000, '5m ago'],
    [2 * 3_600_000, '2h ago'],
    [26 * 3_600_000, '1d ago'],
    [5 * 86_400_000, '5d ago'],
  ])('formats %ims as %s', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), now)).toBe(expected);
  });

  it('treats future timestamps as just now', () => {
    expect(formatRelativeTime(ago(-60_000), now)).toBe('just now');
  });

  it('falls back to a short date after four weeks', () => {
    expect(formatRelativeTime(ago(40 * 86_400_000), now)).toMatch(/Sep/);
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatRelativeTime('nope', now)).toBe('');
  });
});
