import { describe, expect, it } from 'vitest';

import { episodeElementId, episodeProgressLabel } from './episodes.utils';

describe('episodeProgressLabel', () => {
  it.each([
    [undefined, null],
    [{ state: 'completed', positionSeconds: 10, durationSeconds: 100 }, 'Watched'],
    [{ state: 'paused', positionSeconds: 25, durationSeconds: 100 }, 'Resume 25%'],
    [{ state: 'playing', positionSeconds: 2, durationSeconds: 3 }, 'Resume 67%'],
    [{ state: 'paused', positionSeconds: 200, durationSeconds: 100 }, 'Resume 100%'],
    [{ state: 'paused', positionSeconds: 50, durationSeconds: 0 }, 'Resume 0%'],
  ] as const)('%j → %s', (entry, expected) => {
    expect(episodeProgressLabel(entry)).toBe(expected);
  });
});

describe('episodeElementId', () => {
  it('identifies an episode of a show', () => {
    expect(episodeElementId(7, 2, 3)).toBe('episode-7-2:3');
  });
});
