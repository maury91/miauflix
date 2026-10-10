import type { ProgressEntry } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import { unfinishedProgress } from './continue-watching';

const next: ProgressEntry = {
  playable: { kind: 'episode', showMediaId: 42, seasonNumber: 1, episodeNumber: 3 },
  state: 'paused',
  nextEpisode: true,
  positionSeconds: 0,
  durationSeconds: 2400,
  updatedAt: '2026-10-04T11:00:00Z',
};

describe('Continue watching from Trakt', () => {
  it('includes the next unwatched episode even with zero playback progress', () => {
    expect(unfinishedProgress([next])).toEqual([next]);
    expect(unfinishedProgress([{ ...next, nextEpisode: undefined }])).toEqual([]);
  });
  it('prefers an actual paused episode over a next-episode suggestion for the same show', () => {
    const paused: ProgressEntry = {
      ...next,
      nextEpisode: undefined,
      positionSeconds: 100,
      updatedAt: '2026-10-04T10:00:00Z',
    };
    expect(unfinishedProgress([next, paused])).toEqual([paused]);
    expect(unfinishedProgress([paused, next])).toEqual([paused]);
  });
  it('excludes finished episodes and barely started movies', () => {
    expect(
      unfinishedProgress([
        { ...next, state: 'completed' },
        {
          ...next,
          nextEpisode: undefined,
          playable: { kind: 'movie', mediaId: 123 },
          positionSeconds: 3,
        },
      ])
    ).toEqual([]);
  });

  it('sorts entries by chronology across timestamp formats', () => {
    const later = {
      ...next,
      playable: { kind: 'movie' as const, mediaId: 100 },
      updatedAt: '2026-10-04T09:00:00Z',
      positionSeconds: 100,
    };
    const earlierLexically = {
      ...next,
      playable: { kind: 'movie' as const, mediaId: 101 },
      updatedAt: '2026-10-04T10:00:00+02:00',
      positionSeconds: 100,
    };

    expect(unfinishedProgress([earlierLexically, later])).toEqual([later, earlierLexically]);
  });
});
