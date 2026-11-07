import { parseAnimeRelease } from '@miauflix/source-metadata-extractor';

import type { AnimeContext } from './resolver';

export type AnimeMatch = 'episode' | 'pack';

/**
 * Whether a release holds the searched episode, in any numbering it may use: TMDB's or TVDB's
 * `SxxEyy`, the episode within its cour ("S2 - 07"), or counted from the first episode ("- 31").
 * As in anitorrent, a later season must be named: a bare "- 07" is season 1 unless the release
 * is titled after the season itself ("Jujutsu Kaisen 2nd Season - 07", "Kimetsu no Yaiba
 * Yuukaku-hen - 07").
 */
export function matchAnimeRelease(
  name: string,
  anime: AnimeContext,
  request: { season?: number; episode?: number },
  namedAfterEntry: boolean,
  showYear?: number | null
): AnimeMatch | null {
  const episode = anime.episode;
  if (!episode) return null;
  const release = parseAnimeRelease(name, anime.titles);
  if (release.extra) return null;
  // Each numbering an anime release may use, with the season it is counted in.
  const numberings: { season: number | undefined; episode: number | undefined }[] = [
    { season: episode.releaseSeason, episode: episode.number },
    { season: request.season, episode: request.episode },
    { season: episode.tvdb?.season, episode: episode.tvdb?.episode },
  ];
  if (release.pairs.length)
    return release.pairs.some(found =>
      numberings.some(n => n.season === found.season && n.episode === found.episode)
    )
      ? 'episode'
      : null;
  if (release.season !== undefined && !numberings.some(n => n.season === release.season))
    return null;
  // A bracketed year stands for the season that started airing then ("Title (2023) - 02");
  // the show's own first year says nothing about the season.
  let yearNamesEntry = false;
  if (release.season === undefined && release.year && episode.year && release.year !== showYear) {
    if (Math.abs(release.year - episode.year) > 1) return null;
    yearNamesEntry = true;
  }
  // Without a marker a number is season 1's, unless the name or year is the entry's own.
  const season = release.season ?? (namedAfterEntry || yearNamesEntry ? episode.releaseSeason : 1);
  const numbers = [
    ...numberings.filter(n => n.season === season && n.episode).map(n => n.episode!),
    // Counted from the show's start ("- 31", sometimes with "(Season 2)" beside it).
    ...(episode.absolute ? [episode.absolute] : []),
  ];
  if (release.episode !== undefined) return numbers.includes(release.episode) ? 'episode' : null;
  if (release.range) {
    const [from, to] = release.range;
    return numbers.some(n => n >= from && n <= to) ? 'pack' : null;
  }
  if (release.pack && numberings.some(n => n.season === season)) return 'pack';
  return null;
}

/** Other `{season, episode}` names a pack's files may give the searched episode. */
export function episodeAliases(
  anime: AnimeContext,
  request: { season?: number; episode?: number }
): { season?: number; episode: number }[] {
  const episode = anime.episode;
  if (!episode) return [];
  const aliases = [
    episode.tvdb,
    { season: episode.releaseSeason, episode: episode.number },
    ...(episode.releaseSeason === 1 ? [{ episode: episode.number }] : []),
    ...(episode.absolute ? [{ episode: episode.absolute }] : []),
  ].filter((a): a is { season?: number; episode: number } => !!a);
  const seen = new Set([`${request.season}:${request.episode}`]);
  return aliases.filter(alias => {
    const key = `${alias.season}:${alias.episode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
