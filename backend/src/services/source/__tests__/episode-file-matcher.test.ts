import type { SourceMetadata } from '@content-directories/content-directory.abstract';

import { matchEpisodeFile } from '../episode-file-matcher';

function release(files: string[]): SourceMetadata {
  return {
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
