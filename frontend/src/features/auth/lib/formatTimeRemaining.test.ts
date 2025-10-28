import { describe, expect, it } from 'vitest';

import { formatTimeRemaining } from './formatTimeRemaining';

describe('formatTimeRemaining', () => {
  it('should format seconds correctly', () => {
    expect(formatTimeRemaining(0)).toBe('0:00');
    expect(formatTimeRemaining(30)).toBe('0:30');
    expect(formatTimeRemaining(59)).toBe('0:59');
  });

  it('should format minutes correctly', () => {
    expect(formatTimeRemaining(60)).toBe('1:00');
    expect(formatTimeRemaining(90)).toBe('1:30');
    expect(formatTimeRemaining(120)).toBe('2:00');
  });

  it('should handle double-digit minutes', () => {
    expect(formatTimeRemaining(600)).toBe('10:00');
    expect(formatTimeRemaining(900)).toBe('15:00');
    expect(formatTimeRemaining(1800)).toBe('30:00');
  });

  it('should pad single-digit seconds with zero', () => {
    expect(formatTimeRemaining(61)).toBe('1:01');
    expect(formatTimeRemaining(305)).toBe('5:05');
    expect(formatTimeRemaining(3609)).toBe('60:09');
  });

  it('should handle large time values', () => {
    expect(formatTimeRemaining(3599)).toBe('59:59');
    expect(formatTimeRemaining(3600)).toBe('60:00');
    expect(formatTimeRemaining(7200)).toBe('120:00');
  });
});
