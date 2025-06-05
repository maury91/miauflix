## 📂 Directory Cheat-Sheet

```text
backend/
└─ src/
  ├─ routes/ — Hono route handlers
  │  ├─ auth.routes.ts — authentication endpoints
  │  ├─ movie.routes.ts — movie-related endpoints
  │  └─ trakt.routes.ts — Trakt integration endpoints
  ├─ services/ — domain logic & business services
  ├─ database/ — TypeORM config & migrations
  ├─ entities/ — TypeORM entity definitions
  ├─ repositories/ — data access layer
  ├─ middleware/ — auth, rate-limit, audit middleware
  ├─ trackers/ — torrent client implementations
  ├─ utils/ — helpers (cache, encryption, limiter…)
  ├─ types/ — TypeScript type definitions
  ├─ errors/ — custom error classes
  ├─ configuration.ts — interactive setup system
  └─ app.ts — application entry point
└─ docs/ — specialized documentation
  ├─ scheduler-service.md — background job system
  ├─ chunk-stores.md — torrent chunk management
  ├─ authentication.md — auth system details
  ├─ configuration.md — config system guide
  ├─ media-services.md — streaming services
  ├─ security.md — security implementations
  └─ ... — additional technical docs
└─ data/ — SQLite database files
└─ test-fixtures/ — mock data for testing
  ├─ tmdb/ — TMDB API responses
  ├─ torrage/ — torrent tracker responses
  └─ itorrents/ — torrent metadata
```

### Frontend Structure

```text
frontend/
└─ src/
  ├─ app/ — React application components
  │  ├─ components/ — reusable UI components
  │  ├─ pages/ — application pages (home, welcome)
  │  ├─ hooks/ — custom React hooks
  │  └─ contexts/ — React context providers
  ├─ store/ — Redux Toolkit state management
  │  ├─ api/ — RTK Query API endpoints
  │  └─ slices/ — Redux state slices
  ├─ types/ — TypeScript type definitions
  └─ assets/ — static assets (fonts, images, styles)
```

### Additional Directories

```text
docs/ — project-wide documentation
├─ architecture.md — system overview
├─ directory-structure.md — this file
├─ testing-infrastructure.md — testing setup
└─ ... — development guides

packages/ — shared packages
└─ yts-sanitizer/ — YTS API response sanitization

scripts/ — automation scripts
nginx/ — reverse proxy configuration
backend-e2e/ — end-to-end testing setup
backend-integration-tests/ — integration test suite
```

### References to Specialized Documentation

- **[Scheduler Service](../backend/docs/scheduler-service.md)** - Background task management
- **[Chunk Stores System](../backend/docs/chunk-stores.md)** - Torrent chunk storage
- **[Testing Infrastructure](testing-infrastructure.md)** - Test setup and guidelines
