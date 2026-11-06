import { configureFakerSeed } from '@__test-utils__/utils';
import {
  defineService,
  type ManagedConfiguration,
  type RunningServer,
  serve,
} from '@miauflix/contract';
import { mediaLoad, type SourceDescriptor } from '@miauflix/service-contracts';

import type { ContentSource } from '@entities/content-source.entity';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import type { PlaybackTarget } from '@services/playback/playback-target';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';

import { MediaLoadClientService, type StorageHandoff } from './media-load-client.service';

const until = async (check: () => boolean) => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 3_000) throw new Error('Condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

const SECURITY_KEY = Buffer.alloc(32, 7).toString('base64');

const unused = () => {
  throw new Error('not used by this test');
};

/**
 * A served media-load. Scrapes answer 9 seeders (or time out for hashes starting with f); reads
 * echo the Range they received; sources are known once described, until `forget()`.
 */
const startMediaLoad = async () => {
  const calls: string[] = [];
  const sources = new Map<number, SourceDescriptor>();
  const importState = { imported: false, batches: [] as number[][] };
  const playbackListeners = new Set<(payload: { activeSourceIds: number[] }) => void>();
  const configuration: ManagedConfiguration = {
    getSchema: () => ({ groups: [] }),
    ready: true,
    test: async () => ({ success: true, mode: 'validation', message: 'ok' }),
    applyRemote: async () => {
      calls.push('applyConfig');
      return { success: true, activated: true };
    },
    clearRemote: async () => ({ success: true, activated: false }),
    subscribe: () => () => undefined,
  };
  const known = (sourceId: number, fail: (code: 'unknown_source') => never) => {
    if (!sources.has(sourceId)) fail('unknown_source');
  };
  const service = defineService({
    info: { id: 'media-load', name: 'Media load', description: 'Fake', version: '1' },
    configuration,
  }).implement(mediaLoad, {
    attach: ({ securityKey }) => {
      calls.push(`attach:${securityKey}`);
    },
    swarmStats: async ({ hash }, ctx) =>
      hash.startsWith('f')
        ? ctx.fail('scrape_timeout', `Scrape request timed out for ${hash}`)
        : { complete: 9, incomplete: 3 },
    putSource: ({ source }) => {
      calls.push(`put:${source.id}:${source.file ? 'file' : 'nofile'}`);
      sources.set(source.id, source);
    },
    sourceMetadataFile: () => ({ file: Buffer.from('torrent').toString('base64') }),
    predownload: ({ target }, ctx) => {
      known(target.sourceId, ctx.fail);
      calls.push(`predownload:${target.sourceId}`);
      return true;
    },
    isFileComplete: unused,
    resolveLayout: unused,
    mediaFiles: unused,
    prepareSubtitleFiles: unused,
    playbackHealth: unused,
    releaseClaims: unused,
    warmSource: unused,
    pauseSource: unused,
    promoteSource: unused,
    isRangeVerified: unused,
    rangeProgress: unused,
    playbackActivity: () => ({ activeSourceIds: [] }),
    playbackChanged: emit => {
      playbackListeners.add(emit);
      return () => playbackListeners.delete(emit);
    },
    layoutKnown: () => () => undefined,
    storageStates: ({ sourceIds }) =>
      sourceIds.map(sourceId => ({
        sourceId,
        verifiedBytes: 1,
        allocatedBytes: 2,
        downloaded: 10_000,
        videoComplete: true,
        localOnly: false,
      })),
    storageInventory: unused,
    removeStorage: unused,
    importStatus: () => {
      calls.push('importStatus');
      return { imported: importState.imported };
    },
    importStorage: ({ items }) => {
      importState.batches.push(items.map(item => item.source.id));
      return { imported: items.length, skipped: 0 };
    },
    completeImport: () => {
      calls.push('completeImport');
      importState.imported = true;
      return { imported: importState.batches.flat().length };
    },
    read: ({ target }, ctx) => {
      known(target.sourceId, ctx.fail);
      if (target.filePath === 'missing.mkv')
        return ctx.fail('source_file_unavailable', 'Requested file is not part of this source');
      return new Response(`range=${ctx.headers.get('range') ?? 'none'}`, { status: 206 });
    },
  });
  const server = await serve(service, { hostname: '127.0.0.1', port: 0 });
  return {
    server,
    calls,
    importState,
    forget: () => sources.clear(),
    emitPlayback: (activeSourceIds: number[]) =>
      playbackListeners.forEach(emit => emit({ activeSourceIds })),
  };
};

const source = (overrides: Partial<ContentSource> = {}) =>
  ({
    id: 5,
    hash: 'a'.repeat(40),
    magnetLink: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
    size: 1000,
    ...overrides,
  }) as ContentSource;

const target = (filePath = 'movie.mkv', from = source()): PlaybackTarget => ({
  source: from,
  filePath,
  matchKind: 'movie',
});

describe('MediaLoadClientService', () => {
  const servers: RunningServer[] = [];
  const clients: MediaLoadClientService[] = [];

  beforeAll(() => configureFakerSeed());

  afterEach(async () => {
    clients.splice(0).forEach(client => client.stop());
    await Promise.all(servers.splice(0).map(server => server.stop()));
  });

  const setupTest = async (handoff?: StorageHandoff) => {
    const fake = await startMediaLoad();
    servers.push(fake.server);
    const client = new MediaLoadClientService({
      getDynamic: jest.fn(
        (key: string) =>
          ({
            MEDIA_LOAD_SERVICE_URL: `http://127.0.0.1:${fake.server.port}`,
            MEDIA_LOAD_SERVICE_TIMEOUT_MS: '2000',
          })[key]
      ),
      getOrThrow: jest.fn(
        (key: string) => ({ SOURCE_SECURITY_KEY: SECURITY_KEY, PRELOAD_WARM_TARGET: 64n })[key]
      ),
      registerRemoteConfiguration: jest.fn(),
      getServiceConfigSnapshot: jest.fn(() => ({})),
    } as unknown as ConfigurationService);
    clients.push(client);
    if (handoff) client.setStorageHandoff(handoff);
    await client.initialize();
    await until(() => client.isReady());
    return { client, ...fake };
  };

  it('sends the security key before the configuration', async () => {
    const { calls } = await setupTest();
    expect(calls.slice(0, 2)).toEqual([`attach:${SECURITY_KEY}`, 'applyConfig']);
  });

  it('returns seeders and leechers as broadcasters and watchers', async () => {
    const { client } = await setupTest();
    await expect(client.swarmStats('a'.repeat(40))).resolves.toEqual({
      broadcasters: 9,
      watchers: 3,
    });
  });

  it('turns engine errors into ErrorWithStatus with the contract code', async () => {
    const { client } = await setupTest();
    const scrape = await client.swarmStats('f'.repeat(40)).catch((e: unknown) => e);
    expect(scrape).toBeInstanceOf(ErrorWithStatus);
    expect(scrape).toMatchObject({ status: 'scrape_timeout' });

    const read = await client.streamFile(target('missing.mkv')).catch((e: unknown) => e);
    expect(read).toBeInstanceOf(ErrorWithStatus);
    expect(read).toMatchObject({ status: 'source_file_unavailable' });
  });

  it('describes a source once, again when it gains its file, and after the service forgets it', async () => {
    const { client, calls, forget } = await setupTest();
    await client.predownload(target(), { kind: 'watched', ownerKey: 'user:1' });
    await client.predownload(target(), { kind: 'watched', ownerKey: 'user:1' });
    await client.predownload(target('movie.mkv', source({ file: Buffer.from('torrent') })), {
      kind: 'watched',
      ownerKey: 'user:1',
    });
    forget();
    await client.predownload(target(), { kind: 'watched', ownerKey: 'user:1' });

    expect(calls.filter(call => /^(put|predownload)/.test(call))).toEqual([
      'put:5:nofile',
      'predownload:5',
      'predownload:5',
      'put:5:file',
      'predownload:5',
      'put:5:nofile',
      'predownload:5',
    ]);
  });

  it('streams bytes with the viewer Range', async () => {
    const { client } = await setupTest();
    const response = await client.streamFile(target(), 'bytes=10-');
    expect(response.status).toBe(206);
    await expect(response.text()).resolves.toBe('range=bytes=10-');
  });

  it('mirrors the sources with an open stream', async () => {
    const { client, emitPlayback } = await setupTest();
    expect(client.hasActivePlayback()).toBe(false);
    emitPlayback([5]);
    await until(() => client.isPlaybackActive(5));
    expect(client.hasActivePlayback()).toBe(true);
    emitPlayback([]);
    await until(() => !client.hasActivePlayback());
  });

  it('reads storage states and the warmup target', async () => {
    const { client } = await setupTest();
    await expect(client.getStorageState(5)).resolves.toMatchObject({
      sourceId: 5,
      downloaded: 10_000,
    });
    await expect(client.getStorageStates([])).resolves.toEqual([]);
    expect(client.getWarmupTargetBytes()).toBe(64);
  });

  it('runs the storage handoff after the configuration, also when set later', async () => {
    const { client, calls, importState } = await setupTest();
    await until(() => calls.includes('applyConfig'));

    const handoff = jest.fn(async (remote: MediaLoadClientService) => {
      if ((await remote.importStatus()).imported) return;
      await remote.importStorage([]);
      await remote.completeImport();
    });
    client.setStorageHandoff(handoff);

    await until(() => importState.imported);
    expect(handoff).toHaveBeenCalledWith(client);
    expect(calls.filter(call => /^(importStatus|completeImport)$/.test(call))).toEqual([
      'importStatus',
      'completeImport',
    ]);
  });

  it('runs a handoff registered before the first configuration is accepted', async () => {
    const handoff = jest.fn(async (client: MediaLoadClientService) => {
      await client.completeImport();
    });
    const { client, calls, importState } = await setupTest(handoff);
    await until(() => importState.imported);
    expect(handoff).toHaveBeenCalledWith(client);
    expect(calls.indexOf('completeImport')).toBeGreaterThan(calls.indexOf('applyConfig'));
  });

  it('runs again immediately if configuration is accepted during a failed handoff', async () => {
    let rejectRun!: (error: Error) => void;
    const pending = new Promise<void>((_, reject) => {
      rejectRun = reject;
    });
    const handoff = jest.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    const { client } = await setupTest(handoff);
    await until(() => handoff.mock.calls.length === 1);

    await client.reload();
    expect(handoff).toHaveBeenCalledTimes(1);
    rejectRun(new Error('Interrupted handoff'));

    await until(() => handoff.mock.calls.length === 2);
    expect(handoff).toHaveBeenLastCalledWith(client);
  });

  it.each([false, true])('cancels handoff retries on stop (pending=%s)', async pending => {
    const { client } = await setupTest();
    let rejectRun!: (error: Error) => void;
    const handoff = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejectRun = reject;
          })
      )
      .mockResolvedValue(undefined);
    jest.useFakeTimers();
    try {
      client.setStorageHandoff(handoff);
      await jest.advanceTimersByTimeAsync(0);
      if (pending) client.stop();
      rejectRun(new Error('Handoff failed'));
      await jest.advanceTimersByTimeAsync(0);
      if (!pending) {
        await jest.advanceTimersByTimeAsync(30_000);
        expect(handoff).toHaveBeenCalledTimes(2);
        // A second failure schedules a timer that stop must cancel.
        handoff.mockRejectedValueOnce(new Error('Handoff failed again'));
        client.setStorageHandoff(handoff);
        await jest.advanceTimersByTimeAsync(0);
        client.stop();
      }
      await jest.advanceTimersByTimeAsync(30_000);
      expect(handoff).toHaveBeenCalledTimes(pending ? 1 : 3);
    } finally {
      jest.useRealTimers();
    }
  });
});
