import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { CatalogDatabase } from '../src/db/database';

const directories: string[] = [];
const directory = () => {
  const value = mkdtempSync(join(tmpdir(), 'catalog-migration-'));
  directories.push(value);
  return value;
};

afterEach(() =>
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }))
);

describe('catalog Drizzle migrations', () => {
  it('exposes Drizzle as the only database interface', () => {
    const path = directory();
    const db = new CatalogDatabase(path);

    expect('sql' in db).toBe(false);
    expect(db.db).toBeDefined();
    db.close();
  });

  it('creates and journals a fresh catalog schema exactly once', () => {
    const path = directory();
    const first = new CatalogDatabase(path);
    expect(
      first.db.get<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE name = 'episodes'`)
    ).toBeDefined();
    expect(first.db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`)).toHaveLength(
      2
    );
    first.close();

    const second = new CatalogDatabase(path);
    expect(
      second.db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`)
    ).toHaveLength(2);
    second.close();
  });

  it('applies the cache-retention migration to an existing catalog database', () => {
    const path = directory();
    const original = new CatalogDatabase(path);
    original.db.run(
      sql`INSERT INTO api_cache (key, value, expires_at, stale_until) VALUES ('cached', '{}', 42, 42)`
    );
    original.db.run(sql`DROP INDEX api_cache_stale`);
    original.db.run(sql`ALTER TABLE api_cache DROP COLUMN stale_until`);
    original.db.run(
      sql`DELETE FROM __drizzle_migrations WHERE created_at = (SELECT MAX(created_at) FROM __drizzle_migrations)`
    );
    original.close();

    const upgraded = new CatalogDatabase(path);
    const cache = upgraded.db.get<[number]>(
      sql`SELECT stale_until FROM api_cache WHERE key = 'cached'`
    );
    expect(cache?.[0]).toBe(42);
    expect(
      upgraded.db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`)
    ).toHaveLength(2);
    upgraded.close();
  });
});
