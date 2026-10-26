import { logger } from '@logger';

import type { Database } from '@database/database';
import { MigrationVersion } from '@entities/migration-version.entity';

import { migrations as allMigrations } from './index';
import type { Migration } from './migration.types';

const VERSION_ROW_ID = 1;

/**
 * Brings the database's data up to date: runs every migration after the stored version, in
 * order, saving the version after each one so a failure resumes at the step that failed.
 * Run it after the database is initialized and before any service touches the data.
 */
export class MigrationService {
  constructor(
    private readonly db: Database,
    private readonly migrations: readonly Migration[] = allMigrations
  ) {}

  /** Returns the version the database is at afterwards. */
  async run(): Promise<number> {
    const versions = this.db.getRepository(MigrationVersion);
    const stored = await versions.findOneBy({ id: VERSION_ROW_ID });
    let version = stored?.version ?? 0;

    if (version > this.migrations.length) {
      logger.warn(
        'Migrations',
        `Database is at version ${version}, newer than this build (${this.migrations.length}); skipping migrations`
      );
      return version;
    }

    for (; version < this.migrations.length; version++) {
      const migration = this.migrations[version];
      const name = migration.name || `migration ${version + 1}`;
      logger.info('Migrations', `Running ${version + 1}/${this.migrations.length}: ${name}`);
      // A failure propagates and stops startup; the saved version still points at this step.
      await migration({ db: this.db, logger });
      await versions.save({ id: VERSION_ROW_ID, version: version + 1 });
    }
    return version;
  }
}
