# Miauflix Backend

The backend serves the browser app and authenticated API, manages users and personal state, and streams media from encrypted torrent storage. Frontend authentication, playback sessions, preloading, seeking, audio conversion, and subtitles are implemented.

See the [feature guide](../docs/features.md) for user-facing capabilities and [ToDo.md](../ToDo.md) for remaining work. An implemented feature is not a blanket claim that every device or deployment has been validated.

## Quick start

Run commands from the repository root; this project uses npm workspaces.

```bash
npm install
npm run dev
```

`npm run dev` starts the backend, frontend, catalog, list, and source services. `npm run start:backend` starts only the backend; its supporting services must be running separately. The default Docker Compose deployment starts the application and its supporting services together:

```bash
docker compose up -d
```

Follow [Docker setup](../docs/setup/docker-setup.md) for initial configuration, networking, and VPN setup.

## Responsibilities

- **Authentication:** email/password and QR login, administrator/user roles, JWT access tokens, and refresh-token rotation. Browser clients receive both access and refresh tokens in HttpOnly cookies. The packaged TV app requests token transport and sends tokens in headers; API access also accepts a Bearer token when no access cookie is present.
- **Personal state:** watchlists, Like/Dislike/Love ratings, playback progress, availability requests, and in-app notifications.
- **Playback:** source selection, source-bound playback grants, byte-range streaming, preloading, codec-aware delivery, subtitles, and next-episode preparation.
- **Downloads and storage:** WebTorrent, encrypted torrent pieces, seeding retention, storage budgets, and cleanup that protects active streams.
- **External services:** versioned clients for the catalog, lists, and sources. The catalog currently uses TMDB; the list service owns Trakt association and synchronization; the source service owns indexer website access.
- **Background jobs:** queue jobs on the shared Bunqueue broker, rather than a fixed set of in-process polling tasks.
- **Operations:** configuration, service status, VPN checks, rate limiting, audit logging, and optional tracing.

The backend uses Node.js, Hono, SQLite/TypeORM, JOSE, and WebTorrent. The catalog, list, and source services run on Bun. See [system architecture](../docs/architecture/system-overview.md) for ownership and deployment boundaries.

## Documentation

| Guide                                                   | Purpose                                       |
| ------------------------------------------------------- | --------------------------------------------- |
| [Feature guide](../docs/features.md)                    | Available and planned user-facing features    |
| [Media services](docs/media-services.md)                | Catalog, lists, search, and media API routes  |
| [Streaming services](docs/streaming-services.md)        | Playback, delivery, preloading, and subtitles |
| [Authentication](docs/authentication.md)                | Authentication reference                      |
| [Security](docs/security.md)                            | VPN detection and audit logging               |
| [Configuration](docs/configuration.md)                  | Configuration reference                       |
| [Development workflow](../docs/development/workflow.md) | Workspace commands and development patterns   |
| [Testing guide](../docs/development/testing-guide.md)   | Test environments and fixtures                |
| [Documentation index](../docs/README.md)                | Setup and other references                    |

## Testing

Run from the repository root:

```bash
npm test --workspace backend
npm run test:backend:e2e
```

Tests must use mocks and recorded fixtures rather than live external services. The E2E command manages a Docker test environment.
