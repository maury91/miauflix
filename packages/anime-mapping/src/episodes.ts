import { days, type Entry, type EntryEpisode, firstDay } from './anizip.js';

/** Air dates on TMDB and AniDB/TVDB may differ by a day or two (time zones, simulcast delays). */
export const AIR_DATE_TOLERANCE_DAYS = 2;

/**
 * The entry and episode a TMDB episode is. Air dates decide first: TMDB and AniList split
 * seasons differently (cours, parts), but an episode airs on the same day everywhere. Then the
 * TVDB numbering ani.zip carries, then the order of the entries.
 */
export function pickEpisode(
  entries: Entry[],
  season: number,
  episode: number,
  airDay: number | null
): { entry: Entry; episode: EntryEpisode } | null {
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
  let remaining = episode;
  for (const entry of inAiringOrder(entries)) {
    const count = entry.episodes.length;
    if (remaining <= count) {
      const hit = entry.episodes[remaining - 1];
      return hit ? { entry, episode: hit } : null;
    }
    remaining -= count;
  }
  return null;
}

/** Entries in the order they aired (undated ones last, by TVDB season). */
export function inAiringOrder(entries: readonly Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) =>
      (firstDay(a) ?? Infinity) - (firstDay(b) ?? Infinity) ||
      (a.entry.tvdbSeason ?? Infinity) - (b.entry.tvdbSeason ?? Infinity) ||
      a.entry.anilistId - b.entry.anilistId
  );
}

/** A TMDB episode, as the layout reads it. */
export interface ProviderEpisode {
  mediaId: number;
  seasonNumber: number;
  episodeNumber: number;
  airDate: string | null;
}

/** One season of the AniList layout. */
export interface LayoutSeason {
  seasonNumber: number;
  /** The AniList entry; null for episodes TMDB lists before any entry holds them. */
  anilistId: number | null;
  entry: Entry | null;
  episodes: LayoutEpisode[];
}
export interface LayoutEpisode {
  mediaId: number;
  /** Number within the AniList entry (or within the trailing season). */
  episodeNumber: number;
  providerSeasonNumber: number;
  providerEpisodeNumber: number;
  airDate: string | null;
}

/** Leftover episodes this close to the previous one continue its entry (a weekly run). */
const CONTINUATION_GAP_DAYS = 21;

/** Kinds that make a season of their own; OVAs and specials stay in TMDB's season 0. */
const SEASON_KINDS = new Set(['TV', 'TV_SHORT', 'ONA']);

/**
 * Seasons by AniList entry for a TMDB show, or null to keep TMDB's seasons.
 *
 * The AniList layout is used when it splits the show more finely than TMDB (Tokyo Revengers:
 * one TMDB season, four entries), never for long-running shows numbered by arc (an entry
 * without a TMDB season: One Piece keeps TMDB's arcs). TMDB episodes are walked in order and
 * matched to the entries' episodes by air date, moving forward only so no episode is used
 * twice; an undated pair is matched by position. TMDB episodes after the last entry's
 * episodes continue that entry while they keep its weekly run (an airing cour ani.zip lists
 * only up to now); after a longer gap (a cour TMDB lists before AniList has it) they make one
 * trailing season, so they never shift the numbering before them.
 */
