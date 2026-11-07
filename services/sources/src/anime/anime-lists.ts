import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ANIME_LISTS_URL,
  type AnimeEntry,
  type CompactRow,
  type FribbRow,
  indexCompact,
  toCompact,
} from '@miauflix/anime-mapping';

import type { HttpClient } from '../http/http-client';
import { SingleFlight, withAbort } from '../util/single-flight';

export { ANIME_LISTS_URL, type AnimeEntry };
const REFRESH_MS = 7 * 86400_000;

/**
 * TMDB ids to anime entries. Kept on disk in a compact form and refreshed weekly; a failed refresh
 * keeps the previous copy. Nothing is fetched until a search asks, so the download only happens
 * once the service has checked its connection.
 */
export class AnimeLists {
  private shows = new Map<number, AnimeEntry[]>();
  private movies = new Map<number, AnimeEntry[]>();
  private loadedAt = 0;
  private attemptedAt = 0;
  private readonly flights = new SingleFlight();
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly http: HttpClient,
    private readonly now = Date.now,
    private readonly url = ANIME_LISTS_URL
  ) {
    this.file = join(dataDir, 'anime-lists.json');
  }

  /** Entries holding the episodes of a TMDB show (series kinds only). */
  show(tmdbId: number): AnimeEntry[] {
    return this.shows.get(tmdbId) ?? [];
  }
  movie(tmdbId: number): AnimeEntry[] {
    return this.movies.get(tmdbId) ?? [];
  }
  get ready(): boolean {
    return this.loadedAt > 0;
  }

  /** Loads the saved copy, then downloads a new one when it is a week old (at most hourly). */
  async ensure(signal: AbortSignal): Promise<void> {
    if (!this.url) return; // Mapping turned off (tests that count requests).
    if (!this.loadedAt) this.readFile();
    const stale = this.now() - this.loadedAt > REFRESH_MS;
    if (!stale || this.now() - this.attemptedAt < 3600_000) return;
    // Not tied to the caller: a slow first download finishes for the next search.
    const download = this.flights.run('download', async () => {
      this.attemptedAt = this.now();
      const rows = await this.http.json<FribbRow[]>(this.url, {
        timeoutMs: 180_000,
        maxBytes: 64 * 1024 * 1024,
      });
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
    });
    await withAbort(download, signal);
  }

  private readFile(): void {
    if (!existsSync(this.file)) return;
    try {
      const compact = JSON.parse(readFileSync(this.file, 'utf8')) as CompactRow[];
      this.index(compact, statSync(this.file).mtimeMs);
    } catch {
      // A damaged copy is replaced by the next download.
    }
  }

  private index(rows: CompactRow[], loadedAt: number): void {
    const { shows, movies } = indexCompact(rows);
    this.shows = shows;
    this.movies = movies;
    this.loadedAt = loadedAt;
  }
}
