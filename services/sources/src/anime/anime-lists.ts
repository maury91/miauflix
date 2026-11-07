import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { HttpClient } from '../http/http-client';
import { SingleFlight, withAbort } from '../util/single-flight';

/** Fribb's anime-lists: every AniDB/AniList entry with its TMDB and TVDB ids and season. */
export const ANIME_LISTS_URL =
  'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
const REFRESH_MS = 7 * 86400_000;
/** Kinds that hold the episodes of a TMDB season; movies and specials are matched separately. */
const SERIES = new Set(['TV', 'ONA', 'OVA']);

export interface AnimeEntry {
  anilistId: number;
  anidbId: number | null;
  type: string;
  /** Season number on TMDB and TVDB; absent for long-running shows numbered by arc. */
  tmdbSeason: number | null;
  tvdbSeason: number | null;
}
interface FribbRow {
  type?: string;
  anilist_id?: number;
  anidb_id?: number;
  themoviedb_id?: { tv?: number; movie?: number[] | number };
  season?: { tvdb?: number; tmdb?: number };
}
type Compact = [
  anilistId: number,
  anidbId: number | null,
  type: string,
  tmdbTv: number | null,
  tmdbMovies: number[],
  tmdbSeason: number | null,
  tvdbSeason: number | null,
];

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
      const temporary = `${this.file}.tmp`;
      writeFileSync(temporary, JSON.stringify(compact));
      renameSync(temporary, this.file);
      this.index(compact, this.now());
    });
    await withAbort(download, signal);
  }

  private readFile(): void {
    if (!existsSync(this.file)) return;
    try {
      const compact = JSON.parse(readFileSync(this.file, 'utf8')) as Compact[];
      this.index(compact, statSync(this.file).mtimeMs);
    } catch {
      // A damaged copy is replaced by the next download.
    }
  }

  private index(rows: Compact[], loadedAt: number): void {
    const shows = new Map<number, AnimeEntry[]>();
    const movies = new Map<number, AnimeEntry[]>();
    const add = (map: Map<number, AnimeEntry[]>, id: number, entry: AnimeEntry) =>
      map.set(id, [...(map.get(id) ?? []), entry]);
    for (const [anilistId, anidbId, type, tv, movieIds, tmdbSeason, tvdbSeason] of rows) {
      const entry = { anilistId, anidbId, type, tmdbSeason, tvdbSeason };
      if (tv && SERIES.has(type)) add(shows, tv, entry);
      for (const id of movieIds) add(movies, id, entry);
    }
    this.shows = shows;
    this.movies = movies;
    this.loadedAt = loadedAt;
  }
}

function toCompact(row: FribbRow): Compact[] {
  if (!row.anilist_id || !row.themoviedb_id) return [];
  const movie = row.themoviedb_id.movie;
  const movies = (Array.isArray(movie) ? movie : movie ? [movie] : []).filter(Number.isInteger);
  const tv = Number.isInteger(row.themoviedb_id.tv) ? row.themoviedb_id.tv! : null;
  if (!tv && !movies.length) return [];
  return [
    [
      row.anilist_id,
      row.anidb_id ?? null,
      row.type ?? 'UNKNOWN',
      tv,
      movies,
      row.season?.tmdb ?? null,
      row.season?.tvdb ?? null,
    ],
  ];
}
