import type { SourceMetadata } from '@content-directories/content-directory.abstract';
import { isVideoFile } from '@services/download/download.utils';

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
  const exact = videoFiles.filter(path => {
    const identity = episodeIdentity(path, seasonNumber);
    return identity.episodes.length === 1 && identity.episodes[0] === episodeNumber;
  });
  if (exact.length === 1) return { videoFilePath: exact[0], matchKind: 'single' };
  if (exact.length > 1) return null;

  if (
    source.season === seasonNumber &&
    source.episode === episodeNumber &&
    videoFiles.length === 1
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

function episodeIdentity(name: string, seasonNumber: number): { episodes: number[] } {
  const episodes = new Set<number>();
  const expressions = [
    /s(\d{1,2})[ ._-]*e(\d{1,3})(?!\d)((?:[ ._-]*e\d{1,3}(?!\d))|(?:\s*[-–]\s*e?\d{1,3}(?!\d)))*/gi,
    /(?:^|\D)(\d{1,2})x(\d{1,3})(?!\d)(?:(?:[ ._-]*\d{1,2}x\d{1,3}(?!\d))|(?:\s*[-–]\s*\d{1,2}x?\d{1,3}(?!\d)))*/gi,
  ];
  for (const expression of expressions) {
    for (const match of name.matchAll(expression)) {
      const foundSeason = Number(match[1]);
      if (foundSeason !== seasonNumber) continue;
      const firstEpisode = Number(match[2]);
      episodes.add(firstEpisode);
      const suffix = match[3] ?? match[0].slice(match[0].indexOf(match[2]) + match[2].length);
      for (const token of suffix.matchAll(/(?:e|x)?(\d{1,3})/gi)) {
        const value = Number(token[1]);
        if (value > firstEpisode && value <= firstEpisode + 20) {
          for (let episode = firstEpisode + 1; episode <= value; episode++) episodes.add(episode);
        }
      }
    }
  }
  return { episodes: [...episodes] };
}
