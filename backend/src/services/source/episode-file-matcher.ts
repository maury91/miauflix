import { parseAnimeRelease } from '@miauflix/source-metadata-extractor';

import type { SourceMetadata } from '@services/sources-client/source-candidate';

import { isVideoFile } from './video-files';

export interface EpisodeFileMatch {
  videoFilePath: string | null;
  matchKind: 'combined' | 'single';
}

/** Match exact episode filenames first; a multi-episode video is returned only as fallback. */
export function matchEpisodeFile(
  source: SourceMetadata,
  seasonNumber: number,
  episodeNumber: number,
  allowCombined = false
): EpisodeFileMatch | null {
  const videoFiles = (source.files ?? []).filter(isVideoFile);
  let exact = videoFiles.filter(path => {
    const identity = episodeIdentity(path, seasonNumber);
    return identity.episodes.length === 1 && identity.episodes[0] === episodeNumber;
  });
  // Anime packs number their files by cour ("S2 - 07") or from the first episode ("- 31").
  if (!exact.length && source.episodeAliases?.length)
    exact = videoFiles.filter(path =>
      namesAnimeEpisode(path, source, { season: seasonNumber, episode: episodeNumber })
    );
  if (exact.length === 1) return { videoFilePath: exact[0], matchKind: 'single' };
  if (exact.length > 1) return null;

  // Trust release metadata for a lone video only when its filename names no episode itself.
  if (
    source.season === seasonNumber &&
    source.episode === episodeNumber &&
    videoFiles.length === 1 &&
    !namesAnyEpisode(videoFiles[0])
  ) {
    return { videoFilePath: videoFiles[0], matchKind: 'single' };
  }

  if (!allowCombined) return null;
  const combined = videoFiles.filter(path => {
    const identity = episodeIdentity(path, seasonNumber);
    return identity.episodes.length > 1 && identity.episodes.includes(episodeNumber);
  });
  if (combined.length === 1) return { videoFilePath: combined[0], matchKind: 'combined' };
  if (
    source.season === seasonNumber &&
    source.episode === episodeNumber &&
    /(?:e\d{1,3}\s*[-&+]\s*e?\d{1,3}|e\d{1,3}e\d{1,3})/i.test(source.releaseName ?? '')
  ) {
    const named = source.files?.find(isVideoFile) ?? null;
    return named ? { videoFilePath: named, matchKind: 'combined' } : null;
  }
  return null;
}

/**
 * Whether an anime file names the episode in one of the numberings the sources service gave
 * (`episodeAliases`). A file without a season marker inherits the pack's; a number counted from
 * the first episode (an alias without a season) only matches files that name no season.
 */
function namesAnimeEpisode(
  path: string,
  source: SourceMetadata,
  requested: { season: number; episode: number }
): boolean {
  const file = parseAnimeRelease(path);
  if (file.extra) return false;
  const aliases = [requested, ...(source.episodeAliases ?? [])];
  if (file.pairs.length)
    return file.pairs.some(pair =>
      aliases.some(alias => alias.season === pair.season && alias.episode === pair.episode)
    );
  if (file.episode === undefined) return false;
  const season = file.season ?? parseAnimeRelease(source.releaseName ?? '').season ?? 1;
  return aliases.some(
    alias =>
      alias.episode === file.episode &&
      (alias.season === undefined ? file.season === undefined : alias.season === season)
  );
}

const EPISODE_EXPRESSIONS = [
  /s(\d{1,2})[ ._-]*e(\d{1,3})(?!\d)((?:[ ._-]*e\d{1,3}(?!\d))|(?:\s*[-–]\s*e?\d{1,3}(?!\d)))*/gi,
  /(?:^|\D)(\d{1,2})x(\d{1,3})(?!\d)(?:(?:[ ._-]*\d{1,2}x\d{1,3}(?!\d))|(?:\s*[-–]\s*\d{1,2}x?\d{1,3}(?!\d)))*/gi,
];

/** True when the filename carries any SxxEyy or NxM episode marker, whatever its season. */
function namesAnyEpisode(name: string): boolean {
  return EPISODE_EXPRESSIONS.some(expression => new RegExp(expression.source, 'i').test(name));
}

function episodeIdentity(name: string, seasonNumber: number): { episodes: number[] } {
  const episodes = new Set<number>();
  for (const expression of EPISODE_EXPRESSIONS) {
    for (const match of name.matchAll(expression)) {
      const foundSeason = Number(match[1]);
      if (foundSeason !== seasonNumber) continue;
      const firstEpisode = Number(match[2]);
      episodes.add(firstEpisode);
      const suffix = match[3] ?? match[0].slice(match[0].indexOf(match[2]) + match[2].length);
      // An NxM suffix names its own season; only same-season episodes extend the range.
      for (const token of suffix.matchAll(/(?:(\d{1,2})x|e)?(\d{1,3})/gi)) {
        if (token[1] !== undefined && Number(token[1]) !== seasonNumber) continue;
        const value = Number(token[2]);
        if (value > firstEpisode && value <= firstEpisode + 20) {
          for (let episode = firstEpisode + 1; episode <= value; episode++) episodes.add(episode);
        }
      }
    }
  }
  return { episodes: [...episodes] };
}
