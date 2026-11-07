import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TraktItem } from './list-normalization';

/** AniList's public GraphQL API: no account or key needed. */
export const ANILIST_URL = 'https://graphql.anilist.co';
/** Fribb's anime-lists: the TMDB and IMDb ids of each AniList entry. */
export const ANIME_LISTS_URL =
  'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
const REFRESH_MS = 7 * 86400_000;
/** A failed download is not retried sooner than this. */
const RETRY_MS = 3600_000;
/** Without any copy to serve, a failed first download is retried much sooner. */
const RETRY_EMPTY_MS = 30_000;
const PER_PAGE = 50;

type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
interface AniListDefinition {
  name: string;
  description: string;
  variables: (now: Date) => Record<string, unknown>;
}

/** The anime season airing now; December already belongs to the next year's winter. */
export const currentSeason = (now: Date): { season: Season; seasonYear: number } => {
  const month = now.getUTCMonth();
  const seasons: Season[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  return month === 11
    ? { season: 'WINTER', seasonYear: now.getUTCFullYear() + 1 }
    : { season: seasons[Math.floor((month + 1) / 3) % 4], seasonYear: now.getUTCFullYear() };
};

/** from AniList's own rankings. */
export const aniListDefinitions: Record<string, AniListDefinition> = {
  'anilist-season-popular': {
    name: 'Popular Anime This Season',
    description: 'The most popular anime airing this season, from AniList',
    variables: now => ({ sort: ['POPULARITY_DESC'], ...currentSeason(now) }),
  },
  'anilist-trending': {
    name: 'Trending Anime',
    description: 'Anime trending on AniList',
    variables: () => ({ sort: ['TRENDING_DESC'] }),
  },
  'anilist-all-time-popular': {
    name: 'All-Time Popular Anime',
    description: 'The most popular anime of all time, from AniList',
    variables: () => ({ sort: ['POPULARITY_DESC'] }),
  },
};

const QUERY = `query ($page: Int, $perPage: Int, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total lastPage }
    media(type: ANIME, isAdult: false, sort: $sort, season: $season, seasonYear: $seasonYear,
          format_in: [TV, TV_SHORT, ONA, OVA, MOVIE, SPECIAL]) { id format }
  }
}`;

interface AniListPage {
  data?: {
    Page?: {
      pageInfo?: { total?: number; lastPage?: number };
      media?: { id: number; format: string | null }[];
    };
  };
  errors?: { message?: string }[];
}
interface FribbRow {
  anilist_id?: number;
  themoviedb_id?: { tv?: number; movie?: number[] | number };
  imdb_id?: string[] | string;
}
/** AniList id → [TMDB show, TMDB film, IMDb id]. */
type Ids = [tv: number | null, movie: number | null, imdb: string | null];

/**
 * AniList rankings as list pages. AniList numbers each season (cour) separately, so its entries
 * are turned into TMDB ids with Fribb's list (kept on disk, refreshed weekly); several cours of
 * one show become one TMDB show, and entries TMDB does not know are left out.
 */
export class AniListLists {
  private ids = new Map<number, Ids>();
  private loadedAt = 0;
  private attemptedAt = 0;
  private loading: Promise<void> | null = null;
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now = Date.now,
    private readonly urls = { anilist: ANILIST_URL, animeLists: ANIME_LISTS_URL }
  ) {
    this.file = join(dataDir, 'anime-ids.json');
  }

  has(listId: string): boolean {
    return Object.hasOwn(aniListDefinitions, listId);
  }

  async page(
    listId: string,
    page: number
  ): Promise<{ items: TraktItem[]; totalItems: number; totalPages: number }> {
    if (!this.has(listId)) throw new Error('List not found');
    const definition = aniListDefinitions[listId]!;
    const [, response] = await Promise.all([
      this.ensureIds(),
      this.fetchImpl(this.urls.anilist, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          query: QUERY,
          variables: { page, perPage: PER_PAGE, ...definition.variables(new Date(this.now())) },
        }),
        signal: AbortSignal.timeout(15_000),
      }),
    ]);
    if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
    const body = (await response.json()) as AniListPage;
    if (body.errors?.length) throw new Error(body.errors[0]?.message ?? 'AniList error');
    const result = body.data?.Page;
    const items = (result?.media ?? []).flatMap((media): TraktItem[] => {
      const [tv, movie, imdb] = this.ids.get(media.id) ?? [null, null, null];
      if (media.format === 'MOVIE') {
        return movie || imdb ? [{ movie: { ids: { tmdb: movie, imdb } } }] : [];
      }
      return tv ? [{ show: { ids: { tmdb: tv } } }] : [];
    });
    return {
      items,
      totalItems: result?.pageInfo?.total ?? items.length,
      totalPages: result?.pageInfo?.lastPage ?? 1,
    };
  }

  private async ensureIds(): Promise<void> {
    if (!this.loadedAt) this.readFile();
    if (this.loadedAt && this.now() - this.loadedAt < REFRESH_MS) return;
    const cooldown = this.loadedAt ? RETRY_MS : RETRY_EMPTY_MS;
    if (!this.loading && this.now() - this.attemptedAt >= cooldown) {
      this.attemptedAt = this.now();
      this.loading = this.download().finally(() => {
        this.loading = null;
      });
      // Nobody may be waiting for a background refresh.
      this.loading.catch(() => undefined);
    }
    // A stale copy keeps serving while it is refreshed, without waiting for the download.
    if (this.loadedAt) return;
    if (!this.loading) throw new Error('Anime list unavailable');
    await this.loading;
  }

  private async download(): Promise<void> {
    const response = await this.fetchImpl(this.urls.animeLists, {
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`Anime list HTTP ${response.status}`);
    const rows = (await response.json()) as FribbRow[];
    if (!Array.isArray(rows)) throw new Error('Unexpected anime list');
    const compact: [number, ...Ids][] = rows.flatMap(row => {
      if (!row.anilist_id) return [];
      const movies = row.themoviedb_id?.movie;
      const movie = (Array.isArray(movies) ? movies[0] : movies) ?? null;
      const tv = row.themoviedb_id?.tv ?? null;
      const imdb = (Array.isArray(row.imdb_id) ? row.imdb_id[0] : row.imdb_id) ?? null;
      return tv || movie || imdb ? [[row.anilist_id, tv, movie, imdb]] : [];
    });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(compact));
    renameSync(temporary, this.file);
    this.index(compact, this.now());
  }

  private readFile(): void {
    if (!existsSync(this.file)) return;
    try {
      this.index(JSON.parse(readFileSync(this.file, 'utf8')), statSync(this.file).mtimeMs);
    } catch {
      // A damaged copy is replaced by the next download.
    }
  }

  private index(rows: [number, ...Ids][], loadedAt: number): void {
    this.ids = new Map(rows.map(([id, ...ids]) => [id, ids]));
    this.loadedAt = loadedAt;
  }
}
