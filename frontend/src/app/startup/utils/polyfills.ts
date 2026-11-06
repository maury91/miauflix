/*
 * Built-ins the app and its dependencies use that Tizen 5.5 (Chromium 69, 2020 TVs) lacks.
 * Imported before anything else, so they exist when other modules evaluate.
 */

if (typeof globalThis === 'undefined') {
  (window as unknown as { globalThis: Window }).globalThis = window;
}

if (typeof window.queueMicrotask !== 'function') {
  window.queueMicrotask = (callback: VoidFunction): void => {
    Promise.resolve()
      .then(callback)
      .catch((error: unknown) =>
        setTimeout(() => {
          throw error;
        })
      );
  };
}

if (typeof Object.fromEntries !== 'function') {
  Object.fromEntries = <T>(entries: Iterable<readonly [PropertyKey, T]>) => {
    const result: Record<PropertyKey, T> = {};
    // Own properties, like the native method: assigning `__proto__` would set the prototype
    for (const [key, value] of entries) {
      Object.defineProperty(result, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  };
}

type Replacement = string | ((substring: string, ...args: unknown[]) => string);
// The app's TypeScript lib predates replaceAll (ES2021), so describe it here.
const stringPrototype = String.prototype as {
  replaceAll?: (this: string, search: string | RegExp, replacement: Replacement) => string;
};

if (typeof stringPrototype.replaceAll !== 'function') {
  stringPrototype.replaceAll = function (
    this: string,
    search: string | RegExp,
    replacement: Replacement
  ): string {
    const replace = this.replace.bind(this) as (pattern: RegExp, with_: Replacement) => string;
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
      return replace(search, replacement);
    }
    return replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
  };
}

// three.js (WebGLRenderer) tracks geometries and textures with WeakRef and FinalizationRegistry
// (Chromium 84), only to forget objects collected without dispose(). Here the references stay
// strong and nothing is finalized: what the app never disposes stays until the renderer is
// disposed, which frees everything it tracked.
const legacyWindow = window as unknown as { WeakRef?: unknown; FinalizationRegistry?: unknown };

if (typeof legacyWindow.WeakRef !== 'function') {
  legacyWindow.WeakRef = class WeakRef<T extends object> {
    readonly #target: T;
    constructor(target: T) {
      this.#target = target;
    }
    deref(): T {
      return this.#target;
    }
  };
}

if (typeof legacyWindow.FinalizationRegistry !== 'function') {
  legacyWindow.FinalizationRegistry = class FinalizationRegistry {
    register(): void {}
    unregister(): boolean {
      return false;
    }
  };
}
