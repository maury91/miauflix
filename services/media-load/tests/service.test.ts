import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, isContractError, localTransport, management } from '@miauflix/contract';
import { mediaLoad } from '@miauflix/service-contracts';
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
};
const KEY = TEST_SETTINGS.SOURCE_SECURITY_KEY;

const setup = async ({ attach = true } = {}) => {
  const { service, stop } = createMediaLoadService({
    dataDir: ':memory:',
    scrape: { windowMs: 1 },
  });
  stops.push(stop);
  const transport = localTransport(service);
  const client = createClient(mediaLoad, transport);
  if (attach) await client.attach({ securityKey: KEY });
  return {
    service,
    client,
    admin: createClient(management, transport),
    apply: (values: Record<string, string>) =>
      createClient(management, transport).applyConfig({ values: { ...ENGINE_VALUES, ...values } }),
  };
};

describe('media-load service', () => {
  it('stays in standby until the backend applies its configuration', async () => {
    const { client, admin } = await setup();
    const error = await client.swarmStats({ hash: 'a'.repeat(40) }).catch((e: unknown) => e);
    expect(isContractError(error, 'not_configured')).toBe(true);
    expect((await admin.status()).state).toBe('standby');
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
});
