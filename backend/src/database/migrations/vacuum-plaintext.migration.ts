import { MigrationVersion } from '@entities/migration-version.entity';

import type { Migration } from './migration.types';

/**
 * Rewrite the database file after encryptSensitiveColumns: SQLite leaves the replaced plain
 * text in freed pages (and the WAL) until they are reused, so file paths stayed readable in the
 * file. VACUUM rebuilds it from live rows only. It cannot run inside a transaction.
 */
export const vacuumPlaintext: Migration = async ({ db, logger }) => {
  const repository = db.getRepository(MigrationVersion);
  await db.write(async () => {
    await repository.query('VACUUM');
    await repository.query('PRAGMA wal_checkpoint(TRUNCATE)');
  });
  logger.info('Migrations', 'Rewrote the database file without replaced plain text');
};
