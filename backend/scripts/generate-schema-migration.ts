/**
 * Writes a schema migration with the SQL that takes a database from the current migrations to
 * the current entities, and adds it to src/database/schema-migrations/index.ts.
 *
 *   bun run db:migration AddWatchedAt
 *
 * Review the SQL before committing: on SQLite, changing a column rebuilds its table, and a
 * renamed column shows up as dropped and added (losing its data) — write those by hand.
 */
import 'reflect-metadata';

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';

import { ENTITIES } from '@database/entities';
import { schemaMigrations } from '@database/schema-migrations';

const name = process.argv[2];
if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) {
  console.error('Usage: bun run db:migration <PascalCaseName>');
  process.exit(1);
}

const dir = await mkdtemp(path.join(os.tmpdir(), 'miauflix-schema-'));
const dataSource = new DataSource({
  type: 'sqlite',
  database: path.join(dir, 'database.sqlite'),
  entities: ENTITIES,
  migrations: schemaMigrations,
  migrationsTableName: 'schema_migrations',
});
try {
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  const sql = await dataSource.driver.createSchemaBuilder().log();
  if (sql.upQueries.length === 0) {
    console.log('The migrations already match the entities; nothing to generate.');
    process.exit(0);
  }

  const className = `${name}${Date.now()}`;
  const quote = (query: string) =>
    '`' + query.replace(/[`\\]/g, m => '\\' + m).replace(/\$\{/g, '\\${') + '`';
  const lines = (queries: { query: string; parameters?: unknown[] }[]) =>
    queries
      .map(
        ({ query, parameters }) =>
          `    await queryRunner.query(${quote(query)}${parameters?.length ? `, ${JSON.stringify(parameters)}` : ''});`
      )
      .join('\n');

  const file = path.resolve(import.meta.dir, `../src/database/schema-migrations/${className}.ts`);
  await writeFile(
    file,
    `import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(queryRunner: QueryRunner): Promise<void> {
${lines(sql.upQueries)}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
${lines([...sql.downQueries].reverse())}
  }
}
`
  );

  const index = path.resolve(import.meta.dir, '../src/database/schema-migrations/index.ts');
  let source = await readFile(index, 'utf8');
  source = `import { ${className} } from './${className}';\n${source}`;
  source = source.replace(
    /export const schemaMigrations: SchemaMigration\[\] = \[([\s\S]*?)\];/,
    (_, items: string) =>
      `export const schemaMigrations: SchemaMigration[] = [${items.trimEnd() ? `${items.trimEnd().replace(/,?$/, ',')}\n  ${className},\n` : `\n  ${className},\n`}];`
  );
  await writeFile(index, source);
  Bun.spawnSync(['bunx', 'prettier', '--write', file, index]);
  Bun.spawnSync(['bunx', 'eslint', '--fix', file, index]);
  console.log(`Wrote ${path.relative(process.cwd(), file)} (${sql.upQueries.length} statements)`);
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
  await rm(dir, { recursive: true, force: true });
}
