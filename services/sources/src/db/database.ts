import { mkdirSync } from 'node:fs';

import { Database } from 'bun:sqlite';

import { MIAUFLIX_SOURCE_KEY, PROWLARR_SOURCE_KEY } from '../providers/cardigann/sources';
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
  // What a fresh install searches with: ID search first, then title search. All of it comes from
  // the default definition sources, so nothing site-specific ships with the service.
  const builtIn = (
    source: string,
    slug: string,
    definition: string,
    name: string,
    priority: number,
    enabled: boolean
  ) =>
    db
      .query(
        "INSERT OR IGNORE INTO providers (id,kind,repository_id,name,definition,enabled,priority) VALUES (?,'cardigann','builtin:miauflix',?,?,?,?)"
      )
      .run(
        `${slug}-${definition}`,
        name,
        JSON.stringify({ cardigann: definition, source }),
        enabled ? 1 : 0,
        priority
      );
  builtIn(MIAUFLIX_SOURCE_KEY, 'maury91', 'therarbg-imdb', 'TheRARBG (IMDb)', 10, true);
  builtIn(PROWLARR_SOURCE_KEY, 'prowlarr', 'yts', 'YTS', 20, true);
  builtIn(MIAUFLIX_SOURCE_KEY, 'maury91', 'eztv-api', 'EZTV (API)', 30, true);
  builtIn(MIAUFLIX_SOURCE_KEY, 'maury91', 'therarbg', 'TheRARBG', 40, true);
  builtIn(MIAUFLIX_SOURCE_KEY, 'maury91', 'torrentio', 'Torrentio', 35, true);
  // Anime only (its definition offers no movie or TV search), by AniDB episode id.
  builtIn(MIAUFLIX_SOURCE_KEY, 'maury91', 'animetosho', 'AnimeTosho', 45, true);
  builtIn(PROWLARR_SOURCE_KEY, 'prowlarr', 'nyaasi', 'Nyaa (Prowlarr)', 130, false);
  builtIn(PROWLARR_SOURCE_KEY, 'prowlarr', 'eztv', 'EZTV (Prowlarr)', 140, false);
  builtIn(PROWLARR_SOURCE_KEY, 'prowlarr', 'thepiratebay', 'The Pirate Bay (Prowlarr)', 150, false);
  return db;
}
