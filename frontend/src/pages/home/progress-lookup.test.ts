import type { MediaDto, ProgressEntry } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import { progressByMedia, progressKey } from './progress-lookup';

const entry = (overrides: Partial<ProgressEntry>): ProgressEntry =>
  ({
    playable: { kind: 'movie', mediaId: 1 },
    state: 'watching',
    positionSeconds: 10,
    durationSeconds: 100,
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }) as ProgressEntry;

describe('progressByMedia', () => {
  it('keys movies by id and episodes by their show', () => {
    const movie = entry({});
    const episode = entry({
      playable: { kind: 'episode', showMediaId: 7, seasonNumber: 1, episodeNumber: 2 },
    });
    const lookup = progressByMedia([movie, episode]);

    expect(lookup.get(progressKey({ _type: 'movie', mediaId: 1 } as MediaDto))).toBe(movie);
    expect(lookup.get(progressKey({ _type: 'tvshow', mediaId: 7 } as MediaDto))).toBe(episode);
    expect(progressByMedia(undefined).size).toBe(0);
  });

  it('prefers unfinished playback, then actual playback, then the latest', () => {
    const show = (episodeNumber: number, overrides: Partial<ProgressEntry>) =>
      entry({
        playable: { kind: 'episode', showMediaId: 7, seasonNumber: 1, episodeNumber },
        ...overrides,
      });
    const completed = show(1, { state: 'completed', updatedAt: '2026-10-05T00:00:00Z' });
    const suggestion = show(2, { nextEpisode: true, updatedAt: '2026-10-04T00:00:00Z' });
    const older = show(3, { updatedAt: '2026-10-02T00:00:00Z' });
    const latest = show(4, { updatedAt: '2026-10-03T00:00:00Z' });

    expect(progressByMedia([completed, suggestion, older, latest]).get('show:7')).toBe(latest);
    expect(progressByMedia([completed, suggestion]).get('show:7')).toBe(suggestion);
  });
});