export function layoutSeasons(
  providerEpisodes: readonly ProviderEpisode[],
  entries: readonly Entry[]
): LayoutSeason[] | null {
  const regular = [...providerEpisodes]
    .filter(e => e.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
  const seasonEntries = entries.filter(
    e => SEASON_KINDS.has(e.entry.type) && e.entry.tmdbSeason !== 0
  );
  if (!regular.length || !seasonEntries.length) return null;
  if (seasonEntries.some(e => e.entry.tmdbSeason === null)) return null;
  const providerSeasons = new Set(regular.map(e => e.seasonNumber)).size;
  if (seasonEntries.length <= providerSeasons) return null;

  const slots = inAiringOrder(seasonEntries).flatMap(entry =>
    entry.episodes.map(episode => ({ entry, episode }))
  );
  const assigned = new Map<Entry, LayoutEpisode[]>();
  const trailing: LayoutEpisode[] = [];
  let next = 0;
  /** The last matched episode, which leftover episodes may continue. */
  let last: { entry: Entry; number: number; airDay: number | null } | null = null;
  for (const episode of regular) {
    let index = -1;
    const airDay = days(episode.airDate);
    if (airDay !== null) {
      let best = Infinity;
      for (let i = next; i < slots.length; i++) {
        const dates = slots[i]!.episode.dates;
        if (!dates.length) continue;
        const distance = Math.min(...dates.map(d => Math.abs(d - airDay)));
        if (distance <= AIR_DATE_TOLERANCE_DAYS && distance < best) {
          best = distance;
          index = i;
        }
        // Slots are in airing order: nothing later can be closer.
        if (Math.min(...dates) - airDay > AIR_DATE_TOLERANCE_DAYS) break;
      }
    }
    if (index < 0 && next < slots.length) index = next;
    if (index < 0 && last && !trailing.length) {
      const gap = airDay === null || last.airDay === null ? 0 : airDay - last.airDay;
      if (gap <= CONTINUATION_GAP_DAYS) {
        last = { entry: last.entry, number: last.number + 1, airDay: airDay ?? last.airDay };
        assigned.get(last.entry)!.push({
          mediaId: episode.mediaId,
          episodeNumber: last.number,
          providerSeasonNumber: episode.seasonNumber,
          providerEpisodeNumber: episode.episodeNumber,
          airDate: episode.airDate,
        });
        continue;
      }
    }
    if (index < 0) {
      trailing.push({
        mediaId: episode.mediaId,
        episodeNumber: trailing.length + 1,
        providerSeasonNumber: episode.seasonNumber,
        providerEpisodeNumber: episode.episodeNumber,
        airDate: episode.airDate,
      });
      continue;
    }
    const slot = slots[index]!;
    next = index + 1;
    const list = assigned.get(slot.entry) ?? [];
    list.push({
      mediaId: episode.mediaId,
      episodeNumber: slot.episode.number,
      providerSeasonNumber: episode.seasonNumber,
      providerEpisodeNumber: episode.episodeNumber,
      airDate: episode.airDate,
    });
    assigned.set(slot.entry, list);
    last = { entry: slot.entry, number: slot.episode.number, airDay };
  }

  const seasons: LayoutSeason[] = [];
  for (const entry of inAiringOrder(seasonEntries)) {
    const episodes = assigned.get(entry);
    if (!episodes?.length) continue;
    seasons.push({
      seasonNumber: seasons.length + 1,
      anilistId: entry.entry.anilistId,
      entry,
      episodes,
    });
  }
  if (trailing.length)
    seasons.push({
      seasonNumber: seasons.length + 1,
      anilistId: null,
      entry: null,
      episodes: trailing,
    });
  return seasons;
}

/**
 * A season's name from its entry's title, without the show's: "Tokyo Revengers: Christmas
 * Showdown" → "Christmas Showdown", "Attack on Titan Season 3 Part 2" → "Season 3 Part 2".
 * The first season, or an entry named like the show, is "Season <n>".
 */
export function seasonName(
  showName: string,
  entryTitle: string | undefined,
  seasonNumber: number
): string {
  const fallback = `Season ${seasonNumber}`;
  if (!entryTitle) return fallback;
  const simplify = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const show = simplify(showName);
  const words = entryTitle.split(/(\s+)/);
  // Drop leading words of the entry title while they spell the show's name.
  for (let cut = words.length; cut > 0; cut--) {
    const head = simplify(words.slice(0, cut).join(''));
    if (head && head === show) {
      const rest = words
        .slice(cut)
        .join('')
        .replace(/^[\s:\-–—~|.,]+/, '')
        .trim();
      return rest || fallback;
    }
  }
  return seasonNumber === 1 ? fallback : entryTitle;
}
