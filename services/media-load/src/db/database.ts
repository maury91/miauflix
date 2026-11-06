import { mkdirSync } from 'node:fs';

import { Database } from 'bun:sqlite';

import type { Encryption } from '../lib/encryption';
import { SourceRepository } from '../storage/source.repository';
import { StorageRepository } from '../storage/storage.repository';
import { StorageFileRepository } from '../storage/storage-file.repository';
import { migrations } from './migrations';

/** Open (creating or upgrading) the service database at `path`; `:memory:` for tests. */
export const openDatabase = (path: string): Database => {
  if (path !== ':memory:')
    mkdirSync(path.slice(0, path.lastIndexOf('/')) || '.', { recursive: true });
  const db = new Database(path);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA busy_timeout = 5000');
  const { user_version: version } = db.query('PRAGMA user_version').get() as {
    user_version: number;
  };
  if (version > migrations.length)
    throw new Error('Media load database is newer than this service');
  for (let index = version; index < migrations.length; index++)
    db.transaction(() => {
      db.run(migrations[index]);
      db.run(`PRAGMA user_version = ${index + 1}`);
    })();
  return db;
};

/** The service's records, with the repositories the storage layer uses. */
export class MediaLoadDatabase {
  private readonly sources: SourceRepository;
  private readonly storage: StorageRepository;
  private readonly storageFiles: StorageFileRepository;

  constructor(
    readonly db: Database,
    encryption: Encryption
  ) {
    MediaLoadDatabase.checkKey(db, encryption);
    this.sources = new SourceRepository(db, encryption);
    this.storage = new StorageRepository(db, encryption, this.sources);
    this.storageFiles = new StorageFileRepository(db, encryption);
  }

  /**
   * Records are encrypted with the host's key: a different key would read nothing and write
   * records the old key cannot read, so it is refused. The first key is recorded as a canary.
   */
  private static checkKey(db: Database, encryption: Encryption): void {
    const row = db
      .query<{ value: string }, []>("SELECT value FROM meta WHERE key = 'canary'")
      .get();
    if (!row) {
      db.query("INSERT INTO meta (key, value) VALUES ('canary', ?)").run(
        encryption.encryptString('media-load')
      );
      return;
    }
    try {
      encryption.decryptString(row.value);
    } catch {
      throw new Error(
        'The security key does not match the one this media-load database was created with'
      );
    }
  }

  getSourceRepository(): SourceRepository {
    return this.sources;
  }

  getStorageRepository(): StorageRepository {
    return this.storage;
  }

  getStorageFileRepository(): StorageFileRepository {
    return this.storageFiles;
  }

  close(): void {
    this.db.close();
  }
}
