import type { SourceSearchRequest } from '@miauflix/service-contracts';

import type { Store } from '../db/store';
import type { HttpClient } from '../http/http-client';
import { withAbort } from '../util/single-flight';
import type { AnimeEntry, AnimeLists } from './anime-lists';

export const ANI_ZIP_URL = 'https://api.ani.zip/mappings';
const DAY = 86400_000;
/** Air dates on TMDB and AniDB/TVDB may differ by a day or two (time zones, simulcast delays). */
const AIR_DATE_TOLERANCE_DAYS = 2;
/** At most this many AniList entries are read for one TMDB season. */
const MAX_ENTRIES = 6;

/** What the sources service knows about an anime title, for one search. */
export interface AnimeContext {
  /** Latin-script titles for this entry (romaji, English), most specific first. */
  titles: string[];
  /** Titles naming this season itself ("Majutsu Gakuen 2nd Season"), not the whole show. */
  seasonTitles?: string[];
  anilistId?: number;
  anidbAid?: number;
  /** Set for show episodes that were matched to an entry. */
  episode?: AnimeEpisode;
}
export interface AnimeEpisode {
  anidbEid?: number;
  /** Number within its AniList/AniDB entry (each cour usually restarts at 1). */
  number: number;
  /** Number counted from the show's first episode, as some groups release it. */
  absolute?: number;
  /**
   * The season releases of this entry name ("S2", "2nd Season"): the entry's TVDB season, or 1
   * for shows numbered from their first episode (One Piece).
   */
  releaseSeason: number;
  /** The episode's TVDB numbering, when it differs from what TMDB uses. */
  tvdb?: { season: number; episode: number };
  /** Episodes in the entry, so packs of the whole entry can be recognised. */
  entryEpisodes?: number;
  /** The year the entry started airing. */
  year?: number;
}

interface AniZipEpisode {
  anidbEid?: number | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  absoluteEpisodeNumber?: number | null;
  airDate?: string | null;
  airdate?: string | null;
}
interface AniZip {
  titles?: Record<string, string | null>;
  episodes?: Record<string, AniZipEpisode>;
  episodeCount?: number;
  mappings?: { anidb_id?: number | null };
}
interface Entry {
  entry: AnimeEntry;
  data: AniZip;
  episodes: { number: number; info: AniZipEpisode; dates: number[] }[];
}

const days = (value?: string | null) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? Math.floor(time / DAY) : null;
};
const latin = (title: string) => /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(title);

/** Turns a TMDB title (and episode) into AniList/AniDB ids, episode numbers and titles. */
export class AnimeResolver {
  constructor(
    private readonly lists: AnimeLists,
    private readonly store: Store,
    private readonly http: HttpClient,
    private readonly now = Date.now,
    private readonly url = ANI_ZIP_URL
  ) {}

  /** Null when the title is not anime, or nothing is known yet. Never throws. */
  async resolve(request: SourceSearchRequest, signal: AbortSignal): Promise<AnimeContext | null> {
    try {
      // The first download can be slow; a search waits a little, then goes on without it.
      await withAbort(
        this.lists.ensure(signal),
        AbortSignal.any([signal, AbortSignal.timeout(8000)])
      ).catch(() => undefined);
      signal.throwIfAborted();
      if (request.media.kind === 'movie') {
        const [entry] = this.lists.movie(request.media.tmdbId);
        if (!entry) return null;
        const data = await this.read(entry.anilistId, signal).catch(() => null);
        return {
          ...namesOf(data),
          anilistId: entry.anilistId,
          anidbAid: entry.anidbId ?? undefined,
        };
      }
      const all = this.lists.show(request.media.tmdbId);
      if (!all.length) return null;
      const season = request.season ?? 1;
      const forSeason = all.filter(e => e.tmdbSeason === season);
      const candidates = (
        forSeason.length ? forSeason : season > 0 ? all.filter(e => e.tmdbSeason === null) : []
      ).slice(0, MAX_ENTRIES);
      if (!candidates.length || request.episode === undefined) return { titles: [] };
      const entries = (
        await Promise.all(
          candidates.map(async entry => {
            const data = await this.read(entry.anilistId, signal).catch(() => null);
            return data ? toEntry(entry, data) : null;
          })
        )
      ).filter((e): e is Entry => e !== null);
      const match = pick(entries, season, request.episode, days(request.airDate));
      if (!match) return { titles: [...new Set(entries.flatMap(e => namesOf(e.data).titles))] };
      const { entry, episode } = match;
      const info = episode.info;
      return {
        ...namesOf(entry.data),
        anilistId: entry.entry.anilistId,
        anidbAid: entry.entry.anidbId ?? entry.data.mappings?.anidb_id ?? undefined,
        episode: {
          anidbEid: info.anidbEid ?? undefined,
          number: episode.number,
          absolute: info.absoluteEpisodeNumber ?? undefined,
          releaseSeason: entry.entry.tvdbSeason || 1,
          tvdb:
            info.seasonNumber && info.episodeNumber
              ? { season: info.seasonNumber, episode: info.episodeNumber }
              : undefined,
          entryEpisodes: entry.episodes.length || entry.data.episodeCount,
          year: firstYear(entry),
        },
      };
    } catch {
      return null;
    }
  }

