import { call, contract } from '@miauflix/contract';

/** Swarm size reported by trackers; each value is the highest any tracker gave. */
export interface SwarmCounts {
  /** Seeders */
  complete: number;
  /** Leechers */
  incomplete: number;
}

export type SwarmStatsError = 'invalid_hash' | 'scrape_timeout' | 'scrape_unavailable';

/**
 * The torrent engine. 1.0 covers tracker scrapes. Later minors add downloads, storage and byte
 * ranges as they move out of the backend (see `docs/architecture/service-contract-v2.md`).
 */
export const mediaLoad = contract('media-load', '1.0', {
  /**
   * Seeders and leechers for a v1 (40-hex) or v2 (64-hex) info hash. Requests within a short
   * window share one multi-hash scrape per tracker, and results are reused for a minute.
   */
  swarmStats: call<{ hash: string }, SwarmCounts, SwarmStatsError>({ dedupe: true }),
});
export type MediaLoad = typeof mediaLoad;
