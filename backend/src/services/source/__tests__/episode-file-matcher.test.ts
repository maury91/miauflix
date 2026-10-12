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
});
