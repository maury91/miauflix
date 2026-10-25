jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { createMockContentSource } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';
import { Quality, VideoCodec } from '@miauflix/source-metadata-extractor';

import { ContentSource } from '@entities/content-source.entity';
import { MigrationVersion } from '@entities/migration-version.entity';

import { backfillStreamingScores } from './backfill-streaming-scores.migration';
import { MigrationService } from './migration.service';
import type { Migration } from './migration.types';

describe('MigrationService', () => {
  const dbHelper = createTestDatabase();

  beforeAll(() => {
    configureFakerSeed();
  });

  afterEach(async () => {
    await dbHelper.cleanup();
  });

  const setupTest = async (migrations: Migration[]) => {
    const db = await dbHelper.setupTestDatabase();
    const storedVersion = async () =>
      (await db.getRepository(MigrationVersion).findOneBy({ id: 1 }))?.version;
    return { db, service: new MigrationService(db, migrations), storedVersion };
  };

  it('runs every migration in order on a new database and stores the version', async () => {
    const order: string[] = [];
    const first: Migration = async () => void order.push('first');
    const second: Migration = async () => void order.push('second');
    const { service, storedVersion } = await setupTest([first, second]);

    await expect(service.run()).resolves.toBe(2);
    expect(order).toEqual(['first', 'second']);
    expect(await storedVersion()).toBe(2);
  });

  it('only runs the migrations after the stored version', async () => {
    const first = jest.fn<Promise<void>, Parameters<Migration>>().mockResolvedValue();
    const second = jest.fn<Promise<void>, Parameters<Migration>>().mockResolvedValue();
    const { db, service, storedVersion } = await setupTest([first, second]);
    await db.getRepository(MigrationVersion).save({ id: 1, version: 1 });

    await service.run();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ db }));
    expect(await storedVersion()).toBe(2);

    // Already up to date: nothing runs again.
    await service.run();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops at a failing migration and resumes there on the next run', async () => {
    const first = jest.fn<Promise<void>, Parameters<Migration>>().mockResolvedValue();
    const flaky = jest
      .fn<Promise<void>, Parameters<Migration>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue();
    const last = jest.fn<Promise<void>, Parameters<Migration>>().mockResolvedValue();
    const { service, storedVersion } = await setupTest([first, flaky, last]);

    await expect(service.run()).rejects.toThrow('disk full');
    expect(last).not.toHaveBeenCalled();
    expect(await storedVersion()).toBe(1);

    await expect(service.run()).resolves.toBe(3);
    expect(first).toHaveBeenCalledTimes(1);
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(last).toHaveBeenCalledTimes(1);
  });

  it('leaves a database from a newer build alone', async () => {
    const migration = jest.fn<Promise<void>, Parameters<Migration>>().mockResolvedValue();
    const { db, service, storedVersion } = await setupTest([migration]);
    await db.getRepository(MigrationVersion).save({ id: 1, version: 5 });

    await expect(service.run()).resolves.toBe(5);
    expect(migration).not.toHaveBeenCalled();
    expect(await storedVersion()).toBe(5);
  });

  it('backfills streaming scores of sources stored with 0, and is a no-op when empty', async () => {
    const { db, service } = await setupTest([backfillStreamingScores]);
    const sources = db.getRepository(ContentSource);
    await service.run();
    expect(await sources.count()).toBe(0);

    // Let SQLite assign ids; the mock's storage relation is not a column.
    const row = (overrides: Partial<ContentSource>): Partial<ContentSource> => ({
      ...createMockContentSource(overrides),
      id: undefined,
      storage: undefined,
    });
    await sources.save([
      row({
        quality: Quality.FHD,
        videoCodec: VideoCodec.X264,
        broadcasters: 100,
        watchers: 10,
        streamingScore: 0,
      }),
      row({ streamingScore: 1234 }),
    ]);
    await backfillStreamingScores({ db, logger: jest.requireMock('@logger').logger });

    const [scored, untouched] = await sources.find({ order: { id: 'ASC' } });
    expect(scored.streamingScore).toBeGreaterThan(0);
    // Already-scored rows keep their score.
    expect(untouched.streamingScore).toBe(1234);
  });
});
