import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, it } from 'bun:test';

import { openDatabase } from '../src/db/database';
import { migrations } from '../src/db/migrations';
import {
  DEFAULT_SOURCES,
  LEGACY_SOURCE_KEY,
  MIAUFLIX_SOURCE_KEY,
  parseSource,
  parseSources,
  PROWLARR_SOURCE_KEY,
} from '../src/providers/cardigann/sources';

it('understands GitHub folder URLs in their web and raw forms', () => {
  const jackett = parseSource(
    'https://github.com/Jackett/Jackett/tree/master/src/Jackett.Common/Definitions'
  )!;
  expect(jackett).toMatchObject({
    key: LEGACY_SOURCE_KEY,
    label: 'Jackett/Jackett',
    slug: 'jackett',
    kind: 'github',
    owner: 'Jackett',
    repo: 'Jackett',
    ref: 'master',
    path: 'src/Jackett.Common/Definitions',
    rawBase:
      'https://raw.githubusercontent.com/Jackett/Jackett/master/src/Jackett.Common/Definitions',
  });
  // The raw URL names the same folder, so it is the same source.
  expect(
    parseSource(
      'https://raw.githubusercontent.com/Jackett/Jackett/master/src/Jackett.Common/Definitions/'
    )?.key
  ).toBe(LEGACY_SOURCE_KEY);
  expect(
    parseSource(
      'https://raw.githubusercontent.com/Prowlarr/Indexers/refs/heads/master/definitions/v11'
    )
  ).toMatchObject({ key: 'Prowlarr/Indexers@master:definitions/v11', slug: 'prowlarr' });
  expect(
    parseSource('https://github.com/Prowlarr/Indexers/tree/master/definitions/v11/')?.path
  ).toBe('definitions/v11');
});

it('accepts any other http(s) folder that serves an index.json', () => {
  expect(parseSource('https://defs.example.org/jackett/?x=1#top')).toMatchObject({
    key: 'https://defs.example.org/jackett',
    kind: 'index',
    label: 'defs.example.org',
    slug: 'defs-example-org',
    rawBase: 'https://defs.example.org/jackett',
  });
});

it('rejects what cannot be a definitions folder', () => {
  for (const value of [
    '',
    'not a url',
    'ftp://example.org/defs',
    'file:///etc',
    'https://user:pass@example.org/defs',
    'https://github.com/Jackett/Jackett',
    'https://github.com/Jackett/Jackett/tree/master',
    'https://github.com/Jackett/Jackett/blob/master/x.yml',
    'https://raw.githubusercontent.com/Jackett/Jackett/master',
    'https://github.com/a/b/tree/master/../etc',
    'https://github.com/a b/c/tree/master/x',
  ])
    expect(parseSource(value)).toBeNull();
});

it('parses a configured list, ignoring duplicates and reporting what it could not use', () => {
  const { sources, invalid } = parseSources(
    `${DEFAULT_SOURCES}, https://raw.githubusercontent.com/Prowlarr/Indexers/master/definitions/v11;nonsense\n https://github.com/Jackett/Jackett/tree/master/src/Jackett.Common/Definitions`
  );
  expect(sources.map(source => source.key)).toEqual([
    'Prowlarr/Indexers@master:definitions/v11',
    'maury91/miauflix-indexers@main:definitions',
    'Jackett/Jackett@master:src/Jackett.Common/Definitions',
  ]);
  expect(invalid).toEqual(['nonsense']);
  expect(parseSources('')).toEqual({ sources: [], invalid: [] });
});

