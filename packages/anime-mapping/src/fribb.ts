/** Fribb's anime-lists: every AniDB/AniList entry with its TMDB and TVDB ids and season. */
export const ANIME_LISTS_URL =
  'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';

/** Kinds that hold the episodes of a TMDB season; movies and specials are matched separately. */
export const SERIES_KINDS: ReadonlySet<string> = new Set(['TV', 'TV_SHORT', 'ONA', 'OVA']);

export interface AnimeEntry {
  anilistId: number;
  anidbId: number | null;
  type: string;
  /** Season number on TMDB and TVDB; absent for long-running shows numbered by arc. */
  tmdbSeason: number | null;
  tvdbSeason: number | null;
}

/** One row of Fribb's list, as downloaded. */
export interface FribbRow {
  type?: string;
  anilist_id?: number;
  anidb_id?: number;
  themoviedb_id?: { tv?: number; movie?: number[] | number };
  season?: { tvdb?: number; tmdb?: number };
}

/** A row kept on disk: only what is needed to find a title's entries. */
export type CompactRow = [
  anilistId: number,
  anidbId: number | null,
  type: string,
  tmdbTv: number | null,
  tmdbMovies: number[],
  tmdbSeason: number | null,
  tvdbSeason: number | null,
];

/** The rows of Fribb's list that name an AniList entry and a TMDB title. */
export function toCompact(row: FribbRow): CompactRow[] {
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

export interface AnimeIndexMaps {
  /** TMDB show id → its series entries. */
  shows: Map<number, AnimeEntry[]>;
  /** TMDB movie id → its entries. */
  movies: Map<number, AnimeEntry[]>;
}

/** TMDB ids to anime entries, from the compact rows. */
export function indexCompact(rows: readonly CompactRow[]): AnimeIndexMaps {
  const shows = new Map<number, AnimeEntry[]>();
  const movies = new Map<number, AnimeEntry[]>();
  const add = (map: Map<number, AnimeEntry[]>, id: number, entry: AnimeEntry) =>
    map.set(id, [...(map.get(id) ?? []), entry]);
  for (const [anilistId, anidbId, type, tv, movieIds, tmdbSeason, tvdbSeason] of rows) {
    const entry = { anilistId, anidbId, type, tmdbSeason, tvdbSeason };
    if (tv && SERIES_KINDS.has(type)) add(shows, tv, entry);
    for (const id of movieIds) add(movies, id, entry);
  }
  return { shows, movies };
}
