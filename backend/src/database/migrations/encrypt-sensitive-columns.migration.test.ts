jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { TestDataFactory } from '@__test-utils__/test-data.factory';
import { configureFakerSeed } from '@__test-utils__/utils';
import { logger } from '@logger';
import { readFile } from 'fs/promises';
import path from 'path';

import type { Database } from '@database/database';
import { Episode } from '@entities/episode.entity';
import { Season } from '@entities/season.entity';
import { Storage } from '@entities/storage.entity';
import { TVShow } from '@entities/tvshow.entity';

import { COLUMN_RENAMES, renameColumns } from './column-renames';
import { ENCRYPTED_COLUMNS, encryptSensitiveColumns } from './encrypt-sensitive-columns.migration';
import { vacuumPlaintext } from './vacuum-plaintext.migration';

const PATH = 'The End of Oak Street 2026 UHD BluRay 2160p/The End of Oak Street 2026.mkv';
const OTHER_PATH = 'The End of Oak Street 2026 UHD BluRay 2160p/Subs/English.srt';

describe('encrypted sensitive columns', () => {
  const dbHelper = createTestDatabase();

  beforeAll(() => {
    configureFakerSeed();
  });

  afterEach(async () => {
    await dbHelper.cleanup();
  });

  const raw = (db: Database, sql: string, parameters: unknown[] = []) =>
    db.getRepository(TVShow).query(sql, parameters) as Promise<Array<Record<string, unknown>>>;

  /** Every stored value of the encrypted columns, as SQLite holds it. */
  const storedValues = async (db: Database) => {
    const values: string[] = [];
    for (const { table, column } of ENCRYPTED_COLUMNS) {
      const rows = await raw(db, `SELECT "${column}" AS value FROM "${table}"`);
      for (const { value } of rows) if (typeof value === 'string') values.push(value);
    }
    return values;
  };

  const setupTest = async () => {
    const db = await dbHelper.setupTestDatabase();
    const factory = new TestDataFactory(db);
    const movie = await factory.createTestMovie();
    const source = await factory.createTestContentSource(movie.id);
    const storage = await db.getRepository(Storage).save(factory.createTestStorage(source.id));
    return { db, movie, source, storageId: storage.id };
  };

  const createEpisode = async (db: Database) => {
    const show = await db.getRepository(TVShow).save({
      mediaId: 1,
      name: 'Show',
      overview: '',
      firstAirDate: '2026-01-01',
      poster: '',
      backdrop: '',
      status: 'Returning Series',
      popularity: 1,
      rating: 1,
    } as Partial<TVShow>);
    const season = await db.getRepository(Season).save({
      mediaId: 2,
      tvShowId: show.id,
      seasonNumber: 1,
      name: 'Season 1',
      overview: '',
    } as Partial<Season>);
    return db.getRepository(Episode).save({
      mediaId: 3,
      seasonId: season.id,
      episodeNumber: 1,
      name: 'Pilot',
      overview: '',
      stillPath: '',
      imdbId: '',
    } as Partial<Episode>);
  };

  it('stores paths, probes, searches and notifications encrypted and reads them back', async () => {
    const { db, movie, source, storageId } = await setupTest();
    const sources = db.getContentSourceRepository();
    const files = db.getStorageFileRepository();
    const probes = db.getMediaProbeRepository();

    await probes.save(source.id, PATH, '{"streams":[]}');
    await expect(probes.find(source.id, PATH)).resolves.toBe('{"streams":[]}');

    // The update query builder's set() encrypts; the first writer wins.
    await expect(sources.setMovieVideoFilePath(movie.id, source.id, PATH)).resolves.toBe(PATH);
    await expect(sources.setMovieVideoFilePath(movie.id, source.id, OTHER_PATH)).resolves.toBe(
      PATH
    );

    await files.upsertFiles(storageId, [
      { path: PATH, offset: 0, length: 4 },
      { path: OTHER_PATH, offset: 4, length: 4 },
    ]);
    await files.markFilesComplete(storageId, [PATH]);
    const stored = await files.findFiles(storageId);
    expect(stored.find(file => file.path === PATH)?.completedAt).toBeInstanceOf(Date);
    expect(stored.find(file => file.path === OTHER_PATH)?.completedAt).toBeNull();

    // A second upsert of the same claim hits the unique (storageId, k, kind, ownerKey) index.
    await files.upsertClaim(storageId, PATH, { kind: 'playback', ownerKey: 'owner', rangeEnd: 1 });
    await files.upsertClaim(storageId, PATH, { kind: 'playback', ownerKey: 'owner', rangeEnd: 2 });
    const claims = await files.findLiveClaims(storageId);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ path: PATH, rangeEnd: 2 });
    await files.deleteClaims(storageId, { path: PATH });
    await expect(files.findLiveClaims(storageId)).resolves.toHaveLength(0);

    const values = await storedValues(db);
    expect(values.length).toBeGreaterThanOrEqual(5);
    expect(values.join('\n')).not.toContain('Oak Street');
    expect(values.join('\n')).not.toContain('streams');
  });

  it('keeps episode file lookups and canonicalization working on encrypted paths', async () => {
    const { db, source } = await setupTest();
    const episodes = db.getEpisodeSourceRepository();
    const episode = await createEpisode(db);

    const relative = await episodes.associate(
      episode.id,
      source.id,
      'Oak.Street.S01E01.mkv',
      'single'
    );
    expect(relative.videoFilePath).toBe('Oak.Street.S01E01.mkv');
    // Associating the same file again finds the stored row instead of adding one.
    const again = await episodes.associate(
      episode.id,
      source.id,
      'Oak.Street.S01E01.mkv',
      'single'
    );
    expect(again.id).toBe(relative.id);

    const canonical = 'Oak Street S01/Oak.Street.S01E01.mkv';
    await expect(
      episodes.setVideoFilePath(relative.id, relative.videoFilePath!, canonical)
    ).resolves.toBe(canonical);
    const links = await episodes.findByEpisodeId(episode.id);
    expect(links.map(link => link.videoFilePath)).toEqual([canonical]);

    // The NULL path insert goes through raw SQL on the renamed column.
    const unnamed = await episodes.associate(episode.id, source.id, null, 'combined');
    expect(unnamed.videoFilePath).toBeNull();

    expect((await storedValues(db)).join('\n')).not.toContain('Oak');
  });

  it('migrates a database with the old column names and plain text values, once', async () => {
    const { db, movie, source, storageId } = await setupTest();
    // Recreate the pre-encryption schema: old column names, plain text values.
    for (const { table, from, to } of COLUMN_RENAMES) {
      await raw(db, `ALTER TABLE "${table}" RENAME COLUMN "${to}" TO "${from}"`);
    }
    await raw(db, 'INSERT INTO media_probe (sourceId, filePath, result) VALUES (?, ?, ?)', [
      source.id,
      PATH,
      '{"streams":[]}',
    ]);
    await raw(db, 'UPDATE movie_source SET videoFilePath = ? WHERE movieId = ?', [PATH, movie.id]);
    await raw(
      db,
      'INSERT INTO storage_file (storageId, path, offset, length) VALUES (?, ?, 0, 8)',
      [storageId, PATH]
    );

    await renameColumns(db.getRepository(TVShow).manager.connection);
    await renameColumns(db.getRepository(TVShow).manager.connection); // idempotent
    await encryptSensitiveColumns({ db, logger });
    const encrypted = await storedValues(db);
    expect(encrypted).toHaveLength(4);
    expect(encrypted.join('\n')).not.toContain('Oak Street');

    // A second run (crash before the version was saved) leaves the values alone.
    await encryptSensitiveColumns({ db, logger });
    await expect(storedValues(db)).resolves.toEqual(encrypted);

    // Deleted and replaced plain text survives in the file until it is rewritten.
    await raw(db, 'INSERT INTO media_probe (sourceId, k, v) VALUES (?, ?, ?)', [
      source.id + 1,
      'Oak Street leftover',
      '{}',
    ]);
    await raw(db, 'DELETE FROM media_probe WHERE sourceId = ?', [source.id + 1]);
    const databaseFile = async () => {
      const file = path.join(dbHelper.getTestDir(), 'database.sqlite');
      const wal = await readFile(`${file}-wal`).catch(() => Buffer.alloc(0));
      return Buffer.concat([await readFile(file), wal]);
    };
    expect((await databaseFile()).includes('Oak Street leftover')).toBe(true);
    await vacuumPlaintext({ db, logger });
    expect((await databaseFile()).includes('Oak Street')).toBe(false);

    await expect(db.getMediaProbeRepository().find(source.id, PATH)).resolves.toBe(
      '{"streams":[]}'
    );
    await expect(
      db.getContentSourceRepository().findMovieVideoFilePath(movie.id, source.id)
    ).resolves.toBe(PATH);
    const [file] = await db.getStorageFileRepository().findFiles(storageId);
    expect(file.path).toBe(PATH);
  });
});
