import type { ProgressEntry, ShowResponse } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import { firstSeason } from './first-season';

const show = {
  mediaId: 42,
  seasons: [3, 0, 1, 2].map(seasonNumber => ({ seasonNumber })),
} as ShowResponse;
const episodeProgress = (
  seasonNumber: number,
  updatedAt = '2026-10-23T10:00:00Z'
): ProgressEntry => ({
  playable: { kind: 'episode', showMediaId: 42, seasonNumber, episodeNumber: 1 },
  updatedAt,
  state: 'paused',
  positionSeconds: 90,
  durationSeconds: 1800,
});

describe('details opening season', () => {
  it('skips specials and opens the first regular season without progress', () => {
    expect(firstSeason(show, [])).toBe(1);
    expect(firstSeason({ ...show, seasons: [] }, [])).toBeUndefined();
  });
  it('uses the most recently watched season, comparing actual times', () => {
    expect(
      firstSeason(show, [episodeProgress(2, '2026-10-23T11:00:00+02:00'), episodeProgress(3)])
    ).toBe(3);
  });
  it('ignores progress for another show and unavailable seasons', () => {
    const other = episodeProgress(2);
    other.playable = { kind: 'episode', showMediaId: 77, seasonNumber: 2, episodeNumber: 1 };
    expect(firstSeason(show, [other])).toBe(1);
    expect(firstSeason(show, [episodeProgress(99)])).toBe(1);
  });
});
