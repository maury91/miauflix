import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type AniZip, displayTitle, toEntry } from './anizip.js';
import { layoutSeasons, type ProviderEpisode, seasonName } from './episodes.js';
import type { AnimeEntry } from './fribb.js';

const DAY = 86400_000;
const START = Date.parse('2021-04-11T00:00:00Z');
const date = (day: number) => new Date(START + day * DAY).toISOString().slice(0, 10);

/** An entry whose episodes air weekly from `firstDay`. */
const entry = (
  anilistId: number,
  count: number,
  firstDay: number,
  overrides: Partial<AnimeEntry> = {},
  title?: string
) => {
  const episodes: NonNullable<AniZip['episodes']> = {};
  for (let n = 1; n <= count; n++) episodes[String(n)] = { airDate: date(firstDay + (n - 1) * 7) };
  return toEntry(
    { anilistId, anidbId: null, type: 'TV', tmdbSeason: 1, tvdbSeason: 1, ...overrides },
    { titles: title ? { en: title } : {}, episodes }
  );
};

/** TMDB episodes of one season, airing weekly from day 0 (a gap of `gap` days after `gapAfter`). */
const tmdbSeason = (
  seasonNumber: number,
  count: number,
  firstDay = 0,
  gapAfter?: number[],
  gap = 0
): ProviderEpisode[] => {
  let day = firstDay;
  return Array.from({ length: count }, (_, i) => {
    if (i && gapAfter?.includes(i)) day += gap;
    const episode = {
      mediaId: seasonNumber * 1000 + i + 1,
      seasonNumber,
      episodeNumber: i + 1,
      airDate: date(day),
    };
    day += 7;
    return episode;
  });
};

describe('layoutSeasons', () => {
  it('splits one long TMDB season into its AniList entries (Tokyo Revengers)', () => {
    // 24 + 13 + 13 episodes with breaks between the cours.
    const episodes = tmdbSeason(1, 50, 0, [24, 37], 300);
    const firstOf = (index: number) => Number(Date.parse(episodes[index]!.airDate!) - START) / DAY;
    const entries = [
      entry(163329, 13, firstOf(37), { tvdbSeason: 3 }),
      entry(120120, 24, 0),
      entry(142853, 13, firstOf(24), { tvdbSeason: 2 }),
    ];
    const seasons = layoutSeasons(episodes, entries)!;
    assert.deepEqual(
      seasons.map(s => [s.seasonNumber, s.anilistId, s.episodes.length]),
      [
        [1, 120120, 24],
        [2, 142853, 13],
        [3, 163329, 13],
      ]
    );
    assert.deepEqual(seasons[1]!.episodes[0], {
      mediaId: 1025,
      episodeNumber: 1,
      providerSeasonNumber: 1,
      providerEpisodeNumber: 25,
      airDate: episodes[24]!.airDate,
    });
  });

  it('continues an airing entry with the episodes TMDB already lists', () => {
    // The last entry airs weekly; ani.zip lists 8 of its episodes, TMDB all 13.
    const episodes = tmdbSeason(1, 25);
    const seasons = layoutSeasons(episodes, [entry(1, 12, 0), entry(2, 8, 12 * 7)])!;
    assert.deepEqual(
      seasons.map(s => [s.anilistId, s.episodes.map(e => e.episodeNumber)]),
      [
        [1, Array.from({ length: 12 }, (_, i) => i + 1)],
        [2, Array.from({ length: 13 }, (_, i) => i + 1)],
      ]
    );
    assert.equal(seasons[1]!.episodes[12]!.providerEpisodeNumber, 25);
  });

  it('puts episodes TMDB lists before AniList has them in a trailing season', () => {
    // A new cour, months after the last entry ended.
    const episodes = tmdbSeason(1, 30, 0, [24], 200);
    const seasons = layoutSeasons(episodes, [entry(1, 12, 0), entry(2, 12, 12 * 7)])!;
    assert.deepEqual(
      seasons.map(s => [s.anilistId, s.episodes.length]),
      [
        [1, 12],
        [2, 12],
        [null, 6],
      ]
    );
    assert.equal(seasons[2]!.episodes[0]!.episodeNumber, 1);
    assert.equal(seasons[2]!.episodes[0]!.providerEpisodeNumber, 25);
  });

  it('keeps TMDB seasons when they are as fine as the entries, or for shows numbered by arc', () => {
    const twoSeasons = [...tmdbSeason(1, 12), ...tmdbSeason(2, 12, 400)];
    assert.equal(layoutSeasons(twoSeasons, [entry(1, 12, 0), entry(2, 12, 400)]), null);
    // One Piece: a single entry without a TMDB season against many TMDB arcs.
    assert.equal(
      layoutSeasons(tmdbSeason(1, 30), [
        entry(21, 1100, 0, { tmdbSeason: null }),
        entry(22, 12, 0),
        entry(23, 12, 0),
      ]),
      null
    );
  });

  it('leaves OVAs and specials to season 0', () => {
    const seasons = layoutSeasons(tmdbSeason(1, 24), [
      entry(1, 12, 0),
      entry(2, 12, 84),
      entry(3, 2, 30, { type: 'OVA' }),
    ])!;
    assert.deepEqual(
      seasons.map(s => s.anilistId),
      [1, 2]
    );
  });

  it('matches by position when dates are missing', () => {
    const episodes = tmdbSeason(1, 6).map(e => ({ ...e, airDate: null }));
    const seasons = layoutSeasons(episodes, [entry(1, 3, 0), entry(2, 3, 21)])!;
    assert.deepEqual(
      seasons.map(s => s.episodes.map(e => e.providerEpisodeNumber)),
      [
        [1, 2, 3],
        [4, 5, 6],
      ]
    );
  });
});