  /** ani.zip's mapping of one AniList entry, cached: longer once it has finished airing. */
  private async read(anilistId: number, signal: AbortSignal): Promise<AniZip> {
    if (!this.url) throw new Error('ani.zip lookups are turned off');
    const key = `anizip:${anilistId}`;
    const cached = this.store.animeCache<AniZip>(key);
    if (cached) return cached;
    const data = await this.http.json<AniZip>(`${this.url}?anilist_id=${anilistId}`, {
      signal,
      perMinute: 60,
    });
    const latest = Math.max(
      0,
      ...Object.values(data.episodes ?? {}).map(e => days(e.airDate ?? e.airdate) ?? 0)
    );
    // A mapping without dated episodes is new or lagging: it is read again soon, like an airing one.
    const settled = latest > 0 && latest * DAY <= this.now() - 14 * DAY;
    this.store.putAnimeCache(key, data, settled ? 7 * DAY : 12 * 3600_000);
    return data;
  }
}

function firstYear(entry: Entry): number | undefined {
  const first = Math.min(...entry.episodes.flatMap(e => e.dates));
  return Number.isFinite(first) ? new Date(first * DAY).getUTCFullYear() : undefined;
}

/** Season words a later entry's title adds to the show's: "<title> 2nd Season", "<title> S2". */
const SEASON_SUFFIX =
  /[\s:-]+(?:\d{1,2}(?:st|nd|rd|th) season|season \d{1,2}|s\d{1,2}|part \d|cour \d|ii|iii|iv)(?:[\s:-]+(?:part \d|cour \d))?$/i;

const usable = (t: string) =>
  // Abbreviations ("JJK", "jjk s2", "SnK3.5") match too much.
  /\p{L}{4}/u.test(t) && t !== t.toLowerCase() && !/^\S*\d\S*$/.test(t) && latin(t);

/**
 * Latin-script titles of an entry (romaji, then English), and the show titles they extend:
 * groups name later seasons both ways ("2nd Season - 07", "S2 - 07").
 */
function namesOf(data: AniZip | null): Pick<AnimeContext, 'titles' | 'seasonTitles'> {
  const titles = data?.titles ?? {};
  const own = [titles['x-jat'], titles.en]
    .map(t => t?.replace(/\s*\((?:19|20)\d{2}\)\s*/g, ' ').trim())
    .filter((t): t is string => !!t);
  const shows = own.map(t => t.replace(SEASON_SUFFIX, '').trim());
  return {
    titles: [...new Set([...own, ...shows].filter(usable))],
    seasonTitles: own.filter(t => !shows.includes(t) && usable(t)),
  };
}

function toEntry(entry: AnimeEntry, data: AniZip): Entry {
  const episodes = Object.entries(data.episodes ?? {})
    .filter(([key]) => /^\d+$/.test(key))
    .map(([key, info]) => ({
      number: Number(key),
      info,
      dates: [days(info.airDate), days(info.airdate)].filter((d): d is number => d !== null),
    }))
    .sort((a, b) => a.number - b.number);
  return { entry, data, episodes };
}

/**
 * The entry and episode a TMDB episode is. Air dates decide first: TMDB and AniList split
 * seasons differently (cours, parts), but an episode airs on the same day everywhere. Then the
 * TVDB numbering ani.zip carries, then the order of the entries.
 */
function pick(
  entries: Entry[],
  season: number,
  episode: number,
  airDay: number | null
): { entry: Entry; episode: Entry['episodes'][number] } | null {
  const all = entries.flatMap(entry => entry.episodes.map(e => ({ entry, episode: e })));
  if (airDay !== null) {
    let best: { score: number; hit: (typeof all)[number] } | null = null;
    for (const hit of all) {
      if (!hit.episode.dates.length) continue;
      const distance = Math.min(...hit.episode.dates.map(d => Math.abs(d - airDay)));
      if (distance > AIR_DATE_TOLERANCE_DAYS) continue;
      // Two episodes on one day (double premieres): the one numbered like TMDB wins.
      const score =
        distance * 1000 +
        Math.abs((hit.episode.info.episodeNumber ?? hit.episode.number) - episode);
      if (!best || score < best.score) best = { score, hit };
    }
    if (best) return best.hit;
  }
  const byTvdb = all.find(
    hit => hit.episode.info.seasonNumber === season && hit.episode.info.episodeNumber === episode
  );
  if (byTvdb) return byTvdb;
  // Entries in airing order, their episodes counted on from one another.
  const ordered = [...entries].sort(
    (a, b) => (a.episodes[0]?.dates[0] ?? Infinity) - (b.episodes[0]?.dates[0] ?? Infinity)
  );
  let remaining = episode;
  for (const entry of ordered) {
    const count = entry.episodes.length;
    if (remaining <= count) {
      const hit = entry.episodes[remaining - 1];
      return hit ? { entry, episode: hit } : null;
    }
    remaining -= count;
  }
  return null;
}
