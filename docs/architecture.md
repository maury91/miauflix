## 🗺️ Architecture Snapshot

| **Layer**         | **Library / Runtime**              | **Purpose**                     | **Key Areas**                                 |
| ----------------- | ---------------------------------- | ------------------------------- | --------------------------------------------- |
| **HTTP API**      | **Node 22 ESM + Hono**             | Routing & middleware + Frontend | `src/app.ts`, `src/routes/*`                  |
| **Auth**          | **jose** (JWT) + bcrypt + Sessions | Login, HttpOnly cookies         | `src/services/auth/*`, `src/middleware/*`     |
| **Frontend**      | **React + Vite + Redux Toolkit**   | SPA served by backend           | Frontend static assets served at `/`          |
| **Database**      | **TypeORM + SQLite**               | Persistence (auto-sync)         | `src/database/*`, `src/entities/*`            |
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
- **Authentication & Authorization** - Session-based auth with HttpOnly cookies and role-based access
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

### Frontend Architecture

- **React Application** - Modern SPA with Redux Toolkit state management
- **Authentication UI** - Complete login flows (email/password, QR code)
- **API Integration** - Backend serves frontend, API mounted under `/api`
- **Session Management** - HttpOnly cookies for secure authentication
- **Component Library** - Reusable UI components with styled-components

### Testing Infrastructure

- **Unit Testing** - Jest-based component testing
- **E2E Testing** - Full integration test suite with frontend/backend
- **Visual Testing** - Storybook component testing
- **Test Fixtures** - Comprehensive mock data for testing
- **Testing Documentation** - See [`docs/testing-infrastructure.md`](testing-infrastructure.md)
