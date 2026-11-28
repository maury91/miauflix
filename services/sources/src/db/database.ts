import { mkdirSync } from 'node:fs';

import { Database } from 'bun:sqlite';

import { migrations } from './migrations';

export function openDatabase(dataDir: string): Database {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(`${dataDir}/sources.sqlite`);
  db.run('PRAGMA journal_mode = WAL');
  const version = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version > migrations.length) throw new Error('Sources database is newer than this service');
  for (let i = version; i < migrations.length; i++)
    db.transaction(() => {
      db.run(migrations[i]);
      db.run(`PRAGMA user_version = ${i + 1}`);
    })();
  // A fresh install has no providers: the admin adds the ones they choose (onboarding or
  // Settings → Sources). Rows earlier installs created stay as they are.
  return db;
}
