jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { createMockSeasonDetail, createMockTVShowDetail } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';

import { AvailabilityRequest } from '@entities/availability-request.entity';
import { Episode } from '@entities/episode.entity';
import { Notification } from '@entities/notification.entity';
import { Progress } from '@entities/progress.entity';
import { Season } from '@entities/season.entity';
import { User, UserRole } from '@entities/user.entity';
import type { EpisodeLayout, SeasonSummary } from '@services/catalog/catalog.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';

import { EpisodeRenumberService } from './episode-renumber.service';

const SHOW = 900;
const summary = (seasonNumber: number, mediaId: number, episodeCount: number): SeasonSummary => ({
  mediaId,
  seasonNumber,
  name: `Season ${seasonNumber}`,
  overview: '',
  airDate: null,
  poster: null,
  episodeCount,
  synced: true,
});

/** TMDB keeps 7 episodes in season 1; AniList splits them 3 + 4. */
const LAYOUT: EpisodeLayout = {
  tvMediaId: SHOW,
  layout: 'anilist',
  version: 'v1',
  episodes: Array.from({ length: 7 }, (_, i) => ({
    mediaId: 9001 + i,
    seasonNumber: i < 3 ? 1 : 2,
    episodeNumber: i < 3 ? i + 1 : i - 2,
    providerSeasonNumber: 1,
    providerEpisodeNumber: i + 1,
  })),
};

