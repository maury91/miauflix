jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { createMockContentSource } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';

import { resetSourceServiceSearches } from '@database/migrations/reset-source-service-searches.migration';
import { ContentSource } from '@entities/content-source.entity';
import { MovieSource } from '@entities/movie-source.entity';

describe('movie source search scheduling', () => {
  const dbHelper = createTestDatabase();

  beforeAll(() => configureFakerSeed());
  afterEach(async () => dbHelper.cleanup());

  const setupTest = async () => {
    const db = await dbHelper.setupTestDatabase();
    const repository = db.getMovieRepository();
    const movie = await repository.createFromSummary({
      mediaId: 123,
      imdbId: 'tt0123456',
      title: 'Example Movie',
    });
    return { db, repository, movie };
  };

  it('searches movies again when the planner retry arrives, including previously searched providers', async () => {
    const { repository, movie } = await setupTest();
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    await repository.recordSourceSearch(movie.id, ['indexer-a', 'indexer-b'], past, true);
    expect((await repository.findMoviesPendingSourceSearch()).map(row => row.id)).toEqual([
      movie.id,
    ]);

    await repository.recordSourceSearch(movie.id, ['indexer-a', 'indexer-b'], future, true);
    expect(await repository.findMoviesPendingSourceSearch()).toEqual([]);

    await repository.recordSourceSearch(movie.id, [], null, false);
    expect((await repository.findMoviesPendingSourceSearch()).map(row => row.id)).toEqual([
      movie.id,
    ]);
  });

  it('records completeness separately from provider names and clears it after a failed attempt', async () => {
    const { repository, movie } = await setupTest();
    await repository.recordSourceSearch(movie.id, ['indexer-a'], null, false);
    expect(await repository.findById(movie.id)).toMatchObject({
      contentDirectoriesSearched: ['indexer-a'],
      sourceSearchComplete: false,
      nextSourceSearchAt: null,
    });

    await repository.recordSourceSearch(movie.id, ['indexer-a'], null, true);
    await repository.markSourceSearchAttempt(movie.id);
    const stored = await repository.findById(movie.id);
    expect(stored?.sourceSearchComplete).toBe(false);
    expect(stored?.nextSourceSearchAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('migrates search state repeatably while preserving movies, source files and associations', async () => {
    const { db, repository, movie } = await setupTest();
    const sources = db.getRepository(ContentSource);
    const sourceData: Partial<ContentSource> = {
      ...createMockContentSource(),
      id: undefined,
      storage: undefined,
      file: Buffer.from('stored metadata'),
    };
    const source = await sources.save(sourceData);
    await db.getRepository(MovieSource).save({ movieId: movie.id, sourceId: source.id });
    await repository.recordSourceSearch(
      movie.id,
      ['indexer-a'],
      new Date(Date.now() + 86_400_000).toISOString(),
      true
    );

    const context = { db, logger: jest.requireMock('@logger').logger };
    await resetSourceServiceSearches(context);
    await resetSourceServiceSearches(context);

    expect(await repository.findById(movie.id)).toMatchObject({
      title: 'Example Movie',
      contentDirectoriesSearched: [],
      nextSourceSearchAt: null,
      sourceSearchComplete: false,
    });
    expect(await sources.findOneByOrFail({ id: source.id })).toMatchObject({
      hash: source.hash,
      file: Buffer.from('stored metadata'),
    });
    expect(await db.getRepository(MovieSource).find()).toMatchObject([
      { movieId: movie.id, sourceId: source.id },
    ]);
    expect((await repository.findMoviesPendingSourceSearch()).map(row => row.id)).toEqual([
      movie.id,
    ]);
  });
});
