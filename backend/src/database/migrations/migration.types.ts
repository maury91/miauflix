import type { logger } from '@logger';

import type { Database } from '@database/database';

/** What a migration may use: the initialized database and a logger, nothing else. */
export interface MigrationContext {
  db: Database;
  logger: typeof logger;
}

/**
 * A data migration. It runs once per database, in array order, and must be a no-op on an
 * empty database. It must also be safe to run again: a crash after it finishes but before the
 * version is saved runs it a second time.
 */
export type Migration = (context: MigrationContext) => Promise<void>;
