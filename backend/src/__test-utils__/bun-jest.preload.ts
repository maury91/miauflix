/**
 * Runs before every backend test file (bunfig.toml): fills in the Jest behaviour the tests rely on
 * that `bun test` lacks.
 *
 * - Manual mocks in `src/__mocks__` stand in for their module in every test, as Jest does for
 *   module names (`@logger`, `@database/database`, `parse-torrent`, ...), unless the test file
 *   calls `jest.unmock()` for it or imports the module by a relative path.
 * - Bun does not hoist `jest.mock()` above the test file's imports. The top-level
 *   `jest.mock('module')` (no factory) and `jest.unmock('module')` calls are read from the test
 *   file and applied here, before it loads. A `jest.mock()` with a factory still runs in place:
 *   Bun updates the bindings of modules that already imported the mocked one.
 * - `jest.mock('module')` without a factory and without a manual mock gets an automatic mock:
 *   functions and class methods become `jest.fn()`.
 * - `jest.requireActual()`, `jest.requireMock()`, `jest.unmock()` and `jest.mocked()`.
 * - Fake timers are Jest's "modern" ones, `@sinonjs/fake-timers`, with the async variants
 *   (`advanceTimersByTimeAsync`, ...).
 *
 * Needs `bun test --isolate`, which runs this file again for each test file.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- mock factories load modules synchronously */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import FakeTimers, { type InstalledClock } from '@sinonjs/fake-timers';
import { jest as bunJest, mock } from 'bun:test';

const SRC_DIR = dirname(import.meta.dir);
const MANUAL_MOCKS_DIR = join(SRC_DIR, '__mocks__');
/** Module names with a manual mock, which Jest applies without a `jest.mock()` call. */
const AUTOMATIC_MANUAL_MOCKS = [
  '@logger',
  '@database/database',
  '@utils/cacheable.util',
  '@utils/time',
  'parse-torrent',
];

const testFile = Bun.main;
const testDir = dirname(testFile);
const testSource = readFileSync(testFile, 'utf8');

const resolve = (specifier: string): string => Bun.resolveSync(specifier, testDir);

const manualMockFor = (specifier: string): string | undefined => {
  if (specifier.startsWith('.')) return undefined;
  for (const extension of ['.ts', '/index.ts']) {
    const path = join(MANUAL_MOCKS_DIR, `${specifier}${extension}`);
    if (existsSync(path)) return path;
  }
  return undefined;
};

/** What each mocked module (by resolved path) currently resolves to. */
const registered = new Map<string, () => unknown>();

const register = (path: string, factory: () => unknown): void => {
  let created: unknown;
  let made = false;
  const once = () => {
    if (!made) {
      created = factory();
      made = true;
    }
    return created;
  };
  registered.set(path, once);
  void mock.module(path, once as () => Record<string, unknown>);
};

// --- Automatic mocks -----------------------------------------------------------------------

const SKIPPED_FUNCTION_KEYS = new Set(['length', 'name', 'prototype', 'arguments', 'caller']);
const MOCK_API = [
  'mockClear',
  'mockReset',
  'mockRestore',
  'mockImplementation',
  'mockImplementationOnce',
  'mockReturnValue',
  'mockReturnValueOnce',
  'mockResolvedValue',
  'mockResolvedValueOnce',
  'mockRejectedValue',
  'mockRejectedValueOnce',
  'mockName',
  'getMockName',
  'getMockImplementation',
];

type MockFunction = ReturnType<typeof bunJest.fn>;
type AnyFunction = (...args: unknown[]) => unknown;
type Mocked = Record<string, unknown> & { prototype: Record<string, unknown> };

const isClass = (value: AnyFunction): boolean =>
  /^class\b/.test(Function.prototype.toString.call(value)) ||
  Object.getOwnPropertyNames(value.prototype ?? {}).length > 1;

/**
 * A class whose methods are all `jest.fn()`. As in Jest, each instance gets its own method mocks,
 * which call the prototype's (so `Class.prototype.method.mockReturnValue()` applies to every
 * instance). Its constructor is a mock too (`mock.calls`, `mockImplementation`, ...): Bun's mocks
 * cannot be called with `new`.
 */
