import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, isContractError, localTransport, management } from '@miauflix/contract';
import { type ImportedSource, mediaLoad } from '@miauflix/service-contracts';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest, mock } from 'bun:test';

import { mockedTorrentInstance, mockEngineModules, TEST_SETTINGS } from './helpers/engine';

mockEngineModules();

class FakeClient extends EventEmitter {
  static instances: FakeClient[] = [];
  constructor(readonly opts: { announce: string[] }) {
    super();
    FakeClient.instances.push(this);
  }
  scrape({ infoHash }: { infoHash: Array<Buffer | string> }) {
    // Every tracker answers at once with 4 seeders and 2 leechers.
    queueMicrotask(() => {
      for (const announce of this.opts.announce)
        for (const hash of infoHash)
          this.emit('scrape', {
            announce,
            infoHash: typeof hash === 'string' ? hash : hash.toString('hex'),
            complete: 4,
            incomplete: 2,
            downloaded: 0,
          });
    });
  }
  destroy() {}
}
mock.module('bittorrent-tracker', () => ({ Client: FakeClient }));

const { createMediaLoadService } = await import('../src/service');
const { MediaLoadConfigService } = await import('../src/config/config.service');

const downloads = mkdtempSync(join(tmpdir(), 'media-load-service-'));
afterAll(() => rmSync(downloads, { recursive: true, force: true }));

const stops: Array<() => Promise<void>> = [];
beforeEach(() => {
  // The engine fetches its tracker lists on start.
  jest.spyOn(globalThis, 'fetch').mockImplementation((async () => new Response('')) as never);
  mockedTorrentInstance.destroy.mockImplementation(((callback?: () => void) =>
    callback?.()) as never);
});
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  FakeClient.instances.length = 0;
});

/** What the backend pushes: every schema key, defaults filled in (its snapshot does the same). */
const ENGINE_VALUES = {
  ...new MediaLoadConfigService().defaults(),
  DOWNLOAD_PATH: downloads,
  DOWNLOAD_SALT: TEST_SETTINGS.DOWNLOAD_SALT,
  DISABLE_DISCOVERY: 'true',
};
const KEY = TEST_SETTINGS.SOURCE_SECURITY_KEY;

const setup = async ({ attach = true, defaultDownloadPath = downloads } = {}) => {
  const { service, runtime, stop } = createMediaLoadService({
    dataDir: ':memory:',
    defaultDownloadPath,
    scrape: { windowMs: 1 },
  });
  stops.push(stop);
  const transport = localTransport(service);
  const client = createClient(mediaLoad, transport);
  if (attach) await client.attach({ securityKey: KEY });
  return {
    service,
    runtime,
    client,
    admin: createClient(management, transport),
    /** Push settings as the backend does, then (unless told not to) finish its storage import. */
    apply: async (values: Record<string, string>, { importStorage = true } = {}) => {
      const result = await createClient(management, transport).applyConfig({
        values: { ...ENGINE_VALUES, ...values },
      });
      if (result.success && importStorage) await client.completeImport();
      return result;
    },
  };
};

/** A stored source as the backend recorded it. */
const imported = (
  id: number,
  overrides: Partial<ImportedSource['storage']> = {}
): ImportedSource => {
  const hash = id.toString(16).padStart(40, '0');
  return {
    source: { id, hash, magnetLink: `magnet:?xt=urn:btih:${hash}`, size: 12 },
    storage: {
      downloadedPieces: Buffer.from([0b11100000]).toString('base64'),
      size: 12,
      logicalBytes: 12,
      verifiedBytes: 12,
      allocatedBytes: 4096,
      reservedBytes: 0,
      totalPieces: 3,
      pieceLength: 4,
      lastInterestAt: null,
      videoCompletedAt: null,
      localOnly: true,
      encryptedLayout: {
        storeName: `store-${id}`,
        filenameSalt: `download-${hash}`,
        pieceLength: 4,
        files: [{ path: 'movie.mkv', offset: 0, length: 12 }],
      },
      downloaded: 10_000,
      location: join(downloads, String(id)),
      lastAccessAt: '2026-10-01T00:00:00.000Z',
      lastWriteAt: '2026-10-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      ...overrides,
    },
    files: [{ path: 'movie.mkv', offset: 0, length: 12, completedAt: '2026-10-01T00:00:00.000Z' }],
    claims: [
      {
        path: 'movie.mkv',
        kind: 'watched',
        ownerKey: 'user:1',
        rangeStart: 0,
        rangeEnd: null,
        expiresAt: null,
      },
      {
        path: 'movie.mkv',
        kind: 'playback',
        ownerKey: 'stream',
        rangeStart: 0,
        rangeEnd: null,
        expiresAt: null,
      },
    ],
  };
};

