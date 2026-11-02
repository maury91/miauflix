/** Append migrations; an applied migration is immutable. */
export const migrations = [
  `CREATE TABLE providers (id TEXT PRIMARY KEY, kind TEXT NOT NULL, repository_id TEXT, name TEXT NOT NULL, version TEXT, definition TEXT NOT NULL, enabled INTEGER NOT NULL, priority INTEGER NOT NULL, settings TEXT, failures INTEGER NOT NULL DEFAULT 0, cooldown_until INTEGER, last_error TEXT, last_success_at INTEGER, last_used_at INTEGER);
   CREATE TABLE provider_usage (provider_id TEXT NOT NULL, day TEXT NOT NULL, requests INTEGER NOT NULL, PRIMARY KEY(provider_id, day));
   CREATE TABLE query_cache (provider_id TEXT NOT NULL, query_key TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(provider_id, query_key));
   CREATE TABLE search_memory (media_key TEXT NOT NULL, provider_id TEXT NOT NULL, searched_at INTEGER NOT NULL, result_count INTEGER NOT NULL, PRIMARY KEY(media_key,provider_id));`,
  `CREATE TABLE repositories (id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, name TEXT, built_in INTEGER NOT NULL, etag TEXT, last_fetched_at INTEGER, last_error TEXT);
   INSERT INTO repositories (id,url,name,built_in) VALUES ('builtin:miauflix','builtin:miauflix','Miauflix',1);
   UPDATE providers SET repository_id='builtin:miauflix' WHERE kind='native' AND repository_id IS NULL;`,
];
