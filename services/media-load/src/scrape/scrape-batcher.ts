import type { SwarmCounts, SwarmStatsError } from '@miauflix/service-contracts';
import { Client as BTClient } from 'bittorrent-tracker';

/** A scrape failure; `code` is the contract error code. */
export class ScrapeError extends Error {
  constructor(
    message: string,
    readonly code: SwarmStatsError
  ) {
    super(message);
    this.name = 'ScrapeError';
  }
}

/** Tracker errors are expected (dead trackers); print them only when DEBUG is set. */
const debug = (message: string) => {
  if (process.env.DEBUG) console.debug(`[media-load] ${message}`);
};

export interface ScrapeBatcherOptions {
  /** How long a request waits for others to share its scrape. */
  windowMs?: number;
  /** After the first reply in a batch, how long the other trackers get to answer. */
  graceMs?: number;
  /** A hash with no reply from any tracker by then is rejected as `scrape_timeout`. */
  timeoutMs?: number;
  /** How long a successful result is reused. */
  cacheTtlMs?: number;
}

/** BEP 15 fits about 74 hashes in one UDP scrape packet. */
const UDP_HASHES_PER_REQUEST = 70;
/** About 71 URL characters per escaped hash; 20 stays well under common 2 KB URL limits. */
const HTTP_HASHES_PER_REQUEST = 20;
const HASHES_PER_BATCH = UDP_HASHES_PER_REQUEST;
const DUMMY_PEER_ID = Buffer.from('01234567890123456789');

interface Pending {
  /** The 20-byte hash trackers know the torrent by, as hex. */
  trackerHash: string;
  waiters: Array<{ resolve: (counts: SwarmCounts) => void; reject: (error: Error) => void }>;
}

/**
 * Shares tracker scrapes between concurrent stats requests. Requests arriving within a short
 * window go out together, one multi-hash scrape per tracker. Each tracker's counts are combined
 * by taking the highest, since every tracker sees only part of the swarm.
 */
export class ScrapeBatcher {
  private readonly udpTrackers: string[];
  private readonly httpTrackers: string[];
  private readonly windowMs: number;
  private readonly graceMs: number;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly queue = new Map<string, Pending>();
  private readonly cache = new Map<string, { counts: SwarmCounts; expiresAt: number }>();
  private readonly clients = new Set<BTClient>();
  private flushTimer: NodeJS.Timeout | null = null;
  private inFlightHashes = 0;
  private completed = 0;
  private failed = 0;
  private closed = false;

  constructor(trackers: string[], options: ScrapeBatcherOptions = {}) {
    this.udpTrackers = trackers.filter(url => url.startsWith('udp://'));
    this.httpTrackers = trackers.filter(url => /^https?:\/\//.test(url));
    this.windowMs = options.windowMs ?? 50;
    this.graceMs = options.graceMs ?? 1_000;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
  }

  get stats(): { activeScrapes: number; completedScrapes: number; failedScrapes: number } {
    return {
      activeScrapes: this.queue.size + this.inFlightHashes,
      completedScrapes: this.completed,
      failedScrapes: this.failed,
    };
  }

  scrape(infoHash: string): Promise<SwarmCounts> {
    const hash = infoHash.toLowerCase();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(hash)) {
      return Promise.reject(new ScrapeError(`Invalid info hash ${infoHash}`, 'invalid_hash'));
    }
    if (this.closed) {
      return Promise.reject(new ScrapeError('Scraping has stopped', 'scrape_unavailable'));
    }
    if (!this.udpTrackers.length && !this.httpTrackers.length) {
      return Promise.reject(
        new ScrapeError('No UDP or HTTP scrape trackers are configured', 'scrape_unavailable')
      );
    }
    const cached = this.cache.get(hash);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve({ ...cached.counts });
    if (cached) this.cache.delete(hash);

    return new Promise<SwarmCounts>((resolve, reject) => {
      // BEP 52: trackers identify a v2 torrent by its hash truncated to 20 bytes.
      const pending = this.queue.get(hash) ?? { trackerHash: hash.slice(0, 40), waiters: [] };
      pending.waiters.push({ resolve, reject });
      this.queue.set(hash, pending);
      if (this.queue.size >= HASHES_PER_BATCH) this.flush();
      else this.flushTimer ??= setTimeout(() => this.flush(), this.windowMs);
    });
  }

