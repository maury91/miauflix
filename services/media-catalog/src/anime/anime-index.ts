import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ANI_ZIP_URL,
  ANIME_LISTS_URL,
  type AnimeEntry,
  type AniZip,
  type CompactRow,
  type FribbRow,
  indexCompact,
  toCompact,
} from '@miauflix/anime-mapping';

import { logger } from '../logger';
import type { ApiCache } from '../utils/api-cache';

const SCOPE = 'AnimeIndex';
const REFRESH_MS = 7 * 86400_000;
/** A failed download is not retried sooner than this. */
const RETRY_MS = 3600_000;
const ANI_ZIP_TTL_MS = 24 * 3600_000;
/** How long a request waits for the first download before going on with TMDB's seasons. */
const FIRST_DOWNLOAD_WAIT_MS = 8_000;

export interface AnimeIndexUrls {
  /** Fribb's anime-lists; empty turns anime numbering off. */
  animeLists: string;
  /** ani.zip's mappings endpoint; empty turns anime numbering off. */
  aniZip: string;
}

export const DEFAULT_ANIME_URLS: AnimeIndexUrls = {
  animeLists: ANIME_LISTS_URL,
  aniZip: ANI_ZIP_URL,
};

/**
 * Which TMDB shows are anime, and their AniList entries. Fribb's list is kept compact in the data
 * directory and refreshed weekly in the background (a stale copy keeps serving; a failed download
 * waits an hour); ani.zip answers are cached in the API cache.
 */
export class AnimeIndex {
  private shows = new Map<number, AnimeEntry[]>();
  private loadedAt = 0;
  private attemptedAt = 0;
  private loading: Promise<void> | null = null;
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly cache: ApiCache,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly urls: AnimeIndexUrls = DEFAULT_ANIME_URLS,
    private readonly firstDownloadWaitMs = FIRST_DOWNLOAD_WAIT_MS
  ) {
    this.file = join(dataDir, 'anime-lists.json');
  }

  get enabled(): boolean {
    return !!this.urls.animeLists && !!this.urls.aniZip;
  }

  /** A show's AniList series entries; null while the list is not available yet. */
  async showEntries(tmdbId: number): Promise<AnimeEntry[] | null> {
    if (!this.enabled) return null;
    try {
      await this.ensure();
    } catch (error) {
      logger.warn(SCOPE, 'Anime list unavailable', error);
      return null;
    }
    return this.shows.get(tmdbId) ?? [];
  }

  /** ani.zip's mapping of one AniList entry, or null when it cannot be read. */
  async aniZip(anilistId: number): Promise<AniZip | null> {
    if (!this.enabled) return null;
    try {
      return await this.cache.wrap(`anime:anizip:${anilistId}`, ANI_ZIP_TTL_MS, async () => {
        const response = await this.fetchImpl(`${this.urls.aniZip}?anilist_id=${anilistId}`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new Error(`ani.zip HTTP ${response.status}`);
        return (await response.json()) as AniZip;
      });
    } catch (error) {
      logger.warn(SCOPE, `ani.zip mapping of AniList ${anilistId} unavailable`, error);
      return null;
    }
  }

  private async ensure(): Promise<void> {
    if (!this.loadedAt) this.readFile();
    if (this.loadedAt && this.now() - this.loadedAt < REFRESH_MS) return;
    if (!this.loading && this.now() - this.attemptedAt >= RETRY_MS) {
      this.attemptedAt = this.now();
      this.loading = this.download().finally(() => {
        this.loading = null;
      });
      this.loading.catch(error => logger.warn(SCOPE, 'Anime list download failed', error));
    }
    // A stale copy keeps serving while it is refreshed.
    if (this.loadedAt) return;
    if (!this.loading) throw new Error('Anime list unavailable');
    // The first download (no saved copy yet) can take minutes: a request waits a little, then
    // goes on with TMDB's seasons while the download continues in the background.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.loading,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Anime list is still downloading')),
            this.firstDownloadWaitMs
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async download(): Promise<void> {
    const response = await this.fetchImpl(this.urls.animeLists, {
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`Anime list HTTP ${response.status}`);
    const rows = (await response.json()) as FribbRow[];
    if (!Array.isArray(rows)) throw new Error('Unexpected anime list');
    const compact = rows.flatMap(toCompact);
    // A name of its own: another process may be writing the same list into a shared folder.
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(compact));
      renameSync(temporary, this.file);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.index(compact, this.now());
  }

  private readFile(): void {
    if (!existsSync(this.file)) return;
    try {
      const rows = JSON.parse(readFileSync(this.file, 'utf8')) as CompactRow[];
      this.index(rows, statSync(this.file).mtimeMs);
    } catch {
      // A damaged copy is replaced by the next download.
    }
  }

  private index(rows: CompactRow[], loadedAt: number): void {
    this.shows = indexCompact(rows).shows;
    this.loadedAt = loadedAt;
  }
}
