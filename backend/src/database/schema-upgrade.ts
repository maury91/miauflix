import { logger } from '@logger';
import { mkdir, mkdtemp, readdir, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import type { MigrationInterface } from 'typeorm';
import { DataSource } from 'typeorm';

import { renameColumns } from './migrations/column-renames';

export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';
/** Backups taken before schema changes; older ones are deleted. */
const BACKUPS_KEPT = 3;

/**
 * Bring the schema up to date with the schema migrations, never with `synchronize()`, which
 * rewrites tables and drops columns it no longer sees.
 *
 * - New database: every migration runs.
 * - Database created before schema migrations (its schema came from `synchronize()` on every
 *   start): backed up, then brought to the baseline (the first migration) and recorded at it;
 *   the later migrations then run like on any database. While the baseline is the only
 *   migration the entities are the baseline, so a last `synchronize()` gets it there. Once
 *   there are later migrations, the database must already match the baseline (it was converted
 *   by a release that had only the baseline, or was synchronized to the same entities);
 *   otherwise startup stops, since the schema it is at is unknown.
 * - Otherwise: backed up and the pending migrations run, if any.
 *
 * Afterwards any remaining difference between the entities and the schema is logged and stops
 * startup, without being applied: it means an entity changed without a migration.
 */
export async function upgradeSchema(dataSource: DataSource, dataDir: string): Promise<void> {
  const tables = await userTables(dataSource);
  await dataSource.showMigrations(); // creates the migrations table
  const applied = await appliedCount(dataSource);

  if (tables.length > 0 && applied === 0) {
    logger.warn('Database', 'Moving the schema from synchronize() to schema migrations');
    await backupDatabase(dataSource, dataDir, 'before-schema-migrations');
    const [baseline] = dataSource.migrations as MigrationInterface[];
    if (dataSource.migrations.length === 1) {
      await renameColumns(dataSource);
      await dataSource.synchronize();
    } else {
      // The baseline has the renamed columns, so rename before comparing; a database that is
      // then refused is rolled back to exactly what it was.
      await dataSource.query('BEGIN');
      try {
        await renameColumns(dataSource);
        await assertMatchesBaseline(dataSource, baseline);
        await dataSource.query('COMMIT');
      } catch (error) {
        await dataSource.query('ROLLBACK');
        throw error;
      }
    }
    await markApplied(dataSource, baseline);
  }
  if (await dataSource.showMigrations()) {
    if (tables.length > 0 && applied > 0) {
      await backupDatabase(dataSource, dataDir, 'before-schema-migration');
    }
    const ran = await dataSource.runMigrations({ transaction: 'each' });
    for (const migration of ran)
      logger.info('Database', `Applied schema migration ${migration.name}`);
  }

  const drift = await dataSource.driver.createSchemaBuilder().log();
  if (drift.upQueries.length > 0) {
    logger.error(
      'Database',
      `The schema differs from the entities and was left as it is; add a schema migration (bun run db:migration <Name>):\n${drift.upQueries.map(q => q.query).join(';\n')}`
    );
    // The code expects columns, indexes or constraints the database does not have.
    throw new Error('The database schema does not match this build; see the log above');
  }
}

async function userTables(dataSource: DataSource): Promise<string[]> {
  const rows = (await dataSource.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != ?`,
    [SCHEMA_MIGRATIONS_TABLE]
  )) as { name: string }[];
  return rows.map(row => row.name);
}

async function appliedCount(dataSource: DataSource): Promise<number> {
  const [row] = (await dataSource.query(
    `SELECT COUNT(*) AS count FROM "${SCHEMA_MIGRATIONS_TABLE}"`
  )) as { count: number }[];
  return Number(row?.count ?? 0);
}

async function markApplied(dataSource: DataSource, migration: MigrationInterface): Promise<void> {
  const name = migration.name ?? migration.constructor.name;
  // TypeORM reads the timestamp from the last 13 digits of the name.
  await dataSource.query(
    `INSERT INTO "${SCHEMA_MIGRATIONS_TABLE}" ("timestamp", "name") VALUES (?, ?)`,
    [Number(name.slice(-13)), name]
  );
}

/**
 * Columns, indexes, UNIQUE constraints and foreign keys of the given tables, in a form that
 * compares equal across databases (constraint indexes are named by SQLite in creation order,
 * so they are compared by their columns).
 */
async function schemaShape(dataSource: DataSource, tables: string[]): Promise<string> {
  const shape: Record<string, unknown> = {};
  for (const table of tables) {
    const columns = (await dataSource.query(`PRAGMA table_info("${table}")`)) as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];
    const indexes = (await dataSource.query(`PRAGMA index_list("${table}")`)) as {
      name: string;
      unique: number;
      origin: string;
    }[];
    const foreignKeys = (await dataSource.query(`PRAGMA foreign_key_list("${table}")`)) as {
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
    }[];
    const indexColumns = async (name: string) =>
      ((await dataSource.query(`PRAGMA index_info("${name}")`)) as { name: string }[]).map(
        column => column.name
      );
    shape[table] = {
      uniqueConstraints: (
        await Promise.all(
          indexes
            .filter(index => index.origin === 'u')
            .map(async index => (await indexColumns(index.name)).join(','))
        )
      ).sort(),
      foreignKeys: Object.values(
        foreignKeys.reduce<Record<number, string[]>>((byId, key) => {
          (byId[key.id] ??= [key.table, key.on_update, key.on_delete])[3 + key.seq] =
            `${key.from}->${key.to}`;
          return byId;
        }, {})
      )
        .map(key => key.join('|'))
        .sort(),
      columns: columns
        .map(c => [c.name, c.type.toLowerCase(), c.notnull, c.dflt_value, c.pk])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      indexes: await Promise.all(
        indexes
          .filter(index => index.origin === 'c') // created by CREATE INDEX, not implicit
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(async index => [
            index.name,
            index.unique,
            (
              (await dataSource.query(`PRAGMA index_info("${index.name}")`)) as { name: string }[]
            ).map(column => column.name),
          ])
      ),
    };
  }
  return JSON.stringify(shape);
}

/** Throws unless the database's tables and indexes are those the baseline migration creates. */
async function assertMatchesBaseline(
  dataSource: DataSource,
  baseline: MigrationInterface
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'miauflix-baseline-'));
  const reference = new DataSource({
    type: 'sqlite',
    database: path.join(dir, 'database.sqlite'),
    migrations: [baseline.constructor as new () => MigrationInterface],
    migrationsTableName: SCHEMA_MIGRATIONS_TABLE,
  });
  try {
    await reference.initialize();
    await reference.runMigrations();
    const tables = await userTables(reference);
    // Tables the entities no longer have are left alone, as synchronize() did.
    if ((await schemaShape(dataSource, tables)) !== (await schemaShape(reference, tables))) {
      const name = baseline.name ?? baseline.constructor.name;
      throw new Error(
        `This database predates schema migrations and does not match their baseline (${name}). ` +
          'Start a release whose only schema migration is the baseline once to convert it, ' +
          'then update. A backup was written to the backups folder.'
      );
    }
  } finally {
    if (reference.isInitialized) await reference.destroy();
    await rm(dir, { recursive: true, force: true });
  }
}

/** A consistent copy of the database (`VACUUM INTO`) in `<dataDir>/backups`. */
export async function backupDatabase(
  dataSource: DataSource,
  dataDir: string,
  reason: string
): Promise<string> {
  const dir = path.join(dataDir, 'backups');
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `database-${stamp}-${reason}.sqlite`);
  await dataSource.query('VACUUM INTO ?', [file]);
  logger.info('Database', `Backed up the database to ${file}`);

  const backups = (await readdir(dir)).filter(name => /^database-.*\.sqlite$/.test(name)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - BACKUPS_KEPT))) {
    await rm(path.join(dir, old), { force: true });
  }
  return file;
}
