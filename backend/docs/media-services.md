# Media services

Miauflix separates catalog information, provider-backed lists, and playable sources. A title appearing in the catalog does not guarantee that a downloadable video is available. For a viewer's guide, see [Browsing](../../docs/features/browsing.md) and [Accounts](../../docs/features/accounts.md).

## Ownership

| Component                                  | Owns                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog service (`services/media-catalog`) | Movie/show/season details, artwork, genres, catalog search, freshness, and catalog synchronization                                           |
| List service (`services/list-service`)     | Trakt public/personal/community lists, account association, encrypted provider credentials, and watchlist/playback synchronization           |
| Sources service (`services/sources`)       | Indexer access, supported Cardigann definitions, Torznab, search planning, and provider configuration                                        |
| Backend                                    | Slim local catalog indexes, resolved list membership, accounts, ratings, progress, sources, source verification, playback, and notifications |

The backend calls versioned service contracts through `CatalogClientService`, `ListClientService`, and `SourcesClientService`. Remote services publish their configuration schema and status. The backend configuration UI can configure them without embedding their provider implementations in the backend.

## Catalog and TV data

TMDB is the catalog provider wired into the current catalog service. The provider interface allows development of other adapters, but there is no user-facing arbitrary catalog-plugin installer.

Movie and show requests obtain fresh detail from the catalog and mirror the fields needed locally. Season detail is hydrated separately and includes episodes and their air dates. Artwork is represented by paths that clients can request at suitable sizes; artwork preparation and backdrop analysis also run through the catalog service.

Catalog workers perform changed-title scans and season synchronization. `EPISODE_SYNC_MODE` supports `ON_DEMAND` for watched shows and `GREEDY` for incomplete seasons across shows. This catalog synchronization is distinct from searching for episode video files.

## Lists, watchlists, and Trakt

The list service supplies popular and trending titles, personal watchlists/favorites/history, and community lists. Personal Trakt lists require linking a Trakt account from an authenticated Miauflix account. Trakt credentials do not sign the user into Miauflix.

The backend also keeps a local per-user watchlist. Add/remove actions can synchronize with linked Trakt accounts. Playback synchronization uses a durable outbox and retries; temporary provider failure does not require discarding local progress. Like/Dislike/Love ratings are local Miauflix ratings, separate from catalog scores.

## Search

The frontend's search uses the authenticated realtime search channel. It supports text queries, genre discovery, pagination, and per-user recent searches. Results come from the catalog, followed by enrichment of title details. This is separate from source discovery, which looks for downloadable releases.

Search operations use the realtime channel. The interface offers text queries, genres, recent searches, and pagination.

## Current media routes

These paths are mounted under `/api` by [route registration](../src/routes/index.ts). The listed media and account-state routes require authentication.

| Method and path                                                     | Behavior                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/movies/:id?lang=&includeSources=true`                     | Movie detail by catalog ID; optional on-demand source lookup                |
| `POST /api/movies/:mediaId/:quality`                                | Compatibility movie streaming-key flow; new playback uses sessions          |
| `GET /api/shows/:id?lang=`                                          | Show detail and season summaries                                            |
| `GET /api/shows/:id/seasons`                                        | Season summaries                                                            |
| `GET /api/shows/:id/seasons/:season`                                | Season detail, episodes, and per-episode source availability                |
| `GET /api/lists?page=&limit=`                                       | Paged home-list definitions; page zero begins with personal and fixed lists |
| `GET /api/list/:slug?lang=&page=&limit=`                            | A resolved list page                                                        |
| `GET /api/watchlist`                                                | Watchlist page or membership lookup using `mediaType` and `mediaId`         |
| `POST /api/watchlist`                                               | Add a movie or show to the current user's watchlist                         |
| `DELETE /api/watchlist`                                             | Remove a movie or show from the current user's watchlist                    |
| `POST /api/list/priorities`                                         | Promote visible/viewport titles for preparation                             |
| `POST /api/integrations/trakt/authorization`                        | Begin Trakt device authorization                                            |
| `POST /api/integrations/trakt/authorization/:authorizationId/check` | Poll authorization and reconcile the watchlist on connection                |
| `GET /api/integrations/trakt/association`                           | Inspect the current user's Trakt association                                |
| `DELETE /api/integrations/trakt/association`                        | Disconnect Trakt                                                            |

Follow the schemas in the [movie](../src/routes/movie.routes.ts), [show](../src/routes/show.routes.ts), and [list](../src/routes/list.routes.ts) handlers for accepted parameters and response types.

## Sources and availability

Indexer searches return candidate releases. The backend persists them, resolves torrent metadata, associates episode files, and verifies usable video. Availability distinguishes pending searches/verification from available and unavailable titles. Season packs containing separate episode files are supported; accurate boundaries for multiple broadcast episodes combined in one video remain backlog work.

Provider priorities, caching, request budgets, supported definitions, and Torznab are described in the [sources service reference](../../services/sources/README.md). Playback is described in [Streaming services](streaming-services.md).

## Configuration and implementation references

Configure catalog and list settings through the administrator configuration editor. The TMDB catalog schema uses `TMDB_API_ACCESS_TOKEN` and `TMDB_API_URL`. Trakt settings and tokens belong to the list service.

- [Catalog schema](../../services/media-catalog/src/config/schema.ts)
- [Catalog client](../src/services/catalog/catalog-client.service.ts)
- [Local catalog mirroring](../src/services/media/media.service.ts)
- [List projection and local watchlist](../src/services/media/list.service.ts)
- [Realtime search](../src/services/realtime/realtime.search.ts)
- [Trakt progress synchronization](../../services/list-service/src/playback-sync.ts)