describe('seasonName', () => {
  it('names a season after what its entry adds to the show title', () => {
    assert.equal(
      seasonName('Tokyo Revengers', 'Tokyo Revengers: Christmas Showdown', 2),
      'Christmas Showdown'
    );
    assert.equal(
      seasonName('Attack on Titan', 'Attack on Titan Season 3 Part 2', 4),
      'Season 3 Part 2'
    );
    assert.equal(seasonName('JUJUTSU KAISEN', 'JUJUTSU KAISEN', 1), 'Season 1');
    assert.equal(seasonName('Tokyo Revengers', undefined, 3), 'Season 3');
    assert.equal(
      seasonName('Bleach', 'Bleach: Thousand-Year Blood War', 2),
      'Thousand-Year Blood War'
    );
    assert.equal(seasonName('Some Show', 'Another Name', 2), 'Another Name');
  });
});

describe('displayTitle', () => {
  it('prefers a title that names the show over an alias', () => {
    // Tokyo Revengers' third season on ani.zip.
    const titles = {
      'x-jat': 'Tokyo Revengers: Tenjiku Hen',
      en: 'tr s3',
      ja: '東京リベンジャーズ 天竺編',
    };
    assert.equal(displayTitle({ titles }, 'Tokyo Revengers'), 'Tokyo Revengers: Tenjiku Hen');
    assert.equal(
      displayTitle(
        { titles: { 'x-jat': 'tr s2', en: 'Tokyo Revengers: Christmas Showdown' } },
        'Tokyo Revengers'
      ),
      'Tokyo Revengers: Christmas Showdown'
    );
  });

  it('falls back to English, then romaji, skipping lowercase aliases', () => {
    assert.equal(
      displayTitle({ titles: { en: 'Other Name', 'x-jat': 'Romaji' } }, 'Show'),
      'Other Name'
    );
    assert.equal(displayTitle({ titles: { en: 'tr s3', 'x-jat': 'Romaji' } }, 'Show'), 'Romaji');
    assert.equal(displayTitle(null, 'Show'), undefined);
  });
});
