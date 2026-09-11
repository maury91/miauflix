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

describe('catalog Drizzle baseline migration', () => {
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
      1
    );
    first.close();

    const second = new CatalogDatabase(path);
    expect(
      second.db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`)
    ).toHaveLength(1);
    second.close();
  });
});
