import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { Database as SqliteDatabase } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

import { logger } from '../logger';
import * as schema from './schema';

const SCOPE = 'CatalogDatabase';

/**
 * Serializes async writes so the single Bun process never contends on the SQLite
 * write lock (port of the backend's `enqueueWrite` promise-tail pattern).
 */
export class WriteQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/**
 * The catalog's own database. The service is the single owner of catalog data —
 * the main app only keeps a slim index mirrored over HTTP.
 */
export class CatalogDatabase {
  readonly writeQueue = new WriteQueue();
  readonly db: BunSQLiteDatabase<typeof schema>;
  private readonly client: SqliteDatabase;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    const file = join(dataDir, 'catalog.db');
    this.client = new SqliteDatabase(file, { create: true });
    this.client.run('PRAGMA journal_mode = WAL;');
    this.client.run('PRAGMA synchronous = NORMAL;');
    this.client.run('PRAGMA busy_timeout = 5000;');
    this.client.run('PRAGMA foreign_keys = ON;');
    this.db = drizzle(this.client, { schema });
    migrate(this.db, { migrationsFolder: join(import.meta.dir, 'migrations') });
    logger.info(SCOPE, `Catalog database ready at ${join(dataDir, 'catalog.db')}`);
  }

  /**
   * Replaces the watching set (drives ON_DEMAND episode sync). Works in every
   * lifecycle state — the main app pushes it at boot, possibly before this
   * service is configured.
   */
  setWatching(mediaIds: number[]): void {
    this.db.transaction(tx => {
      tx.update(schema.tvShows).set({ watching: 0 }).where(eq(schema.tvShows.watching, 1)).run();
      for (const mediaId of mediaIds) {
        tx.update(schema.tvShows)
          .set({ watching: 1 })
          .where(eq(schema.tvShows.mediaId, mediaId))
          .run();
      }
    });
  }

  close(): void {
    this.client.close();
  }
}
