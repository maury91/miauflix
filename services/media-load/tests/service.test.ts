import { EventEmitter } from 'node:events';

import { createClient, isContractError, localTransport, management } from '@miauflix/contract';
import { mediaLoad } from '@miauflix/service-contracts';
import { afterEach, describe, expect, it, mock } from 'bun:test';

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

const stops: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  FakeClient.instances.length = 0;
});

const setup = () => {
  const { service, stop } = createMediaLoadService({ scrape: { windowMs: 1 } });
  stops.push(stop);
  const transport = localTransport(service);
  return {
    service,
    client: createClient(mediaLoad, transport),
    admin: createClient(management, transport),
  };
};

describe('media-load service', () => {
  it('stays in standby until the backend applies its configuration', async () => {
    const { client, admin } = setup();
    const error = await client.swarmStats({ hash: 'a'.repeat(40) }).catch((e: unknown) => e);
    expect(isContractError(error, 'not_configured')).toBe(true);
    expect((await admin.status()).state).toBe('standby');
  });

  it('scrapes through the applied trackers', async () => {
    const { client, admin } = setup();
    const tracker = 'udp://tracker.example:1337/announce';
    expect((await admin.applyConfig({ values: { SCRAPE_TRACKERS: tracker } })).success).toBe(true);

    await expect(client.swarmStats({ hash: 'A'.repeat(40) })).resolves.toEqual({
      complete: 4,
      incomplete: 2,
    });
    expect(FakeClient.instances.map(instance => instance.opts.announce)).toEqual([[tracker]]);
  });

  it('returns scrape failures as contract errors', async () => {
    const { client, admin } = setup();
    await admin.applyConfig({ values: { SCRAPE_TRACKERS: 'wss://only.example' } });
    const unavailable = await client.swarmStats({ hash: 'a'.repeat(40) }).catch(e => e);
    expect(isContractError(unavailable, 'scrape_unavailable')).toBe(true);
    const invalid = await client.swarmStats({ hash: 'nope' }).catch(e => e);
    expect(isContractError(invalid, 'invalid_hash')).toBe(true);
  });
});
