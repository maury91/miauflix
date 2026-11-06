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

describe('WeakRef and FinalizationRegistry polyfills', () => {
  const legacy = globalThis as { WeakRef?: unknown; FinalizationRegistry?: unknown };
  const nativeWeakRef = legacy.WeakRef;
  const nativeRegistry = legacy.FinalizationRegistry;

  afterEach(() => {
    legacy.WeakRef = nativeWeakRef;
    legacy.FinalizationRegistry = nativeRegistry;
  });

  it('lets three.js track objects on browsers without them', async () => {
    // Pretend to be Chromium 69, which lacks both
    legacy.WeakRef = undefined;
    legacy.FinalizationRegistry = undefined;
    vi.resetModules();
    await import('./polyfills');

    const Ref = legacy.WeakRef as new (target: object) => { deref(): object | undefined };
    const Registry = legacy.FinalizationRegistry as new (cleanup: (held: unknown) => void) => {
      register(target: object, held: unknown, token?: object): void;
      unregister(token: object): boolean;
    };
    const target = {};
    expect(new Ref(target).deref()).toBe(target);
    const registry = new Registry(() => undefined);
    registry.register(target, 1, target);
    expect(registry.unregister(target)).toBe(false);
  });
});
