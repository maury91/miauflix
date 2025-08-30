import { formatCode } from './formatCode';

describe('formatCode', () => {
  it('should format standard 8-character codes correctly', () => {
    expect(formatCode('ABCD1234')).toBe('ABCD 1234');
    expect(formatCode('XYZ89012')).toBe('XYZ8 9012');
  });

  it('should format 12-character codes correctly', () => {
    expect(formatCode('ABC123DEF456')).toBe('ABC1 23DEF456');
    expect(formatCode('XYZABCDEF123')).toBe('XYZA BCDEF123');
  });

  it('should handle codes shorter than 4 characters', () => {
    expect(formatCode('ABC')).toBe('ABC ');
    expect(formatCode('12')).toBe('12 ');
    expect(formatCode('')).toBe(' ');
  });

  it('should handle codes exactly 4 characters', () => {
    expect(formatCode('ABCD')).toBe('ABCD ');
  });

  it('should handle very long codes', () => {
    expect(formatCode('ABCDEFGHIJKLMNOP')).toBe('ABCD EFGHIJKLMNOP');
  });
});
