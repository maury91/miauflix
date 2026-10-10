import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { ArtworkRepository } from '../src/db/artwork.repo';
import { CatalogDatabase } from '../src/db/database';

it('upgrades an applied legacy artwork migration without losing selected logos or catalog data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'artwork-migration-'));
  let catalog: CatalogDatabase | undefined;
  try {
    // Build the actual old schema and migration ledger, as an existing installation would have it.
    const client = new Database(join(directory, 'catalog.db'));
    client.run(
      'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)'
    );
    const folder = join(import.meta.dir, '../src/db/migrations');
    const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'));
    for (const entry of journal.entries.filter((item: { idx: number }) => item.idx <= 4)) {
      const sql = readFileSync(join(folder, `${entry.tag}.sql`), 'utf8');
      for (const statement of sql.split('--> statement-breakpoint')) client.run(statement);
      client
        .query('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run('legacy', entry.when);
    }
    client.run(
      "INSERT INTO movies (media_id, title, created_at, updated_at) VALUES (42, 'Existing movie', 1, 1)"
    );
    client.run(`INSERT INTO media_artwork
      (media_type, media_id, input_signature, candidates, card_logo, hero_logo,
       card_complete, hero_complete, card_status, hero_status, queued_at, updated_at)
      VALUES ('movie', 42, 'old-signature', '[]', 'card.png', 'hero.png', 1, 1, 'ready', 'ready', 1, 1)`);
    client.run("INSERT INTO artwork_backdrop_cache VALUES ('backdrop', 'v1', 'pixels', 12, 1)");
    client.close();

    catalog = new CatalogDatabase(directory);
    const repository = new ArtworkRepository(catalog);
    expect(repository.get('movie', 42)).toMatchObject({
      cardLogo: 'card.png',
      heroLogo: 'hero.png',
      status: 'ready',
      inputSignature: 'legacy:old-signature',
      measurements: '[]',
      cursor: 0,
    });
    expect(repository.nextPending()).toBeUndefined();
    expect(catalog.db.get<[string]>(sql`SELECT title FROM movies WHERE media_id = 42`)).toEqual([
      'Existing movie',
    ]);
    expect(
      catalog.db.get<[string, string]>(sql`SELECT pixels, luminance FROM artwork_backdrop_cache`)
    ).toEqual(['pixels', '']);
    expect(repository.getLogoAsset('unused')).toBeUndefined();
    catalog.close();
    catalog = new CatalogDatabase(directory);
    expect(new ArtworkRepository(catalog).get('movie', 42)?.inputSignature).toBe(
      'legacy:old-signature'
    );
  } finally {
    catalog?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
