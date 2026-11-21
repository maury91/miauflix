import { describe, expect, it } from 'vitest';

import {
  episodeNavId,
  episodeProgress,
  episodeProgressLabel,
  parseEpisodeNavId,
} from './episodes.utils';

describe('episodeProgressLabel', () => {
  it.each([
    [undefined, null],
    [{ state: 'completed', positionSeconds: 10, durationSeconds: 100 }, 'Watched'],
    [{ state: 'paused', positionSeconds: 25, durationSeconds: 100 }, 'Resume from 25%'],
    [{ state: 'playing', positionSeconds: 2, durationSeconds: 3 }, 'Resume from 67%'],
    [{ state: 'paused', positionSeconds: 200, durationSeconds: 100 }, 'Resume from 100%'],
    [{ state: 'paused', positionSeconds: 50, durationSeconds: 0 }, 'Resume from 0%'],
  ] as const)('%j → %s', (entry, expected) => {
    expect(episodeProgressLabel(entry)).toBe(expected);
  });
});

describe('episodeProgress', () => {
  it.each([
    [undefined, undefined],
    [{ state: 'completed', positionSeconds: 10, durationSeconds: 100 }, 1],
    [{ state: 'paused', positionSeconds: 25, durationSeconds: 100 }, 0.25],
    [{ state: 'paused', positionSeconds: 200, durationSeconds: 100 }, 1],
    [{ state: 'paused', positionSeconds: 50, durationSeconds: 0 }, 0],
  ] as const)('%j → %s', (entry, expected) => {
    expect(episodeProgress(entry)).toBe(expected);
  });
});

describe('episodeNavId', () => {
  it('round-trips an episode through its navigation ID', () => {
    expect(episodeNavId(2, 3)).toBe('episode:2:3');
    expect(parseEpisodeNavId(episodeNavId(2, 3))).toEqual({ seasonNumber: 2, episodeNumber: 3 });
  });

  it('ignores other IDs', () => {
    expect(parseEpisodeNavId('season:2')).toBeNull();
    expect(parseEpisodeNavId(null)).toBeNull();
  });
});
