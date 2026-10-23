jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { TestDataFactory } from '@__test-utils__/test-data.factory';
import { Quality } from '@miauflix/source-metadata-extractor';

import { ContentSource } from '@entities/content-source.entity';
import { Episode } from '@entities/episode.entity';
import { MovieSource } from '@entities/movie-source.entity';
import { Season } from '@entities/season.entity';
import { TVShow } from '@entities/tvshow.entity';
import type { ContentSourceInput } from '@repositories/content-source.repository';

const UPPERCASE_HASH = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';

const sourceInput = (overrides: Partial<ContentSourceInput> = {}): ContentSourceInput => ({
  hash: UPPERCASE_HASH,
  magnetLink: 'magnet:?xt=urn:btih:test',
  quality: null,
  size: 100,
  videoCodec: null,
  source: 'test',
  sourceType: null,
  ...overrides,
});

describe('ContentSourceRepository', () => {
  const dbHelper = createTestDatabase();

  const setupTest = async () => {
    const database = await dbHelper.setupTestDatabase();
    const factory = new TestDataFactory(database);
    return {
      database,
      factory,
      repository: database.getContentSourceRepository(),
      countSources: () => database.getRepository(ContentSource).count(),
      countLinks: () => database.getRepository(MovieSource).count(),
    };
  };

  const createEpisode = async (database: Awaited<ReturnType<typeof setupTest>>['database']) => {
    const show = await database.getRepository(TVShow).save({
      mediaId: 9_910_001,
      name: 'Shared Source Show',
      overview: '',
      firstAirDate: '2020-01-01',
      poster: '',
      backdrop: '',
      status: 'Ended',
    });
    const season = await database.getRepository(Season).save({
      mediaId: 9_920_001,
      tvShowId: show.id,
      seasonNumber: 1,
      name: 'Season 1',
      overview: '',
    });
    const episode = await database.getRepository(Episode).save({
      mediaId: 9_930_001,
      seasonId: season.id,
      episodeNumber: 1,
      name: 'Episode 1',
      overview: '',
      airDate: '2020-01-01',
      stillPath: '',
      imdbId: '',
    });
    return { show, episode };
  };

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['Date'] });
  });

  afterEach(async () => {
    await dbHelper.cleanup();
    jest.useRealTimers();
  });

  it('stores one row per info hash regardless of provider casing', async () => {
    const { repository, countSources } = await setupTest();

    const yts = await repository.upsertByHash(sourceInput());
    const therarbg = await repository.upsertByHash(
      sourceInput({ hash: UPPERCASE_HASH.toLowerCase(), magnetLink: 'magnet:?xt=urn:btih:new' })
    );

    expect(therarbg.id).toBe(yts.id);
    expect(therarbg.hash).toBe(UPPERCASE_HASH.toLowerCase());
    expect(therarbg.magnetLink).toBe('magnet:?xt=urn:btih:new');
    expect(await countSources()).toBe(1);
  });

  it('converges concurrent upserts of the same hash on one row', async () => {
    const { repository, countSources } = await setupTest();

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        repository.upsertByHash(sourceInput({ size: 100 + index }))
      )
    );

    expect(new Set(results.map(result => result.id)).size).toBe(1);
    expect(await countSources()).toBe(1);
  });

  it('keeps a resolved torrent file when the provider reports the source again', async () => {
    const { repository } = await setupTest();
    const stored = await repository.upsertByHash(sourceInput());
    await repository.updateSourceFile(stored.id, Buffer.from('torrent-file'));

    const refreshed = await repository.upsertByHash(sourceInput({ broadcasters: 50 }));

    expect(refreshed.file?.toString()).toBe('torrent-file');
  });

  it('links one source to several movies without duplicating it', async () => {
    const { repository, factory, countSources, countLinks } = await setupTest();
    const first = await factory.createTestMovie();
    const second = await factory.createTestMovie();
    const other = await factory.createTestMovie();

    const [forFirst] = await repository.upsertForMovie(first.id, [sourceInput()]);
    const [forSecond] = await repository.upsertForMovie(second.id, [
      sourceInput({ hash: UPPERCASE_HASH.toLowerCase() }),
    ]);
    await repository.upsertForMovie(first.id, [sourceInput()]);

    expect(forSecond.id).toBe(forFirst.id);
    expect(await countSources()).toBe(1);
    expect(await countLinks()).toBe(2);
    expect((await repository.findByMovieId(first.id)).map(source => source.id)).toEqual([
      forFirst.id,
    ]);
    expect((await repository.findByMovieId(second.id)).map(source => source.id)).toEqual([
      forFirst.id,
    ]);
    expect(await repository.isLinkedToMovie(second.id, forFirst.id)).toBe(true);
    expect(await repository.isLinkedToMovie(other.id, forFirst.id)).toBe(false);
  });

  it('queues a shared source for metadata once and skips sources without movies', async () => {
    const { repository, factory } = await setupTest();
    const first = await factory.createTestMovie();
    const second = await factory.createTestMovie();
    // Null-quality sources are excluded by the 3D filter, as before the refactor.
    const [shared] = await repository.upsertForMovie(first.id, [
      sourceInput({ quality: Quality.FHD }),
    ]);
    await repository.linkMovie(second.id, shared.id);
    await repository.upsertByHash(
      sourceInput({ hash: '0000000000000000000000000000000000000001', quality: Quality.FHD })
    );

    const queued = await repository.getNextSourcesToProcess(10);

    expect(queued.map(source => source.id)).toEqual([shared.id]);
  });

  it('shares one source between a movie and an episode', async () => {
    const { database, repository, factory, countSources } = await setupTest();
    const movie = await factory.createTestMovie();
    const { show, episode } = await createEpisode(database);
    const episodeSources = database.getEpisodeSourceRepository();

    const tvRelease = await repository.upsertByHash(
      sourceInput({ hash: UPPERCASE_HASH.toLowerCase(), quality: Quality.FHD })
    );
    await episodeSources.associate(episode.id, tvRelease.id, 'Show.S01E01.mkv', 'single');
    const [movieRelease] = await repository.upsertForMovie(movie.id, [sourceInput()]);

    expect(movieRelease.id).toBe(tvRelease.id);
    expect(await countSources()).toBe(1);
    expect(await repository.isLinkedToMovie(movie.id, tvRelease.id)).toBe(true);
    const playback = await episodeSources.findForPlayback(show.mediaId, 1, 1, tvRelease.id);
    expect(playback?.source.id).toBe(tvRelease.id);
    expect(playback?.videoFilePath).toBe('Show.S01E01.mkv');
  });

  it('converges concurrent episode file associations on one row', async () => {
    const { database, repository } = await setupTest();
    const { episode } = await createEpisode(database);
    const source = await repository.upsertByHash(sourceInput());
    const episodeSources = database.getEpisodeSourceRepository();
    const links = await Promise.all([
      episodeSources.associate(episode.id, source.id, 'Pack/episode.mkv', 'single'),
      episodeSources.associate(episode.id, source.id, 'Pack/episode.mkv', 'single'),
    ]);
    expect(links[0].id).toBe(links[1].id);
    expect(await episodeSources.findByEpisodeId(episode.id)).toHaveLength(1);
  });

  it('converges concurrent episode associations with unknown filenames', async () => {
    const { database, repository } = await setupTest();
    const { episode } = await createEpisode(database);
    const source = await repository.upsertByHash(sourceInput());
    const associations = database.getEpisodeSourceRepository();
    const links = await Promise.all([
      associations.associate(episode.id, source.id, null, 'single'),
      associations.associate(episode.id, source.id, null, 'single'),
    ]);
    expect(links[0].id).toBe(links[1].id);
    expect(await associations.findByEpisodeId(episode.id)).toHaveLength(1);
  });

  it('merges a stale provider path into an already-associated canonical episode path', async () => {
    const { database, repository } = await setupTest();
    const { episode } = await createEpisode(database);
    const source = await repository.upsertByHash(sourceInput());
    const associations = database.getEpisodeSourceRepository();
    const stale = await associations.associate(episode.id, source.id, 'episode.mkv', 'single');
    await associations.associate(episode.id, source.id, 'Pack/episode.mkv', 'single');
    await expect(
      Promise.all([
        associations.setVideoFilePath(stale.id, 'episode.mkv', 'Pack/episode.mkv'),
        associations.setVideoFilePath(stale.id, 'episode.mkv', 'Pack/episode.mkv'),
      ])
    ).resolves.toEqual(['Pack/episode.mkv', 'Pack/episode.mkv']);
    expect(await associations.findByEpisodeId(episode.id)).toHaveLength(1);
  });

  it('serializes association with canonicalization and reuses the canonical link on rediscovery', async () => {
    const { database, repository } = await setupTest();
    const { episode } = await createEpisode(database);
    const source = await repository.upsertByHash(sourceInput());
    const links = database.getEpisodeSourceRepository();
    const stale = await links.associate(episode.id, source.id, 'episode.mkv', 'single');
    await expect(
      Promise.all([
        links.associate(episode.id, source.id, 'episode.mkv', 'single'),
        links.setVideoFilePath(stale.id, 'episode.mkv', 'Pack/episode.mkv'),
        links.associate(episode.id, source.id, 'episode.mkv', 'single'),
      ])
    ).resolves.toHaveLength(3);
    expect(await links.findByEpisodeId(episode.id)).toHaveLength(1);
    await expect(
      links.associate(episode.id, source.id, 'episode.mkv', 'single')
    ).resolves.toMatchObject({ videoFilePath: 'Pack/episode.mkv' });
  });

  it('surfaces constraint violations other than the hash conflict', async () => {
    const { repository, countSources } = await setupTest();
    const withoutProvider = sourceInput({ source: undefined });

    await expect(repository.upsertByHash(withoutProvider)).rejects.toThrow(/NOT NULL/);
    expect(await countSources()).toBe(0);
  });

  it('keeps the first stored main video path for a movie link', async () => {
    const { repository, factory } = await setupTest();
    const movie = await factory.createTestMovie();
    const [source] = await repository.upsertForMovie(movie.id, [sourceInput()]);

    expect(await repository.findMovieVideoFilePath(movie.id, source.id)).toBeNull();
    await expect(
      repository.setMovieVideoFilePath(movie.id, source.id, 'Movie/Movie.mkv')
    ).resolves.toBe('Movie/Movie.mkv');
    await expect(
      repository.setMovieVideoFilePath(movie.id, source.id, 'Movie/Other.mkv')
    ).resolves.toBe('Movie/Movie.mkv');
    expect(await repository.findMovieVideoFilePath(movie.id, source.id)).toBe('Movie/Movie.mkv');
  });
});
