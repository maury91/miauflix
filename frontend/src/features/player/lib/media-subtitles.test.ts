import { beforeEach, describe, expect, it } from 'vitest';

import { mediaSubtitleKey, readMediaSubtitles, saveMediaSubtitles } from './media-subtitles';

beforeEach(() => window.localStorage.clear());
describe('per-media subtitle preferences', () => {
  it('keeps users, films and individual episodes separate', () => {
    const key = mediaSubtitleKey('user', { kind: 'movie', mediaId: 123 });
    const preference = {
      language: 'en',
      hearingImpaired: false,
      selectedFileId: 42,
      offset: 10.25,
    };
    saveMediaSubtitles(key, preference);
    expect(readMediaSubtitles(key)).toEqual(preference);
    expect(
      readMediaSubtitles(mediaSubtitleKey('other', { kind: 'movie', mediaId: 123 }))
    ).toBeNull();
    expect(
      readMediaSubtitles(mediaSubtitleKey('user', { kind: 'movie', mediaId: 124 }))
    ).toBeNull();
    expect(
      readMediaSubtitles(
        mediaSubtitleKey('user', {
          kind: 'episode',
          showMediaId: 123,
          seasonNumber: 1,
          episodeNumber: 2,
        })
      )
    ).toBeNull();
  });
  it('remembers Off and ignores malformed stored settings', () => {
    const key = mediaSubtitleKey(undefined, { kind: 'movie', mediaId: 123 });
    saveMediaSubtitles(key, {
      language: 'fr',
      hearingImpaired: true,
      selectedFileId: null,
      offset: 0,
    });
    expect(readMediaSubtitles(key)?.selectedFileId).toBeNull();
    window.localStorage.setItem(key, '{"language":"../../etc","offset":5}');
    expect(readMediaSubtitles(key)).toBeNull();
  });
});
