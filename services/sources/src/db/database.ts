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
  for (const [id, name, priority] of [
    ['therarbg', 'TheRARBG', 10],
    ['yts', 'YTS', 20],
    ['eztv', 'EZTV', 30],
  ] as const) {
    db.query(
      "INSERT OR IGNORE INTO providers (id,kind,repository_id,name,definition,enabled,priority) VALUES (?,'native','builtin:miauflix',?,?,1,?)"
    ).run(id, name, JSON.stringify({ native: id }), priority);
  }
  return db;
}
