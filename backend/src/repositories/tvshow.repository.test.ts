jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { createMockSeasonDetail, createMockTVShowDetail } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';

describe('TVShowRepository season snapshots', () => {
  type TestDbHelper = ReturnType<typeof createTestDatabase>;
  let cleanupHelper: TestDbHelper | undefined;

  const setupTest = async () => {
    const dbHelper = createTestDatabase();
    cleanupHelper = dbHelper;
    const database = await dbHelper.setupTestDatabase();
    return { database, repository: database.getTVShowRepository() };
  };

  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['Date'] });
  });

  afterEach(async () => {
    await cleanupHelper?.cleanup();
    cleanupHelper = undefined;
    jest.useRealTimers();
  });

  it('removes episodes absent from the latest catalog snapshot', async () => {
    const { repository } = await setupTest();
    await repository.upsertTVShowDetail(createMockTVShowDetail({ mediaId: 500, seasons: [] }));

    const firstSnapshot = createMockSeasonDetail({
      tvMediaId: 500,
      seasonNumber: 1,
      episodes: [
        { mediaId: 1001, episodeNumber: 1, name: 'One', overview: '', airDate: null, still: null },
        { mediaId: 1002, episodeNumber: 2, name: 'Two', overview: '', airDate: null, still: null },
      ],
    });
    const secondSnapshot = {
      ...firstSnapshot,
      episodes: [
        {
          ...firstSnapshot.episodes[0],
          mediaId: 2001,
          name: 'One updated',
        },
      ],
    };

    const season = await repository.upsertSeasonDetail(firstSnapshot);
    await repository.upsertSeasonDetail(secondSnapshot);
    const hydrated = await repository.findSeasonByIdWithEpisodes(season.id);

    expect(hydrated?.episodes).toHaveLength(1);
    expect(hydrated?.episodes[0]).toEqual(
      expect.objectContaining({ episodeNumber: 1, mediaId: 2001, name: 'One updated' })
    );
  });

  it('clears all episodes when the catalog returns an empty snapshot', async () => {
    const { repository } = await setupTest();
    await repository.upsertTVShowDetail(createMockTVShowDetail({ mediaId: 501, seasons: [] }));

    const snapshot = createMockSeasonDetail({
      tvMediaId: 501,
      seasonNumber: 1,
      episodes: [
        { mediaId: 1003, episodeNumber: 1, name: 'One', overview: '', airDate: null, still: null },
      ],
    });
    const season = await repository.upsertSeasonDetail(snapshot);

    await repository.upsertSeasonDetail({ ...snapshot, episodes: [] });

    const hydrated = await repository.findSeasonByIdWithEpisodes(season.id);
    expect(hydrated?.episodes).toEqual([]);
  });
});