it('keeps cached definitions and the catalog when migrating to configurable sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-migrate-'));
  try {
    // A database as the previous release left it: one source, no source column.
    const old = new Database(join(dir, 'sources.sqlite'));
    for (const migration of migrations.slice(0, 4)) old.run(migration);
    old.run('PRAGMA user_version = 4');
    old
      .query(
        "INSERT INTO cardigann_definitions (id,yaml,sha,fetched_at) VALUES ('nyaasi','yaml: 1','sha1',5)"
      )
      .run();
    old
      .query(
        "INSERT INTO cardigann_index (id,sha,name,type,supported,imdb,status) VALUES ('nyaasi','sha1','Nyaa','public',1,0,'ready')"
      )
      .run();
    old.query("INSERT INTO cardigann_sync (key,value) VALUES ('tree_sha','abc')").run();
    old.close();

    const db = openDatabase(dir);
    expect(db.query('SELECT source, id, yaml FROM cardigann_definitions').all()).toEqual([
      { source: LEGACY_SOURCE_KEY, id: 'nyaasi', yaml: 'yaml: 1' },
    ]);
    expect(db.query('SELECT source, id, name, status FROM cardigann_index').all()).toEqual([
      { source: LEGACY_SOURCE_KEY, id: 'nyaasi', name: 'Nyaa', status: 'ready' },
    ]);
    // Sync bookkeeping is per source from now on, so the old marker is dropped.
    expect(db.query('SELECT COUNT(*) AS n FROM cardigann_sync').get()).toEqual({ n: 0 });
    // The built-in indexers come from Prowlarr's definitions.
    expect(db.query("SELECT definition FROM providers WHERE id='prowlarr-nyaasi'").get()).toEqual({
      definition: JSON.stringify({ cardigann: 'nyaasi', source: PROWLARR_SOURCE_KEY }),
    });
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('defaults to Prowlarr plus the Miauflix folder, with none of the blocked trackers listed here', () => {
  expect(parseSources(DEFAULT_SOURCES).sources.map(source => source.key)).toEqual([
    PROWLARR_SOURCE_KEY,
    MIAUFLIX_SOURCE_KEY,
  ]);
});

it('drops the untouched Jackett built-ins left by earlier versions, and keeps ones in use', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-seeds-'));
  try {
    const old = new Database(join(dir, 'sources.sqlite'));
    for (const migration of migrations.slice(0, 5)) old.run(migration);
    old.run('PRAGMA user_version = 5');
    const insert = old.query(
      "INSERT INTO providers (id,kind,repository_id,name,definition,enabled,priority) VALUES (?,'cardigann','builtin:miauflix',?,?,?,100)"
    );
    insert.run('jackett-therarbg', 'TheRARBG (Jackett)', '{"cardigann":"therarbg"}', 0);
    insert.run('jackett-nyaasi', 'Nyaa (Jackett)', '{"cardigann":"nyaasi"}', 1);
    old.close();
    const db = openDatabase(dir);
    expect(
      db.query("SELECT id FROM providers WHERE id LIKE 'jackett-%' ORDER BY id").all()
    ).toEqual([{ id: 'jackett-nyaasi' }]);
    expect(
      db
        .query(
          "SELECT id FROM providers WHERE kind='cardigann' AND id NOT LIKE 'jackett-%' ORDER BY priority"
        )
        .all()
    ).toEqual(
      [
        'maury91-therarbg-imdb',
        'prowlarr-yts',
        'maury91-eztv-api',
        'maury91-torrentio',
        'maury91-therarbg',
        'maury91-animetosho',
        'prowlarr-nyaasi',
        'prowlarr-eztv',
        'prowlarr-thepiratebay',
      ].map(id => ({ id }))
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('removes the site-specific providers earlier versions shipped, with what was recorded for them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-native-'));
  try {
    const old = new Database(join(dir, 'sources.sqlite'));
    for (const migration of migrations.slice(0, 6)) old.run(migration);
    old.run('PRAGMA user_version = 6');
    old
      .query(
        "INSERT INTO providers (id,kind,repository_id,name,definition,enabled,priority) VALUES ('yts','native','builtin:miauflix','YTS','{\"native\":\"yts\"}',1,20)"
      )
      .run();
    old.query("INSERT INTO provider_usage VALUES ('yts','2026-11-01',5)").run();
    old.query("INSERT INTO search_memory VALUES ('movie:1','yts',1,1)").run();
    old.query("INSERT INTO query_cache VALUES ('yts','k','p',9)").run();
    old.close();
    const db = openDatabase(dir);
    expect(db.query("SELECT COUNT(*) AS n FROM providers WHERE kind='native'").get()).toEqual({
      n: 0,
    });
    for (const table of ['provider_usage', 'search_memory', 'query_cache'])
      expect(db.query(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
