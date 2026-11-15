import fs from 'fs';
import os from 'os';
import path from 'path';

import { createSource, mockEngineModules, testConfig, testDatabase } from '../helpers/engine';

mockEngineModules();

const { StorageService } = await import('../../src/storage/storage.service');

// MiB-sized, so free disk space (beyond the 256 MiB headroom) never decides: only the threshold does
const MB = 1024 ** 2;

describe('StorageService.playbackFits', () => {
  let downloadPath: string;
  let database: Awaited<ReturnType<typeof testDatabase>>;

  beforeEach(async () => {
    // A real directory; the sizes below are small enough for its free disk space not to matter
    downloadPath = fs.mkdtempSync(path.join(os.tmpdir(), 'miauflix-fits-'));
    database = await testDatabase();
  });

  afterEach(() => {
    database?.close();
    fs.rmSync(downloadPath, { recursive: true, force: true });
  });

  /** A 10 MiB threshold, unpadded, with one stored 6 MiB source. */
  const setup = async () => {
    const config = testConfig({
      DOWNLOAD_PATH: downloadPath,
      STORAGE_THRESHOLD: 10n * BigInt(MB),
      STORAGE_PAD_FILE_SIZES: false,
    });
    const storageService = new StorageService(database, config);
    await storageService.reload();
    const stored = await createSource(database);
    await storageService.createStorage({
      sourceId: stored.id,
      location: path.join(downloadPath, 'stored'),
      size: 6 * MB,
    });
    return { storageService, config, stored: stored.id };
  };

  it('counts storage nobody is playing as free, and live playback as taken', async () => {
    const { storageService, stored } = await setup();
    const other = (await createSource(database)).id;

    // The stored source can be evicted: the whole threshold is available
    expect(
      await storageService.playbackFits([
        { sourceId: other, bytes: 9 * MB },
        { sourceId: other, bytes: 11 * MB },
      ])
    ).toEqual([true, false]);

    await storageService.claimFile(
      stored,
      'movie.mkv',
      { kind: 'playback', ownerKey: 'viewer', expiresAt: null },
      true
    );
    // Now it is being watched: only the rest of the threshold is left
    expect(
      await storageService.playbackFits([
        { sourceId: other, bytes: 4 * MB },
        { sourceId: other, bytes: 5 * MB },
      ])
    ).toEqual([true, false]);
    // A source being watched still fits itself
    expect(await storageService.playbackFits([{ sourceId: stored, bytes: 6 * MB }])).toEqual([
      true,
    ]);
    // Asked about together, they are alternatives: the watched one would be replaced
    expect(
      await storageService.playbackFits([
        { sourceId: stored, bytes: 6 * MB },
        { sourceId: other, bytes: 9 * MB },
      ])
    ).toEqual([true, true]);
  });

  it('measures the padded size when files are padded', async () => {
    const { storageService, config } = await setup();
    const other = (await createSource(database)).id;
    const bytes = Math.floor(9.9 * MB);
    // Just above the file: it fits as it is, but its padded size (10 MiB) does not
    config.set('STORAGE_THRESHOLD', BigInt(Math.floor(9.95 * MB)));
    await storageService.reload();
    config.set('STORAGE_PAD_FILE_SIZES', false);
    expect(await storageService.playbackFits([{ sourceId: other, bytes }])).toEqual([true]);
    config.set('STORAGE_PAD_FILE_SIZES', true);
    expect(await storageService.playbackFits([{ sourceId: other, bytes }])).toEqual([false]);
  });
});
