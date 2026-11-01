import { afterEach, describe, expect, it, vi } from 'vitest';

const nativeFromEntries = Object.fromEntries;

describe('Object.fromEntries polyfill', () => {
  afterEach(() => {
    Object.fromEntries = nativeFromEntries;
  });

  it('defines every entry as an own property, including __proto__', async () => {
    // Pretend to be Chromium 69, which lacks the method
    (Object as { fromEntries?: unknown }).fromEntries = undefined;
    vi.resetModules();
    await import('./polyfills');
    expect(Object.fromEntries).not.toBe(nativeFromEntries);

    const value = { polluted: true };
    const result = Object.fromEntries([
      ['a', 1],
      ['__proto__', value],
    ]) as Record<string, unknown>;

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')).toEqual({
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(result.a).toBe(1);
    expect(Object.keys(result)).toEqual(['a', '__proto__']);
  });
});