function mockClass(value: AnyFunction): Mocked {
  const constructor: MockFunction = bunJest.fn();
  const methods: string[] = [];
  const mocked = function (this: Record<string, unknown>, ...args: unknown[]) {
    for (const key of methods) {
      const shared = mocked.prototype[key] as AnyFunction;
      this[key] = bunJest.fn(function (this: unknown, ...methodArgs: unknown[]) {
        return shared.apply(this, methodArgs);
      });
    }
    const created: unknown = constructor.apply(this, args);
    if (created && typeof created === 'object') return created;
  } as unknown as Mocked;
  for (const key of MOCK_API) {
    const method = (constructor as unknown as Record<string, AnyFunction>)[key];
    mocked[key] = (...args: unknown[]) => {
      const result = method.apply(constructor, args);
      return result === constructor ? mocked : result;
    };
  }
  Object.defineProperty(mocked, 'mock', { get: () => constructor.mock });
  // Instance methods, from the class and the classes it extends
  for (
    let prototype = value.prototype as object | null;
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === 'constructor' || key in mocked.prototype) continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (typeof descriptor?.value !== 'function') continue;
      mocked.prototype[key] = bunJest.fn();
      methods.push(key);
    }
  }
  return mocked;
}

function automock(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (typeof value === 'function') {
    if (seen.has(value)) return seen.get(value);
    const original = value as AnyFunction;
    const mocked = (isClass(original) ? mockClass(original) : bunJest.fn()) as unknown as Mocked;
    seen.set(value, mocked);
    // Static members
    for (const key of Object.getOwnPropertyNames(value)) {
      if (SKIPPED_FUNCTION_KEYS.has(key) || Object.getOwnPropertyDescriptor(mocked, key)) continue;
      Object.defineProperty(mocked, key, {
        value: automock((value as unknown as Record<string, unknown>)[key], seen),
        writable: true,
        configurable: true,
      });
    }
    return mocked;
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) return [];
    const mocked: Record<string, unknown> = {};
    seen.set(value, mocked);
    for (const key of Object.keys(value))
      mocked[key] = automock((value as Record<string, unknown>)[key], seen);
    return mocked;
  }
  return value;
}

/**
 * A factory's value as Jest's CommonJS interop sees it: without `__esModule`, the value is also
 * the module's default export (`jest.mock('m', () => jest.fn())` mocks `import m from 'm'`).
 */
const asModule = (value: unknown): unknown => {
  if (typeof value === 'function') return { ...value, default: value };
  if (!value || typeof value !== 'object') return { default: value };
  if ('__esModule' in value || 'default' in value) return value;
  return { ...value, default: value };
};

const mockWithoutFactory = (specifier: string): void => {
  const path = resolve(specifier);
  const manual = manualMockFor(specifier);
  if (manual) {
    register(path, () => require(manual));
    return;
  }
  const actual = require(path) as Record<string, unknown>;
  register(path, () => automock({ ...actual }));
};

// --- Mocks applied before the test file loads ---------------------------------------------

const topLevelCalls = (method: 'mock' | 'unmock'): string[] =>
  [
    ...testSource.matchAll(new RegExp(`^jest\\.${method}\\(\\s*['"]([^'"]+)['"]\\s*\\);`, 'gm')),
  ].map(match => match[1]);

