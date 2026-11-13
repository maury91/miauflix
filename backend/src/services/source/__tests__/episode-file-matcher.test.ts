import type { SourceMetadata } from '@services/sources-client/source-candidate';

import { matchEpisodeFile } from '../episode-file-matcher';

function release(files: string[]): SourceMetadata {
  return {
    provider: 'indexer-a',
    providerKind: 'cardigann',
    matchedBy: 'imdb',
    accuracy: 'medium',
    releaseName: 'Show',
    audioCodec: [],
    bitrate: 0,
    broadcasters: 0,
    hash: 'a'.repeat(40),
    language: [],
    magnetLink: 'magnet:?xt=urn:btih:example',
    quality: null,
    score: 0,
    size: 0,
    source: null,
    uploadDate: new Date(0),
    url: '',
    videoCodec: null,
    watchers: 0,
    files,
  };
}

describe('matchEpisodeFile', () => {
  it('prefers the exact single-episode file when a combined file is also present', () => {
    expect(
      matchEpisodeFile(release(['Show.S01E01-E02.mkv', 'Show.S01E02.mkv']), 1, 2, true)
    ).toEqual({ videoFilePath: 'Show.S01E02.mkv', matchKind: 'single' });
  });

  it('uses a combined video only when the caller permits the last-resort match', () => {
    const pack = release(['Show.S01E01-E02.mkv']);
    expect(matchEpisodeFile(pack, 1, 2)).toBeNull();
    expect(matchEpisodeFile(pack, 1, 2, true)).toEqual({
      videoFilePath: 'Show.S01E01-E02.mkv',
      matchKind: 'combined',
    });
  });

  it('does not match a video from another season', () => {
    expect(matchEpisodeFile(release(['Show.S02E02.mkv']), 1, 2, true)).toBeNull();
  });

  it('does not treat resolution digits as another episode', () => {
    expect(matchEpisodeFile(release(['Show.S01E05 - 1080p.mkv']), 1, 5)).toEqual({
      videoFilePath: 'Show.S01E05 - 1080p.mkv',
      matchKind: 'single',
    });
    expect(matchEpisodeFile(release(['Show.S01E05 - 1080p.mkv']), 1, 108)).toBeNull();
  });

  it('accepts a bounded x-style multi-episode range', () => {
    expect(matchEpisodeFile(release(['Show.1x05-1x06.mkv']), 1, 6, true)).toEqual({
      videoFilePath: 'Show.1x05-1x06.mkv',
      matchKind: 'combined',
    });
  });

  it('does not extend an x-style range into another season', () => {
    const pack = release(['Show.1x05-2x06.mkv']);
    expect(matchEpisodeFile(pack, 1, 6, true)).toBeNull();
    expect(matchEpisodeFile(pack, 1, 5)).toEqual({
      videoFilePath: 'Show.1x05-2x06.mkv',
      matchKind: 'single',
    });
  });

  it('expands bare same-season x-style ranges', () => {
    expect(matchEpisodeFile(release(['Show.1x05-07.mkv']), 1, 6, true)).toEqual({
      videoFilePath: 'Show.1x05-07.mkv',
      matchKind: 'combined',
    });
  });

  it('uses release metadata for a lone video only when its filename names no episode', () => {
    const metadata = (file: string) => ({ ...release([file]), season: 1, episode: 5 });
    expect(matchEpisodeFile(metadata('Show.720p.WEB.mkv'), 1, 5)).toEqual({
      videoFilePath: 'Show.720p.WEB.mkv',
      matchKind: 'single',
    });
    expect(matchEpisodeFile(metadata('Show.S01E06.mkv'), 1, 5)).toBeNull();
    expect(matchEpisodeFile(metadata('Show.S02E05.mkv'), 1, 5)).toBeNull();
  });
});

describe('matchEpisodeFile with anime numbering', () => {
  const anime = (
    releaseName: string,
    files: string[],
    episodeAliases: SourceMetadata['episodeAliases']
  ): SourceMetadata => ({ ...release(files), releaseName, episodeAliases });

  it('finds a cour-numbered file in a season pack named in the release', () => {
    const pack = anime(
      '[Group] Jujutsu Kaisen S2 [BD 1080p][Batch]',
      [
        'Jujutsu Kaisen S2/[Group] Jujutsu Kaisen - 06 [1080p].mkv',
        'Jujutsu Kaisen S2/[Group] Jujutsu Kaisen - 07 [1080p].mkv',
        'Jujutsu Kaisen S2/Extras/[Group] Jujutsu Kaisen - NCOP1 [1080p].mkv',
      ],
      [{ season: 2, episode: 7 }, { episode: 31 }]
    );
    // TMDB files the second season's episodes under season 1, as episodes 25 onwards.
    expect(matchEpisodeFile(pack, 1, 31)).toEqual({
      videoFilePath: 'Jujutsu Kaisen S2/[Group] Jujutsu Kaisen - 07 [1080p].mkv',
      matchKind: 'single',
    });
  });

  it('finds a file counted from the first episode', () => {
    const pack = anime(
      '[SubsPlease] Jujutsu Kaisen (25-47) (1080p) [Batch]',
      [
        '[SubsPlease] Jujutsu Kaisen - 30 (1080p).mkv',
        '[SubsPlease] Jujutsu Kaisen - 31 (1080p).mkv',
      ],
      [{ season: 2, episode: 7 }, { episode: 31 }]
    );
    expect(matchEpisodeFile(pack, 1, 31)?.videoFilePath).toBe(
      '[SubsPlease] Jujutsu Kaisen - 31 (1080p).mkv'
    );
  });

  it('keeps seasons apart in a pack of several seasons', () => {
    const pack = anime(
      '[Group] Jujutsu Kaisen (Season 1, 2) [BD]',
      ['Season 1/Jujutsu Kaisen - 07.mkv', 'Season 2/Jujutsu Kaisen - 07.mkv'],
      [{ season: 2, episode: 7 }, { episode: 31 }]
    );
    expect(matchEpisodeFile(pack, 1, 31)?.videoFilePath).toBe('Season 2/Jujutsu Kaisen - 07.mkv');
  });

  it('reads TVDB SxxEyy names when TMDB numbers the episode differently', () => {
    const pack = anime(
      'Jujutsu Kaisen S02 1080p WEB-DL',
      ['Jujutsu.Kaisen.S02E06.1080p.mkv', 'Jujutsu.Kaisen.S02E07.1080p.mkv'],
      [{ season: 2, episode: 7 }, { episode: 31 }]
    );
    expect(matchEpisodeFile(pack, 1, 31)?.videoFilePath).toBe('Jujutsu.Kaisen.S02E07.1080p.mkv');
  });
});
