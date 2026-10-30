/*
 * Built-ins the app and its dependencies use that Tizen 5.5 (Chromium 69, 2020 TVs) lacks.
 * Imported before anything else, so they exist when other modules evaluate.
 */

if (typeof globalThis === 'undefined') {
  (window as unknown as { globalThis: Window }).globalThis = window;
}

if (typeof window.queueMicrotask !== 'function') {
  window.queueMicrotask = callback => {
    Promise.resolve()
      .then(callback)
      .catch(error =>
        setTimeout(() => {
          throw error;
        })
      );
  };
}

if (typeof Object.fromEntries !== 'function') {
  Object.fromEntries = <T>(entries: Iterable<readonly [PropertyKey, T]>) => {
    const result: Record<PropertyKey, T> = {};
    for (const [key, value] of entries) result[key] = value;
    return result;
  };
}

type Replacement = string | ((substring: string, ...args: unknown[]) => string);
// The app's TypeScript lib predates replaceAll (ES2021), so describe it here.
const stringPrototype = String.prototype as {
  replaceAll?: (this: string, search: string | RegExp, replacement: Replacement) => string;
};

if (typeof stringPrototype.replaceAll !== 'function') {
  stringPrototype.replaceAll = function (search, replacement) {
    const replace = this.replace.bind(this) as (pattern: RegExp, with_: Replacement) => string;
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
      return replace(search, replacement);
    }
    return replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
  };
}
