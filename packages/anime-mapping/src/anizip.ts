import type { AnimeEntry } from './fribb.js';

/** ani.zip's mappings: one AniList entry's ids, titles and episodes (AniDB and TVDB numbering). */
export const ANI_ZIP_URL = 'https://api.ani.zip/mappings';

export const DAY_MS = 86400_000;

export interface AniZipEpisode {
  anidbEid?: number | null;
  /** TVDB numbering. */
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  absoluteEpisodeNumber?: number | null;
  airDate?: string | null;
  airdate?: string | null;
  title?: Record<string, string | null> | null;
}
export interface AniZip {
  titles?: Record<string, string | null>;
  episodes?: Record<string, AniZipEpisode>;
  episodeCount?: number;
  mappings?: { anidb_id?: number | null };
}

/** An entry with its numbered episodes, in order. */
export interface Entry {
  entry: AnimeEntry;
  data: AniZip;
  episodes: EntryEpisode[];
}
export interface EntryEpisode {
  /** Number within the entry. */
  number: number;
  info: AniZipEpisode;
  /** Air dates in days since the epoch (ani.zip has two spellings). */
  dates: number[];
}

/** Days since the epoch, or null. */
export const days = (value?: string | null): number | null => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? Math.floor(time / DAY_MS) : null;
};

/** The entry's regular episodes (numbered keys; "S1" style specials are left out), in order. */
export function toEntry(entry: AnimeEntry, data: AniZip): Entry {
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

/** The first day the entry aired, if any episode is dated. */
export function firstDay(entry: Entry): number | undefined {
  const first = Math.min(...entry.episodes.flatMap(e => e.dates));
  return Number.isFinite(first) ? first : undefined;
}

/** The year the entry started airing. */
export function firstYear(entry: Entry): number | undefined {
  const first = firstDay(entry);
  return first === undefined ? undefined : new Date(first * DAY_MS).getUTCFullYear();
}

/** The newest dated episode, in days, or 0. */
export function latestDay(data: AniZip): number {
  return Math.max(
    0,
    ...Object.values(data.episodes ?? {}).map(e => days(e.airDate ?? e.airdate) ?? 0)
  );
}

/** Season words a later entry's title adds to the show's: "<title> 2nd Season", "<title> S2". */
export const SEASON_SUFFIX =
  /[\s:-]+(?:\d{1,2}(?:st|nd|rd|th) season|season \d{1,2}|s\d{1,2}|part \d|cour \d|ii|iii|iv)(?:[\s:-]+(?:part \d|cour \d))?$/i;

const latin = (title: string) => /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(title);

const usable = (t: string) =>
  // Abbreviations ("JJK", "jjk s2", "SnK3.5") match too much.
  /\p{L}{4}/u.test(t) && t !== t.toLowerCase() && !/^\S*\d\S*$/.test(t) && latin(t);

/** Titles without a bracketed year: "Jujutsu Kaisen (2023)" → "Jujutsu Kaisen". */
const withoutYear = (title: string) =>
  // Spaces are collapsed apart: a leading `\s*` would rescan every run of spaces (quadratic).
  title
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Latin-script titles of an entry (romaji, then English), and the show titles they extend:
 * groups name later seasons both ways ("2nd Season - 07", "S2 - 07").
 */
export function namesOf(data: AniZip | null): { titles: string[]; seasonTitles: string[] } {
  const titles = data?.titles ?? {};
  const own = [titles['x-jat'], titles.en]
    .map(t => (t ? withoutYear(t) : t))
    .filter((t): t is string => !!t);
  const shows = own.map(t => t.replace(SEASON_SUFFIX, '').trim());
  return {
    titles: [...new Set([...own, ...shows].filter(usable))],
    seasonTitles: own.filter(t => !shows.includes(t) && usable(t)),
  };
}

const simplified = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * The entry's display title. AniDB's titles include short aliases ("tr s3" as the English
 * title of Tokyo Revengers' third season), so a title naming the show wins: English first, then
 * romaji. Otherwise English, then romaji, then any other, skipping all-lowercase aliases.
 */
export function displayTitle(data: AniZip | null, showName?: string): string | undefined {
  const titles = data?.titles ?? {};
  const ordered = [titles.en, titles['x-jat'], ...Object.values(titles)]
    .filter((t): t is string => !!t)
    .map(withoutYear);
  const show = showName ? simplified(showName) : '';
  const naming = show ? ordered.slice(0, 2).find(t => simplified(t).includes(show)) : undefined;
  return naming ?? ordered.find(t => t !== t.toLowerCase()) ?? ordered[0];
}
