## 🗺️ Architecture Snapshot

| **Layer**         | **Library / Runtime**              | **Purpose**                     | **Key Areas**                                 |
| ----------------- | ---------------------------------- | ------------------------------- | --------------------------------------------- |
| **HTTP API**      | **Node 20 ESM + Hono**             | Routing & middleware            | `src/app.ts`, `src/routes/*`                  |
| **Auth**          | **jose** (JWT) + bcrypt + Hono MW  | Login, role guard               | `src/services/auth/*`, `src/middleware/*`     |
| **Database**      | **TypeORM 0.3 + SQLite**           | Persistence (auto-sync)         | `src/database/*`, `src/entities/*`            |
| **External APIs** | **TMDB**, **Trakt**, **NordVPN**   | Metadata, list-sync, VPN status | `src/services/tmdb/*`, `src/services/trakt/*` |
| **Torrent**       | **YTS API** + **WebTorrent**       | Discover & stream magnets       | `src/trackers/*`, `src/services/source/*`     |
| **Caching**       | **cache-manager** + **keyv**       | Multi-layer caching system      | `src/utils/cache/*`, `src/services/*`         |
| **Streaming**     | **parse-torrent** + **webtorrent** | Torrent parsing & streaming     | `src/services/source/*`                       |
| **Rate Limiting** | **Custom middleware**              | API protection & throttling     | `src/middleware/rate-limit.middleware.ts`     |
| **Configuration** | **Interactive setup system**       | Auto-setup & config management  | `src/configuration.ts`                        |

## 🏗️ System Components

### Core Services

- **[Scheduler Service](../backend/docs/scheduler-service.md)** - Background task management and job scheduling
- **[Chunk Stores System](../backend/docs/chunk-stores.md)** - Distributed torrent chunk storage and retrieval
- **Authentication & Authorization** - JWT-based auth with refresh tokens and role-based access
- **Rate Limiting** - Request throttling and API protection
- **Audit Logging** - Comprehensive activity tracking and security logging

### Data Layer

- **TypeORM Entities** - User, Movie, TVShow, Episode, Season, List, Storage, and more
- **Repository Pattern** - Data access abstraction layer
- **Migration System** - Database schema versioning and updates
- **SQLite Database** - Lightweight, serverless database solution

### External Integrations

- **TMDB API** - Movie and TV show metadata
- **Trakt Integration** - User lists and watch progress synchronization
- **YTS Tracker** - Movie torrent discovery
- **NordVPN API** - VPN status monitoring and management

### Testing Infrastructure

- **Unit Testing** - Jest-based component testing
- **E2E Testing** - Full integration test suite
- **Test Fixtures** - Comprehensive mock data for testing
- **Testing Documentation** - See [`docs/testing-infrastructure.md`](testing-infrastructure.md)
