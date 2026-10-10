import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { CatalogDatabase } from '../src/db/database';
import migrationJournal from '../src/db/migrations/meta/_journal.json';

const migrationCount = migrationJournal.entries.length;

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
    expect(
      first.db.get<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE name = 'artwork_logo_assets'`
      )
    ).toBeDefined();
    expect(first.db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`)).toHaveLength(
      migrationCount
    );
    first.close();

    const second = new CatalogDatabase(path);
    expect(
      second.db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`)
    ).toHaveLength(migrationCount);
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
    original.db.run(sql`DROP TABLE backdrop_focus`);
    original.db.run(sql`ALTER TABLE tv_shows DROP COLUMN logo`);
    original.db.run(sql`DROP TABLE artwork_logo_cache`);
    original.db.run(sql`DROP TABLE artwork_logo_assets`);
    original.db.run(sql`DROP TABLE artwork_backdrop_cache`);
    original.db.run(sql`DROP TABLE media_artwork`);
    original.db.run(sql`ALTER TABLE movies DROP COLUMN logo_candidates`);
    original.db.run(sql`ALTER TABLE tv_shows DROP COLUMN logo_candidates`);
    original.db.run(sql`
      DELETE FROM __drizzle_migrations
      WHERE created_at > (SELECT MIN(created_at) FROM __drizzle_migrations)
    `);
    original.close();

    const upgraded = new CatalogDatabase(path);
    const cache = upgraded.db.get<[number]>(
      sql`SELECT stale_until FROM api_cache WHERE key = 'cached'`
    );
    expect(cache?.[0]).toBe(42);
    expect(
      upgraded.db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`)
    ).toHaveLength(migrationCount);
    upgraded.close();
  });

  it('adds TV logos without losing shows, watching state or episodes, and can reopen safely', () => {
    const path = directory();
    const original = new CatalogDatabase(path);
    original.db.run(
      sql`INSERT INTO tv_shows (media_id, name, watching, details_synced_at, created_at, updated_at) VALUES (100, 'Arcane', 1, 42, 1, 1)`
    );
    original.db.run(
      sql`INSERT INTO seasons (media_id, tv_media_id, season_number, created_at, updated_at) VALUES (1000, 100, 2, 1, 1)`
    );
    original.db.run(
      sql`INSERT INTO episodes (media_id, season_media_id, episode_number, name, created_at, updated_at) VALUES (10000, 1000, 6, 'Episode 6', 1, 1)`
    );
    original.db.run(sql`ALTER TABLE tv_shows DROP COLUMN logo`);
    original.db.run(sql`DROP TABLE artwork_logo_cache`);
    original.db.run(sql`DROP TABLE artwork_logo_assets`);
    original.db.run(sql`DROP TABLE artwork_backdrop_cache`);
    original.db.run(sql`DROP TABLE media_artwork`);
    original.db.run(sql`ALTER TABLE movies DROP COLUMN logo_candidates`);
    original.db.run(sql`ALTER TABLE tv_shows DROP COLUMN logo_candidates`);
    original.db.run(sql`DELETE FROM __drizzle_migrations WHERE created_at >= 1791481200000`);
    original.close();

    const upgraded = new CatalogDatabase(path);
    expect(
      upgraded.db.get<[string, number, number, string | null]>(
        sql`SELECT name, watching, details_synced_at, logo FROM tv_shows WHERE media_id = 100`
      )
    ).toEqual(['Arcane', 1, 42, null]);
    expect(
      upgraded.db.get<[string]>(sql`SELECT name FROM episodes WHERE media_id = 10000`)
    ).toEqual(['Episode 6']);
    upgraded.close();

    const reopened = new CatalogDatabase(path);
    expect(reopened.db.all(sql`SELECT hash FROM __drizzle_migrations`)).toHaveLength(
      migrationCount
    );
    reopened.close();
  });
});
