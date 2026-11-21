import { describe, expect, it } from 'vitest';

import { languageOptions, preferredAudioLanguage } from './language-options';

const tracks = [
  { index: 0, language: 'jpn' },
  { index: 1, language: 'ita' },
  { index: 2, language: 'eng' },
];

describe('languageOptions', () => {
  it('offers the preferred audio, the original with subtitles and the preferred with subtitles', () => {
    expect(
      languageOptions({
        tracks,
        preferences: { audio: 'it', subtitles: 'it' },
        originalLanguage: 'ja',
        deviceLanguage: 'en-US',
      })
    ).toEqual([
      { kind: 'audio', audioLanguage: 'it', audioTrackIndex: 1, subtitleLanguage: null },
      { kind: 'original', audioLanguage: 'ja', audioTrackIndex: 0, subtitleLanguage: 'it' },
      { kind: 'subtitled', audioLanguage: 'it', audioTrackIndex: 1, subtitleLanguage: 'it' },
    ]);
  });

  it('lets the original button stand for "with subtitles" when the original is preferred', () => {
    const kinds = languageOptions({
      tracks,
      preferences: { audio: 'original', subtitles: 'en' },
      originalLanguage: 'ja',
      deviceLanguage: 'it-IT',
    }).map(option => [option.kind, option.audioLanguage, option.subtitleLanguage]);
    expect(kinds).toEqual([
      ['audio', 'ja', null],
      ['original', 'ja', 'en'],
    ]);
  });

  it('follows the device for unset choices and leaves out languages the file lacks', () => {
    const options = languageOptions({
      tracks: [{ index: 0, language: 'eng' }],
      preferences: { audio: null, subtitles: null },
      originalLanguage: 'fr',
      deviceLanguage: 'en-GB',
    });
    expect(options.map(option => option.kind)).toEqual(['audio', 'subtitled']);
    expect(options[1]?.subtitleLanguage).toBe('en');
  });

  it('offers nothing for untagged tracks', () => {
    expect(
      languageOptions({
        tracks: [{ index: 0, language: null }],
        preferences: { audio: 'en', subtitles: 'en' },
        originalLanguage: 'en',
        deviceLanguage: 'en',
      })
    ).toEqual([]);
  });
});

describe('preferredAudioLanguage', () => {
  it('resolves original to the title language, and leaves unset to the device', () => {
    expect(preferredAudioLanguage({ audio: 'original', subtitles: null }, 'ja')).toBe('ja');
    expect(preferredAudioLanguage({ audio: 'original', subtitles: null }, null)).toBeUndefined();
    expect(preferredAudioLanguage({ audio: 'it', subtitles: null }, 'ja')).toBe('it');
    expect(preferredAudioLanguage({ audio: null, subtitles: null }, 'ja')).toBeUndefined();
  });
});
