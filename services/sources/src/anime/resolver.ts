import {
  ANI_ZIP_URL,
  type AniZip,
  DAY_MS,
  days,
  type Entry,
  firstYear,
  latestDay,
  namesOf,
  pickEpisode,
  toEntry,
} from '@miauflix/anime-mapping';
import type { SourceSearchRequest } from '@miauflix/service-contracts';

import type { Store } from '../db/store';
import type { HttpClient } from '../http/http-client';
import { withAbort } from '../util/single-flight';
import type { AnimeLists } from './anime-lists';

export { ANI_ZIP_URL };
const DAY = DAY_MS;
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
      const match = pickEpisode(entries, season, request.episode, days(request.airDate));
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
    const latest = latestDay(data);
    // A mapping without dated episodes is new or lagging: it is read again soon, like an airing one.
    const settled = latest > 0 && latest * DAY <= this.now() - 14 * DAY;
    this.store.putAnimeCache(key, data, settled ? 7 * DAY : 12 * 3600_000);
    return data;
  }
}