  close(): void {
    this.closed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const error = new ScrapeError('Scraping has stopped', 'scrape_unavailable');
    for (const pending of this.queue.values()) {
      for (const waiter of pending.waiters) waiter.reject(error);
    }
    this.queue.clear();
    for (const client of this.clients) client.destroy();
    this.clients.clear();
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    while (this.queue.size) {
      const batch = new Map<string, Pending>();
      for (const [hash, pending] of this.queue) {
        if (batch.size >= HASHES_PER_BATCH) break;
        batch.set(hash, pending);
        this.queue.delete(hash);
      }
      this.run(batch);
    }
  }

  private run(batch: Map<string, Pending>): void {
    this.inFlightHashes += batch.size;
    const byTrackerHash = new Map<string, string[]>();
    for (const [hash, { trackerHash }] of batch) {
      byTrackerHash.set(trackerHash, [...(byTrackerHash.get(trackerHash) ?? []), hash]);
    }
    const trackerHashes = [...byTrackerHash.keys()];
    const counts = new Map<string, SwarmCounts>();
    const replies = new Map<string, Set<string>>();
    const trackerCount = this.udpTrackers.length + this.httpTrackers.length;
    const clients: BTClient[] = [];
    let graceTimer: NodeJS.Timeout | null = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      for (const client of clients) {
        this.clients.delete(client);
        client.destroy();
      }
      this.inFlightHashes -= batch.size;
      const expiresAt = Date.now() + this.cacheTtlMs;
      for (const [hash, pending] of batch) {
        const result = counts.get(pending.trackerHash);
        if (result) {
          this.completed += 1;
          this.cache.set(hash, { counts: result, expiresAt });
          for (const waiter of pending.waiters) waiter.resolve({ ...result });
        } else {
          this.failed += 1;
          const error = new ScrapeError(`Scrape request timed out for ${hash}`, 'scrape_timeout');
          for (const waiter of pending.waiters) waiter.reject(error);
        }
      }
    };
    const timeoutTimer = setTimeout(finish, this.timeoutMs);

    const onScrape = (data: {
      infoHash?: string;
      complete?: number;
      incomplete?: number;
      announce?: string;
    }) => {
      if (finished || typeof data.infoHash !== 'string') return;
      const trackerHash = data.infoHash.toLowerCase();
      if (!byTrackerHash.has(trackerHash)) return;
      const previous = counts.get(trackerHash);
      counts.set(trackerHash, {
        complete: Math.max(previous?.complete ?? 0, Number(data.complete) || 0),
        incomplete: Math.max(previous?.incomplete ?? 0, Number(data.incomplete) || 0),
      });
      const seen = replies.get(trackerHash) ?? new Set<string>();
      seen.add(data.announce ?? '');
      replies.set(trackerHash, seen);
      if (trackerHashes.every(h => (replies.get(h)?.size ?? 0) >= trackerCount)) finish();
      else graceTimer ??= setTimeout(finish, this.graceMs);
    };

    const start = (announce: string[], hashes: Array<Buffer | string>) => {
      const client = new BTClient({
        infoHash: typeof hashes[0] === 'string' ? hashes[0] : hashes[0].toString('hex'),
        announce,
        peerId: DUMMY_PEER_ID,
        port: 6881,
      });
      clients.push(client);
      this.clients.add(client);
      client.on('scrape', onScrape);
      // A failing tracker must not fail the batch; the others or the timeout settle it.
      client.on('error', error => debug(`Scrape error: ${error.message}`));
      client.on('warning', error => debug(`Scrape warning: ${error.message}`));
      client.scrape({ infoHash: hashes });
    };

    // The UDP client packs hashes as raw bytes while the HTTP client hex-decodes them, so the
    // two take different hash types and never share a client.
    if (this.udpTrackers.length) {
      for (const chunk of chunks(trackerHashes, UDP_HASHES_PER_REQUEST)) {
        start(
          this.udpTrackers,
          chunk.map(hash => Buffer.from(hash, 'hex'))
        );
      }
    }
    if (this.httpTrackers.length) {
      for (const chunk of chunks(trackerHashes, HTTP_HASHES_PER_REQUEST)) {
        start(this.httpTrackers, chunk);
      }
    }
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
