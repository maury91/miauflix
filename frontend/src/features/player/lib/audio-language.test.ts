import { describe, expect, it } from 'vitest';

import { preferredAudioTrack } from './audio-language';

const delivery = {
  mode: 'audio-transcode' as const,
  audioCodec: 'ac3',
  mimeType: 'video/mp4',
  durationSeconds: 100,
  defaultAudioTrackIndex: 0,
  audioTracks: [
    { index: 0, language: 'fra', title: null, codec: 'ac3', channels: 6, isDefault: true },
    { index: 1, language: 'eng', title: null, codec: 'ac3', channels: 6, isDefault: false },
  ],
};
describe('browser audio language', () => {
  it('matches ISO audio tags to regional browser languages', () => {
    expect(preferredAudioTrack(delivery, ['en-GB'])).toBe(1);
    expect(preferredAudioTrack(delivery, ['fr-CA'])).toBe(0);
  });
  it('follows browser preference order and falls back to the source default', () => {
    expect(preferredAudioTrack(delivery, ['lt', 'en-US', 'fr'])).toBe(1);
    expect(preferredAudioTrack(delivery, ['ja'])).toBe(0);
    expect(preferredAudioTrack(undefined, ['en'])).toBeUndefined();
  });
});