const relativeImports = new Set(
  [...testSource.matchAll(/^import[^'"]*from\s+['"](\.[^'"]+)['"]/gm)].map(match =>
    resolve(match[1])
  )
);
const unmocked = new Set(topLevelCalls('unmock').map(resolve));

for (const specifier of AUTOMATIC_MANUAL_MOCKS) {
  const path = resolve(specifier);
  if (unmocked.has(path) || relativeImports.has(path)) continue;
  const manual = manualMockFor(specifier)!;
  register(path, () => require(manual));
}
for (const specifier of topLevelCalls('mock')) mockWithoutFactory(specifier);

// --- Fake timers ---------------------------------------------------------------------------

interface FakeTimersConfig {
  now?: Date | number;
  doNotFake?: FakeTimers.FakeMethod[];
  advanceTimers?: boolean | number;
  timerLimit?: number;
}

// Bun's runtime and its streams schedule work with these; faking them would stall them.
const NEVER_FAKED: FakeTimers.FakeMethod[] = ['nextTick', 'queueMicrotask'];

let clock: InstalledClock | null = null;

const fakeClock = (): InstalledClock => {
  if (!clock) throw new Error('Fake timers are not enabled: call jest.useFakeTimers() first');
  return clock;
};

const timers = {
  useFakeTimers(config: FakeTimersConfig = {}) {
    clock?.uninstall();
    const skip = new Set([...NEVER_FAKED, ...(config.doNotFake ?? [])]);
    const toFake = (Object.keys(FakeTimers.timers) as FakeTimers.FakeMethod[]).filter(
      method => !skip.has(method)
    );
    clock = FakeTimers.withGlobal(globalThis).install({
      now: config.now ?? Date.now(),
      toFake,
      loopLimit: config.timerLimit ?? 100_000,
      shouldAdvanceTime: Boolean(config.advanceTimers),
      advanceTimeDelta: typeof config.advanceTimers === 'number' ? config.advanceTimers : 20,
      shouldClearNativeTimers: true,
    });
    return jest;
  },
  useRealTimers() {
    clock?.uninstall();
    clock = null;
    return jest;
  },
  advanceTimersByTime(ms: number) {
    fakeClock().tick(ms);
  },
  async advanceTimersByTimeAsync(ms: number) {
    await fakeClock().tickAsync(ms);
  },
  advanceTimersToNextTimer(steps = 1) {
    for (let step = 0; step < steps; step++) fakeClock().next();
  },
  async advanceTimersToNextTimerAsync(steps = 1) {
    for (let step = 0; step < steps; step++) await fakeClock().nextAsync();
  },
  runAllTimers() {
    fakeClock().runAll();
  },
  async runAllTimersAsync() {
    await fakeClock().runAllAsync();
  },
  runOnlyPendingTimers() {
    fakeClock().runToLast();
  },
  async runOnlyPendingTimersAsync() {
    await fakeClock().runToLastAsync();
  },
  clearAllTimers() {
    clock?.reset();
  },
  getTimerCount() {
    return clock?.countTimers() ?? 0;
  },
  now() {
    return clock ? clock.now : Date.now();
  },
  setSystemTime(now?: Date | number) {
    if (clock) clock.setSystemTime(now);
    else bunJest.setSystemTime(now === undefined ? undefined : new Date(now));
  },
  getRealSystemTime() {
    return performance.timeOrigin + performance.now();
  },
};

// --- The global `jest` -----------------------------------------------------------------------

const jest = {
  ...bunJest,
  ...timers,
  mock(specifier: string, factory?: () => unknown) {
    if (!factory) mockWithoutFactory(specifier);
    else register(resolve(specifier), () => asModule(factory()));
    return jest;
  },
  unmock(specifier: string) {
    // Only effective before the test file loads, where this file applies it.
    unmocked.add(resolve(specifier));
    return jest;
  },
  requireActual<T = unknown>(specifier: string): T {
    const path = resolve(specifier);
    // A query string loads the file again as a separate, unmocked module.
    return require(registered.has(path) ? `${path}?actual` : path) as T;
  },
  requireMock<T = unknown>(specifier: string): T {
    const path = resolve(specifier);
    const created = registered.get(path);
    return (created ? created() : require(path)) as T;
  },
  mocked<T>(value: T): T {
    return value;
  },
};

Object.assign(globalThis, { jest });

// Bun binds `jest` in a test file to its own object unless the file imports from `bun:test`.
// Import the other test globals for it (on its first line, so line numbers stay the same) and
// leave `jest` to the global above. Test files get these from here, never by their own import.
const TEST_GLOBALS = [
  'describe',
  'it',
  'test',
  'expect',
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
];
Bun.plugin({
  name: 'jest-global',
  setup(build) {
    build.onLoad({ filter: /\.(test|spec)\.ts$/ }, ({ path }) => ({
      contents: `import { ${TEST_GLOBALS.join(', ')} } from 'bun:test'; ${readFileSync(path, 'utf8')}`,
      loader: 'ts',
    }));
  },
});