describe('EpisodeRenumberService', () => {
  const dbHelper = createTestDatabase();

  beforeAll(() => {
    configureFakerSeed();
  });

  afterEach(async () => {
    await dbHelper.cleanup();
  });

  const setupTest = async () => {
    const db = await dbHelper.setupTestDatabase();
    const repository = db.getTVShowRepository();
    const tmdbDetail = createMockTVShowDetail({
      mediaId: SHOW,
      seasons: [summary(1, 81, 7)],
      seasonLayout: 'tmdb',
      seasonLayoutVersion: null,
    });
    const show = await repository.upsertTVShowDetail(tmdbDetail);
    // Only the first six episodes are mirrored locally.
    await repository.upsertSeasonDetail(
      createMockSeasonDetail({
        tvMediaId: SHOW,
        seasonNumber: 1,
        episodes: LAYOUT.episodes.slice(0, 6).map(e => ({
          mediaId: e.mediaId,
          episodeNumber: e.providerEpisodeNumber,
          name: `Episode ${e.providerEpisodeNumber}`,
          overview: '',
          airDate: null,
          still: null,
        })),
      })
    );
    const user = await db
      .getRepository(User)
      .save(
        db
          .getRepository(User)
          .create({ email: 'a@example.com', passwordHash: 'x', role: UserRole.USER })
      );
    const progress = (episode: number, positionSeconds: number) =>
      db.getRepository(Progress).save(
        db.getRepository(Progress).create({
          userId: user.id,
          playableKind: 'episode',
          playableKey: `e:${SHOW}:1:${episode}`,
          positionSeconds,
          durationSeconds: 1400,
          state: 'paused',
        })
      );
    await progress(2, 100);
    await progress(5, 500);
    await progress(7, 700);
    await db
      .getRepository(AvailabilityRequest)
      .save({ userId: user.id, playableKey: `e:${SHOW}:1:4` });
    await db.getRepository(Notification).save(
      db.getRepository(Notification).create({
        userId: user.id,
        dedupeKey: 'episode-6',
        type: 'tv_episode_available',
        mediaType: 'tv',
        mediaId: SHOW,
        title: 'Show',
        message: 'S1E6 is ready',
        seasonNumber: 1,
        episodeNumber: 6,
      })
    );
    const episodesBefore = await db.getRepository(Episode).find();
    const catalogClient = {
      getEpisodeLayout: jest.fn().mockResolvedValue(LAYOUT),
    } as unknown as jest.Mocked<CatalogClientService>;
    const anilistDetail = {
      ...tmdbDetail,
      seasons: [summary(1, -1, 3), summary(2, -2, 4)],
      seasonLayout: 'anilist' as const,
      seasonLayoutVersion: 'v1',
    };
    await repository.upsertTVShowDetail(anilistDetail);
    return {
      db,
      show,
      tmdbDetail,
      anilistDetail,
      episodesBefore,
      catalogClient,
      service: new EpisodeRenumberService(db, catalogClient),
    };
  };

  const numbering = async (db: Awaited<ReturnType<typeof setupTest>>['db']) => {
    const seasons = await db.getRepository(Season).find({ relations: { episodes: true } });
    return Object.fromEntries(
      seasons
        .filter(season => season.episodes.length)
        .map(season => [
          season.seasonNumber,
          season.episodes
            .sort((a, b) => a.episodeNumber - b.episodeNumber)
            .map(e => [e.episodeNumber, e.mediaId, e.providerEpisodeNumber]),
        ])
    );
  };
  const keys = async (db: Awaited<ReturnType<typeof setupTest>>['db']) =>
    (await db.getRepository(Progress).find({ order: { positionSeconds: 'ASC' } })).map(
      p => p.playableKey
    );

  it('moves episodes and every stored episode key to the AniList numbering', async () => {
    const { db, show, anilistDetail, episodesBefore, service } = await setupTest();

    expect(await service.reconcile(show, anilistDetail)).toBe('v1');

    expect(await numbering(db)).toEqual({
      1: [
        [1, 9001, 1],
        [2, 9002, 2],
        [3, 9003, 3],
      ],
      2: [
        [1, 9004, 4],
        [2, 9005, 5],
        [3, 9006, 6],
      ],
    });
    // Same rows (and so the same source links), only renumbered.
    const ids = (await db.getRepository(Episode).find()).map(e => e.id).sort();
    expect(ids).toEqual(episodesBefore.map(e => e.id).sort());
    // Episode 7 is not mirrored yet; its progress still follows TMDB's numbering to the new one.
    expect(await keys(db)).toEqual([`e:${SHOW}:1:2`, `e:${SHOW}:2:2`, `e:${SHOW}:2:4`]);
    expect((await db.getRepository(AvailabilityRequest).find())[0]!.playableKey).toBe(
      `e:${SHOW}:2:1`
    );
    expect(
      await db.getRepository(Notification).findOneByOrFail({ dedupeKey: 'episode-6' })
    ).toEqual(expect.objectContaining({ seasonNumber: 2, episodeNumber: 3 }));
    expect((await db.getTVShowRepository().findByMediaId(SHOW))?.seasonLayoutVersion).toBe('v1');
  });

  it('does nothing when the stored layout already matches', async () => {
    const { db, show, anilistDetail, catalogClient, service } = await setupTest();
    await service.reconcile(show, anilistDetail);
    const stored = (await db.getTVShowRepository().findByMediaId(SHOW))!;

    expect(await service.reconcile(stored, anilistDetail)).toBe('v1');
    expect(catalogClient.getEpisodeLayout).toHaveBeenCalledTimes(1);
  });

  it('moves everything back when the catalog returns to TMDB seasons', async () => {
    const { db, show, anilistDetail, tmdbDetail, service } = await setupTest();
    await service.reconcile(show, anilistDetail);
    const stored = (await db.getTVShowRepository().findByMediaId(SHOW))!;

    expect(await service.reconcile(stored, tmdbDetail)).toBeNull();

    expect(await numbering(db)).toEqual({
      1: [1, 2, 3, 4, 5, 6].map(n => [n, 9000 + n, null]),
    });
    expect((await db.getRepository(Season).findBy({ seasonNumber: 2 })).length).toBe(0);
    // Episode 7 was never mirrored, so nothing records where it came from: its key stays.
    expect(await keys(db)).toEqual([`e:${SHOW}:1:2`, `e:${SHOW}:1:5`, `e:${SHOW}:2:4`]);
    expect((await db.getRepository(AvailabilityRequest).find())[0]!.playableKey).toBe(
      `e:${SHOW}:1:4`
    );
  });

  it('leaves shows alone when the catalog predates season layouts', async () => {
    const { show, tmdbDetail, catalogClient, service } = await setupTest();
    const old = { ...tmdbDetail };
    delete old.seasonLayoutVersion;

    expect(await service.reconcile(show, old)).toBeNull();
    expect(catalogClient.getEpisodeLayout).not.toHaveBeenCalled();
  });
});