describe('media-load service', () => {
  it('stays in standby until the backend applies its configuration', async () => {
    const { client, admin } = await setup();
    const error = await client.swarmStats({ hash: 'a'.repeat(40) }).catch((e: unknown) => e);
    expect(isContractError(error, 'not_configured')).toBe(true);
    expect((await admin.status()).state).toBe('standby');
  });

  it('advertises the standalone image download path to the backend', async () => {
    const imagePath = join(downloads, 'default');
    const { admin } = await setup({ defaultDownloadPath: imagePath });
    const schema = await admin.configSchema();
    const pathSetting = schema.groups
      .flatMap(group => group.variables)
      .find(variable => variable.key === 'DOWNLOAD_PATH');
    expect(pathSetting?.defaultValue).toBe(imagePath);
  });

  it('reschedules seed expiry on a duration change without reinitializing downloads', async () => {
    const { apply, runtime } = await setup();
    await apply({});
    const { downloads: engine } = runtime.running;
    const reschedule = jest.spyOn(engine, 'rescheduleSeedExpiry');
    const reload = jest.spyOn(engine, 'reload');

    expect((await apply({ CONTENT_UPLOAD_LIMIT: '10MB' })).success).toBe(true);
    expect(reschedule).not.toHaveBeenCalled();
    expect((await apply({ CONTENT_SEED_DURATION_SECONDS: '0' })).success).toBe(true);
    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('scrapes through the applied trackers', async () => {
    const { client, apply } = await setup();
    const tracker = 'udp://tracker.example:1337/announce';
    expect((await apply({ SCRAPE_TRACKERS: tracker })).success).toBe(true);

    await expect(client.swarmStats({ hash: 'A'.repeat(40) })).resolves.toEqual({
      complete: 4,
      incomplete: 2,
    });
    expect(FakeClient.instances.map(instance => instance.opts.announce)).toEqual([[tracker]]);
  });

  it('keeps an explicitly empty tracker list instead of the defaults', async () => {
    const { client, apply } = await setup();
    const result = await apply({ SCRAPE_TRACKERS: '' });
    expect(result.test?.message).toBe(
      'No UDP or HTTP scrape trackers: swarm stats are unavailable'
    );
    const error = await client.swarmStats({ hash: 'a'.repeat(40) }).catch(e => e);
    expect(isContractError(error, 'scrape_unavailable')).toBe(true);
    expect(FakeClient.instances).toHaveLength(0);
  });

  it('returns scrape failures as contract errors', async () => {
    const { client, apply } = await setup();
    await apply({ SCRAPE_TRACKERS: 'wss://only.example' });
    const unavailable = await client.swarmStats({ hash: 'a'.repeat(40) }).catch(e => e);
    expect(isContractError(unavailable, 'scrape_unavailable')).toBe(true);
    const invalid = await client.swarmStats({ hash: 'nope' }).catch(e => e);
    expect(isContractError(invalid, 'invalid_hash')).toBe(true);
  });

  it('waits for the security key before starting the engine', async () => {
    const { client, admin, apply } = await setup({ attach: false });
    expect((await apply({})).success).toBe(false);
    expect((await admin.status()).state).toBe('standby');

    await client.attach({ securityKey: KEY });
    expect((await apply({})).success).toBe(true);
    expect((await admin.status()).state).toBe('ready');
  });

  it('refuses another key once the engine runs', async () => {
    const { client, apply } = await setup();
    await apply({});
    const other = Buffer.alloc(32, 9).toString('base64');
    const error = await client.attach({ securityKey: other }).catch((e: unknown) => e);
    expect(isContractError(error, 'bad_request')).toBe(true);
  });

  it('answers unknown_source until the host describes a source', async () => {
    const { client, apply } = await setup();
    await apply({});
    const target = { sourceId: 7, filePath: 'movie.mkv', matchKind: 'movie' as const };
    const claim = { kind: 'watched' as const, ownerKey: 'user:1' };

    const unknown = await client.predownload({ target, claim }).catch((e: unknown) => e);
    expect(isContractError(unknown, 'unknown_source')).toBe(true);

    await client.putSource({
      source: {
        id: 7,
        hash: 'b'.repeat(40),
        magnetLink: `magnet:?xt=urn:btih:${'b'.repeat(40)}`,
        size: 10,
      },
    });
    await expect(client.storageStates({ sourceIds: [7] })).resolves.toEqual([]);
    await expect(client.playbackActivity()).resolves.toEqual({ activeSourceIds: [] });
  });

  it('serves engine calls only once the backend finished its storage import', async () => {
    const { client, admin, apply } = await setup();
    expect((await apply({}, { importStorage: false })).success).toBe(true);
    expect((await admin.status()).state).toBe('configuring');
    const gated = await client.storageStates({ sourceIds: [1] }).catch((e: unknown) => e);
    expect(isContractError(gated, 'not_configured')).toBe(true);
    await expect(client.importStatus()).resolves.toEqual({ imported: false });

    await expect(client.completeImport()).resolves.toEqual({ imported: 0 });
    expect((await admin.status()).state).toBe('ready');
    await expect(client.importStatus()).resolves.toEqual({ imported: true });
  });

  it('imports stored sources once, keeping their files and non-playback claims', async () => {
    const { client, apply } = await setup();
    await apply({}, { importStorage: false });

    await expect(client.importStorage({ items: [imported(1), imported(2)] })).resolves.toEqual({
      imported: 2,
      skipped: 0,
    });
    // A batch retried after a crash adds nothing twice.
    await expect(client.importStorage({ items: [imported(2), imported(3)] })).resolves.toEqual({
      imported: 1,
      skipped: 1,
    });
    await expect(client.completeImport()).resolves.toEqual({ imported: 3 });

    expect(await client.storageStates({ sourceIds: [1, 2, 3, 4] })).toEqual(
      [1, 2, 3].map(sourceId => ({
        sourceId,
        verifiedBytes: 12,
        allocatedBytes: 4096,
        downloaded: 10_000,
        videoComplete: false,
        localOnly: true,
      }))
    );
    const inventory = await client.storageInventory();
    expect(inventory.items.map(item => [item.sourceId, item.requestedFiles])).toEqual([
      [1, ['movie.mkv']],
      [2, ['movie.mkv']],
      [3, ['movie.mkv']],
    ]);
    await expect(client.resolveLayout({ sourceId: 1 })).resolves.toEqual(
      imported(1).storage.encryptedLayout!
    );

    const closed = await client.importStorage({ items: [imported(4)] }).catch((e: unknown) => e);
    expect(isContractError(closed, 'import_closed')).toBe(true);
  });
});
