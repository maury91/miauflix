import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  createSource,
  mockEngineModules,
  TEST_SETTINGS,
  testConfig,
  testDatabase,
} from '../helpers/engine';

mockEngineModules();

const { StorageService } = await import('../../src/storage/storage.service');
const { StorageImporter } = await import('../../src/storage/storage-import');

describe('StorageService.removeUnknownDownloads', () => {
  let downloadPath: string;

  beforeEach(() => {
    downloadPath = fs.mkdtempSync(path.join(os.tmpdir(), 'miauwatch-downloads-'));
  });

  afterEach(() => {
    fs.rmSync(downloadPath, { recursive: true, force: true });
  });

  /** A download directory holding one recorded download, two unknown entries and a probe. */
  const setup = async (exclusive: boolean, sealed = true) => {
    const database = await testDatabase();
    const config = testConfig({ DOWNLOAD_PATH: downloadPath, DOWNLOAD_PATH_EXCLUSIVE: exclusive });
    const storageService = new StorageService(database, config);
    // The allocation probe the constructor starts writes into the directory too
    await storageService.reload();
    if (sealed) new StorageImporter(database).seal();
    const source = await createSource(database);
    const owned = path.join(downloadPath, 'aaaaaaaaaaaaaaaa');
    await storageService.createStorage({ sourceId: source.id, location: owned, size: 1000 });
    fs.mkdirSync(owned);
    fs.writeFileSync(path.join(owned, 'piece'), 'x');
    fs.mkdirSync(path.join(downloadPath, 'bbbbbbbbbbbbbbbb'));
    fs.writeFileSync(path.join(downloadPath, 'bbbbbbbbbbbbbbbb', 'piece'), 'x');
    fs.writeFileSync(path.join(downloadPath, 'stray-file'), 'x');
    fs.writeFileSync(path.join(downloadPath, '.allocation-probe-123'), 'x');
    return storageService;
  };

  it('deletes what no storage record owns, keeping downloads and a running probe', async () => {
    const storageService = await setup(true);

    expect(await storageService.removeUnknownDownloads()).toBe(2);

    expect(fs.readdirSync(downloadPath).sort()).toEqual([
      '.allocation-probe-123',
      'aaaaaaaaaaaaaaaa',
    ]);
    expect(fs.existsSync(path.join(downloadPath, 'aaaaaaaaaaaaaaaa', 'piece'))).toBe(true);
  });

  it('keeps everything when the download directory is shared', async () => {
    const storageService = await setup(false);

    expect(await storageService.removeUnknownDownloads()).toBe(0);
    expect(fs.readdirSync(downloadPath)).toHaveLength(4);
  });

  it('waits for the storage import, which may still adopt those directories', async () => {
    const storageService = await setup(true, false);

    expect(await storageService.removeUnknownDownloads()).toBe(0);
    expect(fs.readdirSync(downloadPath)).toHaveLength(4);
  });
});

describe('StorageService.removeUnknownDownloads with the database in the download directory', () => {
  it('keeps the directory holding the database', async () => {
    const downloadPath = fs.mkdtempSync(path.join(os.tmpdir(), 'miauwatch-downloads-'));
    try {
      const dataDir = path.join(downloadPath, 'data');
      fs.mkdirSync(dataDir);
      const [{ MediaLoadDatabase, openDatabase }, { Encryption }] = await Promise.all([
        import('../../src/db/database'),
        import('../../src/lib/encryption'),
      ]);
      const database = new MediaLoadDatabase(
        openDatabase(path.join(dataDir, 'media-load.sqlite')),
        new Encryption(TEST_SETTINGS.SOURCE_SECURITY_KEY)
      );
      const storageService = new StorageService(
        database,
        testConfig({ DOWNLOAD_PATH: downloadPath, DOWNLOAD_PATH_EXCLUSIVE: true })
      );
      await storageService.reload();
      new StorageImporter(database).seal();

      expect(await storageService.removeUnknownDownloads()).toBe(0);
      expect(fs.existsSync(path.join(dataDir, 'media-load.sqlite'))).toBe(true);
      database.db.close();
    } finally {
      fs.rmSync(downloadPath, { recursive: true, force: true });
    }
  });

  it('keeps the database and its SQLite sidecars when it sits in the download directory', async () => {
    const downloadPath = fs.mkdtempSync(path.join(os.tmpdir(), 'miauwatch-downloads-'));
    try {
      const [{ MediaLoadDatabase, openDatabase }, { Encryption }] = await Promise.all([
        import('../../src/db/database'),
        import('../../src/lib/encryption'),
      ]);
      const databaseFile = path.join(downloadPath, 'media-load.sqlite');
      const database = new MediaLoadDatabase(
        openDatabase(databaseFile),
        new Encryption(TEST_SETTINGS.SOURCE_SECURITY_KEY)
      );
      const storageService = new StorageService(
        database,
        testConfig({ DOWNLOAD_PATH: downloadPath, DOWNLOAD_PATH_EXCLUSIVE: true })
      );
      await storageService.reload();
      new StorageImporter(database).seal();
      fs.writeFileSync(`${databaseFile}-journal`, 'x');
      fs.writeFileSync(path.join(downloadPath, 'stray-file'), 'x');

      expect(await storageService.removeUnknownDownloads()).toBe(1);
      expect(fs.readdirSync(downloadPath).sort()).toEqual([
        'media-load.sqlite',
        'media-load.sqlite-journal',
        'media-load.sqlite-shm',
        'media-load.sqlite-wal',
      ]);
      database.db.close();
    } finally {
      fs.rmSync(downloadPath, { recursive: true, force: true });
    }
  });
});
