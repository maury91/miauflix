# Sources service

Bun service implementing the `sources` 1.3 contract on port 3003. It owns source website access; the backend owns persisted candidates, peer metadata, verification, tracker stats, playback and notifications.

Indexers run through supported Cardigann definitions fetched at runtime or through external Torznab endpoints (see below); the service contains no code for any particular site. A search tries indexers that search by IMDb id first, then falls back to episode-title and paginated season-pack queries, which find older seasons omitted from newest-first results. Candidates are validated and deduplicated by info hash.

Search planning applies provider priority, interactive hedging, background budget sharing, persistent result caching and cooldowns after three failures. Background work reserves 20% of daily request budgets for interactive use. Source website requests pass through the bounded HTTP client, including VPN checks, mirrors, metadata caches and FlareSolverr. Definition synchronization can use git, as described below.

From the repository root:

```sh
npm install
npm run build:libs
npm run start:sources
npm test --workspace @miauflix/sources-service
```

Bootstrap environment: `SOURCES_PORT` (3003), `SOURCES_HOST` (0.0.0.0), `SOURCES_DATA_DIR` (or `DATA_DIR`, otherwise ./data), `SOURCES_KEY_FILE` (defaults inside the data directory), and optional `SOURCES_ENCRYPTION_KEY`. Retain the data directory and key across restarts; replacing the key prevents decrypting existing settings/cache/references.

The backend discovers and pushes the Sources configuration schema. Configure VPN checking, request timeout, hedge delay, minimum seeders, daily budget, the definition sources and the sync interval there. Existing `FLARESOLVERR_URL` stored values keep working. `SOURCES_PRELOAD_PROVIDERS` (a service environment variable, `<definition id>@<source URL>` entries separated by spaces or commas) installs and enables providers at startup, once, so a container can come up searching without anyone using the UI.

SQLite runs in WAL mode. Ordered `PRAGMA user_version` migrations preserve existing data. Provider settings and cached search payloads are encrypted. The default providers (TheRARBG by IMDb and by title, YTS, EZTV and Torrentio by IMDb, all from the default definition sources, plus a few more switched off) are inserted only when absent.

Tests inject an offline fetch implementation; unexpected URLs fail. Provider behavior is tested with small synthetic definitions installed straight into the database (`tests/providers.ts`) and the hand-written ones in `tests/fixtures/cardigann`. The backend E2E suite serves fictional release data and its own test definitions from an indexer mock (`backend-e2e/docker/indexer`), loading them through `CARDIGANN_DEFINITION_SOURCES` and `SOURCES_PRELOAD_PROVIDERS`.

## Provider management

Providers live in the `providers` table, owned by a repository (`repositories` table). The built-in
repository `builtin:miauflix` holds the default providers. Admins manage them through the contract
(`providers`, `updateProvider`, `reorderProviders`, `testProvider`, `repositories`, `addRepository`,
`removeRepository`, `refreshRepository`). The backend exposes them under `/api/sources`.

A repository is a JSON array fetched over HTTP(S) (256 KB maximum, refreshed daily):

```json
[
  {
    "id": "my-indexer",
    "name": "My indexer",
    "version": "1.0.0",
    "kind": "torznab",
    "baseUrl": "https://indexer.example/api",
    "defaults": { "enabled": false, "priority": 50, "dailyBudget": 500 },
    "settings": { "apiKey": "" }
  }
]
```

The implemented provider kinds are `cardigann` (needs `cardigann`) and `torznab` (needs
`baseUrl`). Shared types also declare `http`, but the runtime registry does not create an HTTP
provider; do not advertise or install it as a working integration. A repository never overwrites a provider owned by another repository; the conflict is
reported in its `lastError`. Refreshing updates a provider's definition when its `version` changes
and keeps the admin's `enabled`, `priority` and settings. Settings named like passwords or API keys
are masked in responses.

## Cardigann definitions and Torznab

`CARDIGANN_DEFINITION_SOURCES` lists folders of Jackett-format YAML files. Defaults include
Prowlarr's `definitions/v11` and Miauflix's own indexer definitions; Jackett's folder can also be
added. Prowlarr's definitions mirror Jackett's minus trackers it blocks, while Miauflix's folder
adds ID-based searches through site JSON APIs. Each entry is a GitHub folder URL (`…/tree/<ref>/<path>`) or any http(s) folder serving
an `index.json`. The service lists it through the GitHub trees API, or `<url>/index.json` for
other hosts. Definitions are GPL-2.0:
they are stored in the service database at runtime and never committed. The engine lives in
`src/providers/cardigann/`:

- `template.ts`: the Go-template subset (`if`/`else if`/`range`, `or and eq ne not re_replace join`).
- `filters.ts`: text, date (Go layouts, `timeago`, `fuzzytime`) and size filters. An unknown filter,
  template function or selector marks the whole definition unsupported when it is installed.
- `selectors.ts`: HTML and XML through cheerio, JSON by path with `..` parent access and nested rows.
- `engine.ts`: capabilities from `caps.modes`, category mapping, link rotation, row extraction.
  Rows that offer no hash are resolved by fetching their magnet/`.torrent` link (at most eight per
  search, best-seeded first); anything left unresolved is dropped.

Cardigann compatibility is intentionally partial. Unsupported template constructs, filters, and
private-tracker sign-in flows are excluded; a definition being present in an upstream repository
does not guarantee it can run here. Administrators can browse/install supported definitions,
refresh their catalog, and add Torznab providers from Settings → Sources.

`src/providers/torznab/` is the Torznab client for an external Jackett or Prowlarr. An arbitrary
website URL is not a provider integration. A replacement source-service container must implement
the versioned service contract; Docker images are not automatically loaded as provider plugins.
See the [source feature guide](../../docs/features/sources.md) for an overview.

Tests use hand-written definitions and responses under `tests/fixtures/{cardigann,torznab}`; see
the README there for the GPL note.

### Definition sync

`DefinitionIndex` (`src/providers/cardigann/definition-index.ts`) mirrors each source's list into
`cardigann_index` every `CARDIGANN_SYNC_INTERVAL_MINUTES` (default 60). It compares the listing's
tree sha and each file's sha with what it stored and downloads only added or changed definitions.
The catalog (`cardigannDefinitions`) is served from that table, filtered by what each indexer
supports.

For GitHub-hosted definitions the sync uses git (`git-source.ts`): a shallow, sparse, blob-less clone
under `<data dir>/definitions-git`. One `git fetch` shows what changed and one checkout downloads
only the changed files in a single pack (about 4 s for the first sync of Jackett's ~585 definitions,
about 1 s when nothing changed). The service images install `git`. Without git, or with
`SOURCES_USE_GIT=false`, it falls back to the GitHub trees API plus one request per changed file.

Repository manifests and provider-supplied torrent URLs must resolve exclusively to public addresses. Each redirect is checked and connections are pinned to a checked address. Guarded requests cannot use FlareSolverr because its DNS and redirects cannot be pinned by this service.

Unreadable provider settings quarantine that provider without interrupting other providers. The management response reports the failure; replacing settings keeps the provider disabled until an administrator explicitly enables it again. Preserve the old database and key if settings need recovery.
