jest.mock('@logger');

import 'reflect-metadata';

import { existsSync, readdirSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';

import { ENTITIES } from './entities';
import type { SchemaMigration } from './schema-migrations';
import { schemaMigrations } from './schema-migrations';
import { SCHEMA_MIGRATIONS_TABLE, upgradeSchema } from './schema-upgrade';

class AddProbe9999999999999 implements MigrationInterface {
  name = 'AddProbe9999999999999';
  async up(queryRunner: QueryRunner) {
    await queryRunner.query('CREATE TABLE "probe" ("id" integer PRIMARY KEY)');
  }
  async down(queryRunner: QueryRunner) {
    await queryRunner.query('DROP TABLE "probe"');
  }
}

describe('upgradeSchema', () => {
  let dir: string;
  const sources: DataSource[] = [];

  const open = async (migrations: SchemaMigration[] = schemaMigrations) => {
    const dataSource = new DataSource({
      type: 'sqlite',
      database: path.join(dir, 'database.sqlite'),
      entities: ENTITIES,
      migrations,
      migrationsTableName: SCHEMA_MIGRATIONS_TABLE,
    });
    await dataSource.initialize();
    sources.push(dataSource);
    return dataSource;
  };
  const applied = async (dataSource: DataSource) =>
    (
      (await dataSource.query(`SELECT name FROM ${SCHEMA_MIGRATIONS_TABLE}`)) as { name: string }[]
    ).map(row => row.name);
  const backups = () =>
    existsSync(path.join(dir, 'backups')) ? readdirSync(path.join(dir, 'backups')) : [];
  const drift = async (dataSource: DataSource) =>
    (await dataSource.driver.createSchemaBuilder().log()).upQueries;

  /**
   * A database from before schema migrations: built by synchronize(), with the tables of entities
   * removed since the baseline (synchronize() never dropped them), which the baseline still has,
   * and without the tables later migrations add (their entities did not exist yet).
   */
  const legacyDatabase = async () => {
    const legacy = await open([]);
    await legacy.synchronize();
    const baseline = new DataSource({
      type: 'sqlite',
      database: path.join(dir, 'baseline.sqlite'),
      migrations: [schemaMigrations[0]],
      migrationsTableName: SCHEMA_MIGRATIONS_TABLE,
    });
    await baseline.initialize();
    sources.push(baseline);
    await baseline.runMigrations();
    const tables = `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '${SCHEMA_MIGRATIONS_TABLE}'`;
    const present = new Set(
      ((await legacy.query(tables)) as { name: string }[]).map(table => table.name)
    );
    const inBaseline = (await baseline.query(tables)) as { name: string; sql: string }[];
    for (const table of inBaseline) {
      if (!present.has(table.name)) await legacy.query(table.sql);
    }
    const baselineNames = new Set(inBaseline.map(table => table.name));
    for (const name of present) {
      if (!baselineNames.has(name)) await legacy.query(`DROP TABLE "${name}"`);
    }
    return legacy;
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'miauflix-schema-test-'));
  });

  afterEach(async () => {
    for (const dataSource of sources.splice(0)) {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('creates a new database from the migrations, which match the entities', async () => {
    const dataSource = await open();
    await upgradeSchema(dataSource, dir);

    expect(await applied(dataSource)).toEqual(schemaMigrations.map(m => m.name));
    // Fails when an entity changed without a migration: run `bun run db:migration <Name>`.
    expect(await drift(dataSource)).toEqual([]);
    expect(backups()).toEqual([]);
  });

  it('moves a database built by synchronize() to migrations, keeping its data', async () => {
    const legacy = await legacyDatabase();
    await legacy.query(`INSERT INTO migration_version (id, version) VALUES (1, 6)`);
    await legacy.destroy();

    const dataSource = await open();
    await upgradeSchema(dataSource, dir);

    expect(await applied(dataSource)).toEqual(schemaMigrations.map(m => m.name));
    expect(await dataSource.query('SELECT version FROM migration_version')).toEqual([
      { version: 6 },
    ]);
    expect(await drift(dataSource)).toEqual([]);
    expect(backups()).toEqual([expect.stringMatching(/before-schema-migrations\.sqlite$/)]);
  });

  it('records a matching legacy database at the baseline and runs the later migrations', async () => {
    const legacy = await legacyDatabase();
    await legacy.destroy();

    const dataSource = await open([...schemaMigrations, AddProbe9999999999999]);
    await upgradeSchema(dataSource, dir);

    expect(await applied(dataSource)).toEqual([
      ...schemaMigrations.map(m => m.name),
      'AddProbe9999999999999',
    ]);
    // Executed, not just recorded.
    expect(
      await dataSource.query('SELECT name FROM sqlite_master WHERE name = ?', ['probe'])
    ).toHaveLength(1);
    expect(backups()).toEqual([expect.stringMatching(/before-schema-migrations\.sqlite$/)]);
  });

  it('refuses a legacy database that does not match the baseline once later migrations exist', async () => {
    const legacy = await open([]);
    await legacy.synchronize();
    await legacy.query('ALTER TABLE "users" ADD COLUMN "legacy" varchar');
    await legacy.destroy();

    const dataSource = await open([...schemaMigrations, AddProbe9999999999999]);
    await expect(upgradeSchema(dataSource, dir)).rejects.toThrow(/does not match their baseline/);
    expect(await applied(dataSource)).toEqual([]);
    expect(backups()).toHaveLength(1);
  });

  /** Rebuilds `table` from its own DDL with `edit` applied, keeping its rows and indexes. */
  const rebuild = async (dataSource: DataSource, table: string, edit: (sql: string) => string) => {
    const [{ sql }] = (await dataSource.query(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [table]
    )) as { sql: string }[];
    const indexes = (await dataSource.query(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
      [table]
    )) as { sql: string }[];
    const edited = edit(sql);
    expect(edited).not.toBe(sql);
    await dataSource.query('PRAGMA foreign_keys = OFF');
    await dataSource.query(
      edited.replace(`CREATE TABLE "${table}"`, `CREATE TABLE "${table}_new"`)
    );
    await dataSource.query(`INSERT INTO "${table}_new" SELECT * FROM "${table}"`);
    await dataSource.query(`DROP TABLE "${table}"`);
    await dataSource.query(`ALTER TABLE "${table}_new" RENAME TO "${table}"`);
    for (const index of indexes) await dataSource.query(index.sql);
  };

  const tableWith = async (dataSource: DataSource, pattern: string) => {
    const [row] = (await dataSource.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE ? LIMIT 1`,
      [pattern]
    )) as { name: string }[];
    return row.name;
  };

  it.each([
    ['a UNIQUE constraint', '%CONSTRAINT "UQ_%', /, CONSTRAINT "UQ_\w+" UNIQUE \([^)]*\)/],
    [
      'a foreign key',
      '%FOREIGN KEY%',
      /, CONSTRAINT "FK_\w+" FOREIGN KEY \([^)]*\) REFERENCES "\w+" \([^)]*\)( ON (DELETE|UPDATE) [A-Z ]+?(?= ON|,|\)$))*/,
    ],
  ])('refuses a legacy database missing %s of the baseline', async (_, pattern, constraint) => {
    const legacy = await open([]);
    await legacy.synchronize();
    await rebuild(legacy, await tableWith(legacy, pattern), sql => sql.replace(constraint, ''));
    await legacy.destroy();

    const dataSource = await open([...schemaMigrations, AddProbe9999999999999]);
    await expect(upgradeSchema(dataSource, dir)).rejects.toThrow(/does not match their baseline/);
  });

  it('leaves a refused legacy database as it was, renamed columns included', async () => {
    const legacy = await open([]);
    await legacy.synchronize();
    await legacy.query('ALTER TABLE "media_probe" RENAME COLUMN "k" TO "filePath"');
    await legacy.query('ALTER TABLE "users" ADD COLUMN "legacy" varchar');
    await legacy.destroy();

    const dataSource = await open([...schemaMigrations, AddProbe9999999999999]);
    await expect(upgradeSchema(dataSource, dir)).rejects.toThrow(/does not match their baseline/);
    const columns = (await dataSource.query('PRAGMA table_info("media_probe")')) as {
      name: string;
    }[];
    expect(columns.map(column => column.name)).toContain('filePath');
  });

  it('stops when the schema still differs from the entities', async () => {
    const first = await open();
    await upgradeSchema(first, dir);
    await first.query('DROP INDEX "IDX_audit_logs_createdAt"');
    await first.destroy();

    const dataSource = await open();
    await expect(upgradeSchema(dataSource, dir)).rejects.toThrow(/does not match this build/);
  });

  it('backs up, then runs only the pending migrations', async () => {
    const first = await open();
    await upgradeSchema(first, dir);
    await first.destroy();

    const dataSource = await open([...schemaMigrations, AddProbe9999999999999]);
    await upgradeSchema(dataSource, dir);

    expect(await applied(dataSource)).toEqual([
      ...schemaMigrations.map(m => m.name),
      'AddProbe9999999999999',
    ]);
    expect(
      await dataSource.query('SELECT name FROM sqlite_master WHERE name = ?', ['probe'])
    ).toHaveLength(1);
    expect(backups()).toEqual([expect.stringMatching(/before-schema-migration\.sqlite$/)]);

    // Nothing pending: no new backup.
    await upgradeSchema(dataSource, dir);
    expect(backups()).toHaveLength(1);
  });
});
