import { describe, expect, it, spyOn } from 'bun:test';

import { logger } from '../src/logger';

describe('logger', () => {
  it.each([
    [
      'circular',
      () => {
        const value: Record<string, unknown> = {};
        value.self = value;
        return value;
      },
    ],
    ['BigInt', () => ({ count: 123n })],
  ] as const)('emits %s metadata without interrupting error handling', (_name, createMetadata) => {
    const output = spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const metadata = createMetadata();
      expect(() => logger.error('Test', 'An operation failed', metadata)).not.toThrow();
      expect(output).toHaveBeenCalledTimes(1);
      expect(output.mock.calls[0][0]).toContain('An operation failed');
      expect(output.mock.calls[0][1]).toBe(metadata);
    } finally {
      output.mockRestore();
    }
  });
});
