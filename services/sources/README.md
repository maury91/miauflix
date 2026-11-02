# Sources service

Bun service implementing the `sources` 1.0 streaming contract on port 3003. It owns source website access; the backend owns persisted candidates, peer metadata, verification, tracker stats, playback and notifications.

The native TheRARBG, YTS and EZTV providers search by IMDb first. TV requests also search episode titles and paginated season-pack queries, which find older seasons omitted from the newest IMDb results. Candidates are validated and deduplicated by info hash. File URLs cross the service boundary only as encrypted opaque references.

Search planning applies provider priority, interactive hedging, background budget sharing, persistent result caching and cooldowns after three failures. Background work reserves 20% of daily request budgets for interactive use. Every outbound HTTP request passes through the bounded HTTP client, including VPN checks, mirrors, metadata caches and FlareSolverr.

From the repository root:

```sh
npm install
npm run build:libs
npm run start:sources
npm test --workspace @miauflix/sources-service
```

Bootstrap environment: `SOURCES_PORT` (3003), `SOURCES_HOST` (0.0.0.0), `SOURCES_DATA_DIR` (or `DATA_DIR`, otherwise ./data), `SOURCES_KEY_FILE` (defaults inside the data directory), and optional `SOURCES_ENCRYPTION_KEY`. Retain the data directory and key across restarts; replacing the key prevents decrypting existing settings/cache/references.

The backend discovers and pushes the Sources configuration schema. Configure provider endpoints, VPN checking, request timeout, hedge delay, minimum seeders and daily budget there. Existing `THE_RARBG_API_URL`, `YTS_API_URL` and `FLARESOLVERR_URL` stored values carry over. The initial Sources VPN opt-out inherits the backend setting; it can subsequently be configured independently. Search and metadata-file calls fail closed without VPN protection unless explicitly disabled. Standby health remains available before configuration.

SQLite runs in WAL mode. Ordered `PRAGMA user_version` migrations preserve existing data. Provider settings and cached search payloads are encrypted. New built-in providers are inserted only when absent. Backend migration resets discovery scheduling and retains existing movie/episode associations.

Tests inject an offline fetch implementation; unexpected URLs fail. Synthetic regression fixtures reproduce the newest-episodes-only and paged-older-season behavior without contacting providers. Record new sanitized provider responses using the commands in [provider-fixtures](../../docs/development/provider-fixtures.md), for example:

```sh
E2E_PROVIDER_NETWORK_INTERNAL=false RECORD_PROVIDER_FIXTURES=true npm run test:backend:e2e
```

Recording is an explicit online operation requiring a VPN. Normal E2E tests use an internal Docker network. Never copy API keys or unsanitized provider payloads into fixtures. This phase provides native providers only; runtime provider/repository management, Cardigann, Torznab, external containers and anime are later phases.

## Provider management

Providers live in the `providers` table, owned by a repository (`repositories` table). The built-in
repository `builtin:miauflix` holds the native providers. Admins manage them through the contract
(`providers`, `updateProvider`, `reorderProviders`, `testProvider`, `repositories`, `addRepository`,
`removeRepository`, `refreshRepository`; the backend exposes them under `/api/sources`).

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

`kind` is `native` (needs `native`), `cardigann` (needs `cardigann`), `torznab` or `http` (need
`baseUrl`). A repository never overwrites a provider owned by another repository; the conflict is
reported in its `lastError`. Refreshing updates a provider's definition when its `version` changes
and keeps the admin's `enabled`, `priority` and settings. Settings named like passwords or API keys
are masked in responses.
