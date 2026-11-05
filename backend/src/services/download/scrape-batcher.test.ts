jest.mock('@logger');
jest.mock('bittorrent-tracker', () => {
  const { EventEmitter } = jest.requireActual<typeof EventsModule>('events');
  class FakeClient extends EventEmitter {
    static instances: FakeClient[] = [];
    readonly announce: string[];
    scraped: Array<Buffer | string> = [];
    destroyed = false;
    constructor(opts: { announce: string[] }) {
      super();
      this.announce = opts.announce;
      FakeClient.instances.push(this);
    }
    scrape(opts: { infoHash: Array<Buffer | string> }) {
      this.scraped = opts.infoHash;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return { Client: FakeClient };
});

import { Client } from 'bittorrent-tracker';
import type * as EventsModule from 'events';

import { ScrapeBatcher } from './scrape-batcher';

interface FakeClient {
  announce: string[];
  scraped: Array<Buffer | string>;
  destroyed: boolean;
  emit(event: string, data: unknown): boolean;
}
const instances = (Client as unknown as { instances: FakeClient[] }).instances;

const hashA = 'a'.repeat(40);
const hashB = 'b'.repeat(40);
const UDP_1 = 'udp://one.example:1337/announce';
const UDP_2 = 'udp://two.example:6969/announce';
const HTTP_1 = 'http://three.example/announce';

const hex = (hash: Buffer | string) => (typeof hash === 'string' ? hash : hash.toString('hex'));
const reply = (
  client: FakeClient,
  announce: string,
  infoHash: string,
  complete: number,
  incomplete = 0
) => client.emit('scrape', { announce, infoHash, complete, incomplete, downloaded: 0 });

describe('ScrapeBatcher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    instances.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends concurrent requests as one multi-hash scrape', async () => {
    const batcher = new ScrapeBatcher([UDP_1, UDP_2]);
    const a = batcher.scrape(hashA);
    const b = batcher.scrape(hashB.toUpperCase());
    jest.advanceTimersByTime(50);

    expect(instances).toHaveLength(1);
    const [client] = instances;
    expect(client.announce).toEqual([UDP_1, UDP_2]);
    // The UDP client packs hashes as raw bytes, so it must receive buffers.
    expect(client.scraped.every(Buffer.isBuffer)).toBe(true);
    expect(client.scraped.map(hex)).toEqual([hashA, hashB]);

    for (const announce of [UDP_1, UDP_2]) {
      reply(client, announce, hashA, 3, 1);
      reply(client, announce, hashB, 7, 2);
    }

    await expect(a).resolves.toEqual({ complete: 3, incomplete: 1 });
    await expect(b).resolves.toEqual({ complete: 7, incomplete: 2 });
    expect(client.destroyed).toBe(true);
  });

  it('gives HTTP trackers hex strings in their own client', () => {
    const batcher = new ScrapeBatcher([UDP_1, HTTP_1, 'wss://ignored.example']);
    void batcher.scrape(hashA).catch(() => undefined);
    jest.advanceTimersByTime(50);

    expect(instances.map(client => client.announce)).toEqual([[UDP_1], [HTTP_1]]);
    expect(instances[1].scraped).toEqual([hashA]);
    batcher.close();
  });

  it('keeps the highest counts across trackers and settles after the grace period', async () => {
    const batcher = new ScrapeBatcher([UDP_1, UDP_2]);
    const result = batcher.scrape(hashA);
    jest.advanceTimersByTime(50);
    reply(instances[0], UDP_1, hashA, 2, 9);
    reply(instances[0], UDP_1, hashA, 5, 0);

    jest.advanceTimersByTime(1_000);
    await expect(result).resolves.toEqual({ complete: 5, incomplete: 9 });
  });

  it('rejects hashes no tracker answered as scrape_timeout', async () => {
    const batcher = new ScrapeBatcher([UDP_1]);
    const answered = batcher.scrape(hashA);
    const silent = batcher.scrape(hashB);
    jest.advanceTimersByTime(50);
    reply(instances[0], UDP_1, hashA, 1);

    jest.advanceTimersByTime(5_000);
    await expect(answered).resolves.toEqual({ complete: 1, incomplete: 0 });
    await expect(silent).rejects.toMatchObject({ status: 'scrape_timeout' });
    expect(batcher.stats).toEqual({ activeScrapes: 0, completedScrapes: 1, failedScrapes: 1 });
  });

  it('shares one scrape between duplicate requests and caches the result', async () => {
    const batcher = new ScrapeBatcher([UDP_1]);
    const first = batcher.scrape(hashA);
    const second = batcher.scrape(hashA);
    jest.advanceTimersByTime(50);
    expect(instances[0].scraped).toHaveLength(1);
    reply(instances[0], UDP_1, hashA, 4);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { complete: 4, incomplete: 0 },
      { complete: 4, incomplete: 0 },
    ]);

    await expect(batcher.scrape(hashA)).resolves.toEqual({ complete: 4, incomplete: 0 });
    expect(instances).toHaveLength(1);

    jest.advanceTimersByTime(60_001);
    void batcher.scrape(hashA).catch(() => undefined);
    jest.advanceTimersByTime(50);
    expect(instances).toHaveLength(2);
    batcher.close();
  });

  it('scrapes a v2 hash by its first 20 bytes', async () => {
    const v2 = 'c'.repeat(24) + 'd'.repeat(40);
    const batcher = new ScrapeBatcher([UDP_1]);
    const result = batcher.scrape(v2);
    jest.advanceTimersByTime(50);
    expect(instances[0].scraped.map(hex)).toEqual([v2.slice(0, 40)]);
    reply(instances[0], UDP_1, v2.slice(0, 40), 6);
    await expect(result).resolves.toEqual({ complete: 6, incomplete: 0 });
  });

  it('splits large batches to fit tracker request limits', () => {
    const batcher = new ScrapeBatcher([UDP_1, HTTP_1]);
    const hashes = Array.from({ length: 75 }, (_, i) => i.toString(16).padStart(40, '0'));
    for (const hash of hashes) void batcher.scrape(hash).catch(() => undefined);
    // The 70th request fills a batch and sends it at once; the rest wait for the window.
    const sizes = (clients: FakeClient[]) =>
      clients.map(client => [client.announce[0], client.scraped.length]);
    expect(sizes(instances)).toEqual([
      [UDP_1, 70],
      [HTTP_1, 20],
      [HTTP_1, 20],
      [HTTP_1, 20],
      [HTTP_1, 10],
    ]);
    jest.advanceTimersByTime(50);
    expect(sizes(instances.slice(5))).toEqual([
      [UDP_1, 5],
      [HTTP_1, 5],
    ]);
    batcher.close();
  });

  it('rejects invalid hashes, missing trackers and requests after close', async () => {
    await expect(new ScrapeBatcher([UDP_1]).scrape('nope')).rejects.toMatchObject({
      status: 'invalid_hash',
    });
    await expect(new ScrapeBatcher(['wss://only.example']).scrape(hashA)).rejects.toMatchObject({
      status: 'scrape_unavailable',
    });

    const batcher = new ScrapeBatcher([UDP_1]);
    const queued = batcher.scrape(hashA);
    batcher.close();
    await expect(queued).rejects.toMatchObject({ status: 'scrape_unavailable' });
    await expect(batcher.scrape(hashA)).rejects.toMatchObject({ status: 'scrape_unavailable' });
  });
});
