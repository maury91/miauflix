/** Append migrations; an applied migration is immutable. */
export const migrations = [
  `CREATE TABLE providers (id TEXT PRIMARY KEY, kind TEXT NOT NULL, repository_id TEXT, name TEXT NOT NULL, version TEXT, definition TEXT NOT NULL, enabled INTEGER NOT NULL, priority INTEGER NOT NULL, settings TEXT, failures INTEGER NOT NULL DEFAULT 0, cooldown_until INTEGER, last_error TEXT, last_success_at INTEGER, last_used_at INTEGER);
   CREATE TABLE provider_usage (provider_id TEXT NOT NULL, day TEXT NOT NULL, requests INTEGER NOT NULL, PRIMARY KEY(provider_id, day));
   CREATE TABLE query_cache (provider_id TEXT NOT NULL, query_key TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(provider_id, query_key));
   CREATE TABLE search_memory (media_key TEXT NOT NULL, provider_id TEXT NOT NULL, searched_at INTEGER NOT NULL, result_count INTEGER NOT NULL, PRIMARY KEY(media_key,provider_id));`,
  `CREATE TABLE repositories (id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, name TEXT, built_in INTEGER NOT NULL, etag TEXT, last_fetched_at INTEGER, last_error TEXT);
   INSERT INTO repositories (id,url,name,built_in) VALUES ('builtin:miauflix','builtin:miauflix','Miauflix',1);
   UPDATE providers SET repository_id='builtin:miauflix' WHERE kind='native' AND repository_id IS NULL;`,
  `CREATE TABLE cardigann_definitions (id TEXT PRIMARY KEY, yaml TEXT NOT NULL, sha TEXT, fetched_at INTEGER NOT NULL);`,
  `CREATE TABLE cardigann_index (id TEXT PRIMARY KEY, sha TEXT, name TEXT, language TEXT, type TEXT, supported INTEGER NOT NULL DEFAULT 0, reason TEXT, imdb INTEGER NOT NULL DEFAULT 0, tmdb INTEGER NOT NULL DEFAULT 0, tvdb INTEGER NOT NULL DEFAULT 0, movies INTEGER NOT NULL DEFAULT 0, tv INTEGER NOT NULL DEFAULT 0, anime INTEGER NOT NULL DEFAULT 0, flaresolverr INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', checked_at INTEGER);
   CREATE INDEX cardigann_index_filters ON cardigann_index (type, supported, imdb);
   CREATE TABLE cardigann_sync (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // Definitions can now come from several sources; everything cached so far came from Jackett.
  `CREATE TABLE cardigann_definitions_v2 (source TEXT NOT NULL, id TEXT NOT NULL, yaml TEXT NOT NULL, sha TEXT, fetched_at INTEGER NOT NULL, PRIMARY KEY (source, id));
   INSERT INTO cardigann_definitions_v2 SELECT 'Jackett/Jackett@master:src/Jackett.Common/Definitions', id, yaml, sha, fetched_at FROM cardigann_definitions;
   DROP TABLE cardigann_definitions;
   ALTER TABLE cardigann_definitions_v2 RENAME TO cardigann_definitions;
   CREATE TABLE cardigann_index_v2 (source TEXT NOT NULL, id TEXT NOT NULL, sha TEXT, name TEXT, language TEXT, type TEXT, supported INTEGER NOT NULL DEFAULT 0, reason TEXT, imdb INTEGER NOT NULL DEFAULT 0, tmdb INTEGER NOT NULL DEFAULT 0, tvdb INTEGER NOT NULL DEFAULT 0, movies INTEGER NOT NULL DEFAULT 0, tv INTEGER NOT NULL DEFAULT 0, anime INTEGER NOT NULL DEFAULT 0, flaresolverr INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', checked_at INTEGER, PRIMARY KEY (source, id));
   INSERT INTO cardigann_index_v2 SELECT 'Jackett/Jackett@master:src/Jackett.Common/Definitions', id, sha, name, language, type, supported, reason, imdb, tmdb, tvdb, movies, tv, anime, flaresolverr, status, checked_at FROM cardigann_index;
   DROP INDEX cardigann_index_filters;
   DROP TABLE cardigann_index;
   ALTER TABLE cardigann_index_v2 RENAME TO cardigann_index;
   CREATE INDEX cardigann_index_filters ON cardigann_index (type, supported, imdb);
   DELETE FROM cardigann_sync;`,
  // The default Jackett entries were replaced by Prowlarr's; drop the ones nobody touched.
  `DELETE FROM providers WHERE id IN ('jackett-therarbg','jackett-torrentgalaxyclone','jackett-nyaasi','jackett-eztv','jackett-thepiratebay') AND enabled=0 AND settings IS NULL AND definition NOT LIKE '%"source"%';`,
  // Built-in providers are now definitions fetched from the definition sources: drop the
  // site-specific ones earlier versions shipped and what was recorded for them.
  `DELETE FROM provider_usage WHERE provider_id IN (SELECT id FROM providers WHERE kind='native');
   DELETE FROM query_cache WHERE provider_id IN (SELECT id FROM providers WHERE kind='native');
   DELETE FROM search_memory WHERE provider_id IN (SELECT id FROM providers WHERE kind='native');
   DELETE FROM providers WHERE kind='native';`,
];
