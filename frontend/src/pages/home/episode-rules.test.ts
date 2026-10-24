import type { ProgressEntry } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import {
  episodeForSeason,
  isEpisodeUpcoming,
  latestEpisodeProgress,
  nextEpisode,
  nextEpisodeInSeason,
  nextSeasonNumber,
} from './episode-rules';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const AIRED = '2026-01-01';
const FUTURE = '2026-12-01';

const episode = (episodeNumber: number, airDate: string | null = AIRED) => ({
  episodeNumber,
  title: `Title ${episodeNumber}`,
  airDate,
});
const season = (seasonNumber: number, ...episodes: ReturnType<typeof episode>[]) => ({
  seasonNumber,
  episodes,
});
const watched = (
  seasonNumber: number,
  episodeNumber: number,
  updatedAt: string,
  showMediaId = 42
): ProgressEntry => ({
  playable: { kind: 'episode', showMediaId, seasonNumber, episodeNumber },
  updatedAt,
  state: 'paused',
  positionSeconds: 90,
  durationSeconds: 1800,
});

describe('latestEpisodeProgress', () => {
  const progress: ProgressEntry[] = [
    watched(1, 3, '2026-10-20T10:00:00Z'),
    // Later in absolute time despite the earlier-looking wall clock.
    watched(2, 1, '2026-10-21T11:00:00+02:00'),
    watched(2, 4, '2026-10-21T08:00:00Z'),
    watched(1, 9, '2026-10-23T10:00:00Z', 77),
    {
      ...watched(1, 1, '2026-10-24T10:00:00Z'),
      playable: { kind: 'movie', mediaId: 42 },
    },
  ];

  it.each([
    [undefined, 2, 1],
    [1, 1, 3],
    [2, 2, 1],
  ])('season %s → S%iE%i', (seasonNumber, expectedSeason, expectedEpisode) => {
    expect(latestEpisodeProgress(progress, 42, seasonNumber)?.playable).toMatchObject({
      seasonNumber: expectedSeason,
      episodeNumber: expectedEpisode,
    });
  });

  it('returns nothing for a show or season without progress', () => {
    expect(latestEpisodeProgress(progress, 99)).toBeUndefined();
    expect(latestEpisodeProgress(progress, 42, 5)).toBeUndefined();
  });
});

describe('isEpisodeUpcoming', () => {
  it.each([
    [FUTURE, true],
    [AIRED, false],
    [null, false],
    ['not a date', false],
  ])('%s → %s', (airDate, expected) => {
    expect(isEpisodeUpcoming(airDate, NOW)).toBe(expected);
  });
});

describe('episodeForSeason', () => {
  const regular = season(1, episode(1), episode(2), episode(3), episode(4, FUTURE));

  it.each<[string, ProgressEntry[], number | undefined]>([
    ['no progress opens the first episode', [], 1],
    ['resumes the most recently watched episode', [watched(1, 3, '2026-10-20T10:00:00Z')], 3],
    [
      'ignores progress from another season',
      [watched(2, 3, '2026-10-22T10:00:00Z'), watched(1, 2, '2026-10-20T10:00:00Z')],
      2,
    ],
    ['skips a resume point that is no longer listed', [watched(1, 9, '2026-10-20T10:00:00Z')], 1],
    ['does not resume onto an unaired episode', [watched(1, 4, '2026-10-20T10:00:00Z')], 1],
  ])('%s', (_name, progress, expected) => {
    expect(episodeForSeason(regular, 42, progress, NOW)?.episodeNumber).toBe(expected);
  });

  it('opens on the first aired episode when earlier ones are unaired', () => {
    expect(
      episodeForSeason(season(1, episode(1, FUTURE), episode(2)), 42, [], NOW)?.episodeNumber
    ).toBe(2);
  });

  it('still selects an episode in a season that has not aired', () => {
    expect(
      episodeForSeason(season(3, episode(1, FUTURE), episode(2, FUTURE)), 42, [], NOW)
        ?.episodeNumber
    ).toBe(1);
    expect(episodeForSeason(season(3), 42, [], NOW)).toBeUndefined();
  });
});

describe('nextEpisodeInSeason', () => {
  const unordered = season(1, episode(5), episode(2), episode(4, FUTURE), episode(3));

  it.each([
    [1, 2],
    [2, 3],
    [3, 5],
    [5, undefined],
  ])('after E%i → E%s', (current, expected) => {
    expect(nextEpisodeInSeason(unordered, current, NOW)?.episodeNumber).toBe(expected);
  });

  it('returns nothing while the season is not loaded', () => {
    expect(nextEpisodeInSeason(undefined, 1, NOW)).toBeUndefined();
  });
});

describe('nextSeasonNumber', () => {
  it.each([
    [1, 2],
    [2, 4],
    [4, undefined],
  ])('after season %i → %s', (current, expected) => {
    const seasons = [4, 0, 2, 1].map(seasonNumber => ({ seasonNumber }));
    expect(nextSeasonNumber(seasons, current)).toBe(expected);
  });

  it('never moves into specials', () => {
    expect(nextSeasonNumber([{ seasonNumber: 0 }], -1)).toBeUndefined();
    expect(nextSeasonNumber(undefined, 1)).toBeUndefined();
  });
});

describe('nextEpisode', () => {
  const position = { showMediaId: 42, seasonNumber: 1, episodeNumber: 2 };
  const current = season(1, episode(1), episode(2), episode(3));
  const finale = { ...position, episodeNumber: 3 };
  const following = season(2, episode(2), episode(0), episode(1));

  it('plays the next episode in the season', () => {
    expect(nextEpisode(position, current, undefined, NOW)).toEqual({
      playable: { kind: 'episode', showMediaId: 42, seasonNumber: 1, episodeNumber: 3 },
      title: 'Title 3',
    });
  });

  it('moves to the first regular episode of the next season after a finale', () => {
    expect(nextEpisode(finale, current, following, NOW)).toEqual({
      playable: { kind: 'episode', showMediaId: 42, seasonNumber: 2, episodeNumber: 1 },
      title: 'Title 1',
    });
  });

  it.each([
    ['the current season is not loaded', undefined, following],
    ['the next season is not loaded', current, undefined],
    ['the next season has not aired', current, season(2, episode(1, FUTURE))],
  ])('returns null when %s', (_name, currentSeason, nextSeason) => {
    expect(nextEpisode(finale, currentSeason, nextSeason, NOW)).toBeNull();
  });

  it('does not offer an unaired episode in the same season', () => {
    expect(
      nextEpisode(position, season(1, episode(2), episode(3, FUTURE)), undefined, NOW)
    ).toBeNull();
  });
});
