/**
 * Shared doubles for the engine tests: module mocks for the network-facing packages, a
 * method-by-method mock of a class (what Jest's automock gave the backend), an `EngineConfig`
 * stub and storage/source records.
 *
 * Module mocks must be installed before the engine is imported, so test files call
 * `mockEngineModules()` at the top and then `await import()` the engine.
 */
import { jest, type Mock, mock } from 'bun:test';

import type { EngineConfig, EngineSettings } from '../../src/engine/engine-config';
import { logger } from '../../src/lib/logger';
import type { ContentSource, Storage } from '../../src/storage/types';
import WebTorrentMock, { mockedTorrentInstance, resetMocks } from '../__mocks__/webtorrent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMock = Mock<(...args: any[]) => any>;

const resolve = (path: string) => Bun.fileURLToPath(new URL(path, import.meta.url));

type Methods<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

export type Mocked<T> = T & {
  [K in Methods<T>]: T[K] extends (...args: infer A) => infer R
    ? jest.Mock<(...args: A) => R>
    : never;
};

/** An instance whose every method (through the prototype chain) is a bare `jest.fn()`. */
export function mockInstance<T extends object>(
  Class: abstract new (...args: never[]) => T
): Mocked<T> {
  const instance = Object.create(Class.prototype) as Record<string, unknown>;
  for (let proto = Class.prototype; proto && proto !== Object.prototype; ) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (typeof descriptor?.value === 'function' && !Object.hasOwn(instance, key))
        instance[key] = jest.fn();
    }
    proto = Object.getPrototypeOf(proto);
  }
  return instance as Mocked<T>;
}

/** The fake `bittorrent-tracker` client constructor, and the `load-ip-set` loader. */
export const trackerClient = jest.fn();
export const loadIpSet = jest.fn(
  (_url: string, _options: unknown, callback: (err: Error | null, ipSet: unknown) => void) =>
    callback(null, { contains: jest.fn() })
);

/** `EncryptedFileReader` stand-in for tests that read through a fake torrent. */
export const fakeFileReader = jest.fn(() => ({
  readPiece: jest.fn(async () => Buffer.alloc(10)),
  close: jest.fn(async () => undefined),
}));

export interface EngineModuleOptions {
  /** Replace `EncryptedFileReader` with `fakeFileReader` (tests without real chunks). */
  fakeReader?: boolean;
}

/**
 * Mock WebTorrent, the tracker client, the IP-set loader and the diagnostics timer; silence the
 * logger. Call before importing the engine.
 */
export function mockEngineModules(options: EngineModuleOptions = {}): void {
  mock.module('webtorrent', () => ({ default: WebTorrentMock }));
  mock.module('bittorrent-tracker', () => ({
    Client: trackerClient,
    default: { Client: trackerClient },
  }));
  mock.module('load-ip-set', () => ({ default: loadIpSet }));
  mock.module(resolve('../../src/engine/torrent-diagnostics.ts'), () => ({
    TorrentDiagnostics: jest.fn(() => ({ start: jest.fn(), stop: jest.fn(), close: jest.fn() })),
  }));
  if (options.fakeReader)
    mock.module(resolve('../../src/engine/encrypted-file-reader.ts'), () => ({
      EncryptedFileReader: fakeFileReader,
    }));
  for (const level of ['debug', 'info', 'warn', 'error'] as const)
    jest.spyOn(logger, level).mockImplementation(() => undefined);
}

export { mockedTorrentInstance, resetMocks };

export const TEST_SETTINGS: EngineSettings = {
  CONTENT_DOWNLOAD_LIMIT: 1_000_000n,
  CONTENT_UPLOAD_LIMIT: 500_000n,
  CONTENT_CONNECTION_LIMIT: 100,
  CONTENT_CONNECTION_BUDGET: 200,
  CONTENT_SEED_DURATION_SECONDS: 3600,
  DISABLE_DISCOVERY: false,
  STATIC_TRACKERS: ['udp://tracker1.example.com:1337', 'udp://tracker2.example.com:1337'],
  BEST_TRACKERS_DOWNLOAD_URL: 'https://example.com/trackers_best.txt',
  BLACKLISTED_TRACKERS_DOWNLOAD_URL: 'https://example.com/blacklist.txt',
  DOWNLOAD_PATH: '/tmp/test-downloads',
  DOWNLOAD_SALT: 'a'.repeat(32),
  STORAGE_THRESHOLD: 10n * 1024n ** 3n,
  STORAGE_PLAYBACK_RESERVE: 0n,
  SOURCE_SECURITY_KEY: Buffer.alloc(32, 7).toString('base64'),
};

