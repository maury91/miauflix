jest.unmock('@database/database');

import { setupDatabaseTest } from '@__test-utils__/database.helpers';
import { configureFakerSeed } from '@__test-utils__/utils';

import { Episode } from '@entities/episode.entity';
import { Season } from '@entities/season.entity';
import { TVShow } from '@entities/tvshow.entity';
import type { MovieDetail, TVShowDetail } from '@services/catalog/catalog.types';

const { getDatabase } = setupDatabaseTest();

function movieDetail(mediaId: number, title: string): MovieDetail {
  return {
    mediaType: 'movie',
    mediaId,
    imdbId: null,
    title,
    overview: 'A movie overview',
    tagline: 'A tagline',
    releaseDate: '2025-01-01',
    runtime: 100,
    poster: '/poster.jpg',
    backdrop: '/backdrop.jpg',
    logo: '',
    backdropFocus: null,
    genres: [],
    popularity: 20,
    rating: 7,
    detailsSyncedAt: null,
  };
}

function tvDetail(name: string, seasonName: string, airDate: string | null): TVShowDetail {
  return {
    mediaType: 'tv',
    mediaId: 9_100_002,
    imdbId: null,
    name,
    overview: 'A show overview',
    tagline: 'A tagline',
    firstAirDate: '2020-01-01',
    status: 'Returning Series',
    type: 'Scripted',
    inProduction: true,
    episodeRunTime: [45],
    poster: '/show-poster.jpg',
    backdrop: '/show-backdrop.jpg',
    logo: '',
    backdropFocus: null,
    genres: [],
    popularity: 30,
    rating: 8,
    seasons: [
      {
        mediaId: 9_200_001,
        seasonNumber: 1,
        name: seasonName,
        overview: 'A season overview',
        airDate,
        poster: null,
        episodeCount: 1,
        synced: false,
      },
    ],
    detailsSyncedAt: null,
  };
}

describe('list projection repositories', () => {
  beforeAll(() => {
    configureFakerSeed();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('bulk upserts movies while preserving local IDs and discovery state', async () => {
    const database = getDatabase();
    const repository = database.getMovieRepository();
    const first = await repository.upsertMovieDetail(movieDetail(9_100_001, 'Before'));
    await repository.markSourceSearched(first.id, 'movies');

    const references = await repository.upsertMovieDetails([
      movieDetail(9_100_001, 'After'),
      movieDetail(9_100_003, 'New'),
    ]);
    const stored = await repository.findByMediaId(9_100_001);

    expect(references).toHaveLength(2);
    expect(references.find(reference => reference.mediaId === 9_100_001)?.id).toBe(first.id);
    expect(stored?.title).toBe('After');
    expect(stored?.contentDirectoriesSearched).toEqual(['movies']);
  });

  it('bulk upserts shows and summaries without resetting watching, synced, or episodes', async () => {
    const database = getDatabase();
    const repository = database.getTVShowRepository();
    const first = await repository.upsertTVShowDetails([
      tvDetail('Before', 'Season One', '2021-01-01'),
    ]);
    const showId = first[0].id;
    await database.getRepository(TVShow).update({ id: showId }, { watching: true });
    const season = await database.getRepository(Season).findOneByOrFail({
      tvShowId: showId,
      seasonNumber: 1,
    });
    await repository.markSeasonAsSynced(season);
    await database.getEpisodeRepository().save(
      database.getRepository(Episode).create({
        mediaId: 9_300_001,
        seasonId: season.id,
        episodeNumber: 1,
        name: 'Episode One',
        overview: 'An episode overview',
        airDate: '2021-01-01',
        stillPath: '/still.jpg',
        imdbId: '',
      })
    );

    const references = await repository.upsertTVShowDetails([
      tvDetail('After', 'Season One Updated', null),
    ]);
    const storedShow = await repository.findByMediaId(9_100_002);
    const storedSeason = await repository.findSeasonByIdWithEpisodes(season.id);

    expect(references[0].id).toBe(showId);
    expect(storedShow?.name).toBe('After');
    expect(storedShow?.watching).toBe(true);
    expect(storedSeason?.name).toBe('Season One Updated');
    expect(storedSeason?.airDate).toBe('2021-01-01');
    expect(storedSeason?.synced).toBe(true);
    expect(storedSeason?.episodes).toHaveLength(1);
  });

  it('double checks concurrently created list rows before inserting', async () => {
    const repository = getDatabase().getMediaListRepository();
    const lists = await Promise.all(
      Array.from({ length: 5 }, () =>
        repository.findOrCreateMediaList('Popular', '', 'popular-test', 'public')
      )
    );

    expect(new Set(lists.map(list => list.id)).size).toBe(1);
    expect(await repository.findBySlug('popular-test')).toMatchObject({ id: lists[0].id });
  });
});