export type TestConfig = EngineConfig & {
  getOrThrow: jest.Mock<EngineConfig['getOrThrow']>;
  get: jest.Mock<EngineConfig['get']>;
  set<K extends keyof EngineSettings>(key: K, value: EngineSettings[K]): void;
};

/** A mutable `EngineConfig` over `TEST_SETTINGS`. */
export function testConfig(overrides: Partial<EngineSettings> = {}): TestConfig {
  const values: EngineSettings = { ...TEST_SETTINGS, ...overrides };
  return {
    getOrThrow: jest.fn(<K extends keyof EngineSettings>(key: K) => values[key]),
    get: jest.fn(<K extends keyof EngineSettings>(key: K) => values[key]),
    set: (key, value) => {
      values[key] = value;
    },
  } as TestConfig;
}

let nextId = 1000;

export function createMockContentSource(overrides: Partial<ContentSource> = {}): ContentSource {
  const id = overrides.id ?? nextId++;
  const hash = (overrides.hash ?? id.toString(16).padStart(40, '0')) as string;
  return {
    id,
    hash,
    magnetLink: `magnet:?xt=urn:btih:${hash}`,
    size: 1024 * 1024 * 1024,
    ...overrides,
  };
}

export function createMockStorage(overrides: Partial<Storage> = {}): Storage {
  const sourceId = overrides.sourceId ?? nextId++;
  const contentSource =
    'contentSource' in overrides
      ? overrides.contentSource
      : createMockContentSource({ id: sourceId });
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: overrides.id ?? nextId++,
    contentSource,
    sourceId,
    downloadedPieces: new Uint8Array(0),
    size: 1024 * 1024 * 1024,
    logicalBytes: overrides.logicalBytes ?? overrides.size ?? 0,
    verifiedBytes: 0,
    allocatedBytes: 0,
    reservedBytes: 0,
    totalPieces: 0,
    pieceLength: 0,
    lastInterestAt: null,
    videoCompletedAt: null,
    localOnly: false,
    encryptedLayout: null,
    activeStreams: 0,
    downloaded: 0,
    location: `/tmp/test-downloads/${sourceId}`,
    lastAccessAt: null,
    lastWriteAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const createMockStorageWithHash = (hash: string, overrides: Partial<Storage> = {}) => {
  const sourceId = overrides.sourceId ?? nextId++;
  return createMockStorage({
    sourceId,
    ...overrides,
    contentSource: createMockContentSource({ id: sourceId, hash, ...overrides.contentSource }),
  });
};

export const createMockStorageWithoutContentSource = (overrides: Partial<Storage> = {}) =>
  createMockStorage({ contentSource: undefined, ...overrides });

export const createMockStorageWithUndefinedHash = (overrides: Partial<Storage> = {}) => {
  const sourceId = overrides.sourceId ?? nextId++;
  return createMockStorage({
    sourceId,
    ...overrides,
    contentSource: {
      ...createMockContentSource({ id: sourceId }),
      hash: undefined as unknown as string,
    },
  });
};

/** Jest's `jest.mocked`: the same function, typed as a mock. */
export const mocked = <T>(fn: T) => fn as unknown as jest.Mock<(...args: never[]) => unknown>;

/** Jest's `advanceTimersByTimeAsync`: run due timers, letting their promises settle. */
export async function advanceTimersByTimeAsync(ms: number): Promise<void> {
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  await settle();
  jest.advanceTimersByTime(ms);
  await settle();
}

/** A fresh in-memory service database under the test key. */
export async function testDatabase() {
  const [{ MediaLoadDatabase, openDatabase }, { Encryption }] = await Promise.all([
    import('../../src/db/database'),
    import('../../src/lib/encryption'),
  ]);
  return new MediaLoadDatabase(
    openDatabase(':memory:'),
    new Encryption(TEST_SETTINGS.SOURCE_SECURITY_KEY)
  );
}

type TestDatabase = Awaited<ReturnType<typeof testDatabase>>;

/** Record a source descriptor, as the host's `putSource` does. */
export async function createSource(
  database: TestDatabase,
  overrides: Partial<ContentSource> = {}
): Promise<ContentSource> {
  const source = createMockContentSource(overrides);
  await database.getSourceRepository().put(source);
  return source;
}
