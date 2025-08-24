## 📂 Directory Guide

> **💡 Tip**: Each directory has a specific purpose. When adding new features, follow these patterns!

### 🎯 Backend Core (`backend/src/`)

```text
├─ 🚪 routes/          API endpoints (what users can call)
│  ├─ auth.routes.ts    → Login, logout, refresh tokens
│  ├─ movie.routes.ts   → Search movies, get details, sources
│  └─ trakt.routes.ts   → Sync watchlists, mark as watched
│
├─ ⚙️ services/        Business logic (the "brain" of each feature)
│  ├─ auth/            → Session creation, JWT creation, password hashing
│  ├─ source/          → Find torrents, rank quality
│  ├─ media/           → TMDB data sync, metadata
│  └─ download/        → WebTorrent streaming
│
├─ 🗄️ database/        Database setup and changes
│
├─ 📊 entities/        Database table definitions
│  ├─ movie.entity.ts  → What a movie looks like in DB
│  ├─ user.entity.ts   → User accounts and roles
│  └─ ...              → (13 entities total)
│
├─ 🔍 repositories/    Database queries (how to find/save data)
├─ 🛡️ middleware/      Request processing (auth, rate limits)
├─ 🧰 utils/           Helper functions (encryption, caching)
├─ 📝 types/           TypeScript definitions
├─ ❌ errors/          Custom error classes
├─ ⚙️ configuration.ts → Interactive setup wizard
└─ 🚀 app.ts           → Main application startup
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

### 🎨 Frontend Structure (`frontend/src/`)

```text
├─ 📱 app/              React application
│  ├─ components/       → Reusable UI (buttons, cards, etc.)
│  ├─ pages/            → Full screens (home, player, login)
│  │  ├─ home/          → Movie browsing and discovery
│  │  ├─ player/        → Video playback interface
│  │  ├─ login/         → Authentication (email/password, QR code)
│  │  │  └─ components/ → LoginWithEmail, LoginWithQR, ErrorMessage
│  │  └─ welcome/       → Initial app setup
│  ├─ hooks/            → Custom React hooks (useWindowSize, etc.)
│  └─ contexts/         → React context providers
│
├─ 🏪 store/            Redux state management
│  ├─ api/              → Backend API calls (RTK Query)
│  └─ slices/           → App state (movies, user, UI)
│
├─ 🎨 assets/           Static files
│  ├─ Poppins/          → Font files
│  └─ svgs/             → Icons and graphics
│
├─ 🎨 styles/           → Styles
│  └─ global.css       → Main styles (includes monospace fonts)
│
├─ 📝 types/            TypeScript definitions
│
└─ 🧩 components/       Legacy components
   └─ Spinner.tsx       → Loading spinner
```

### 📚 Quick Examples

**Adding a new API endpoint?** → `backend/src/routes/`  
**Need to store movie data?** → `backend/src/entities/movie.entity.ts`  
**Business logic for features?** → `backend/src/services/`  
**New React page?** → `frontend/src/app/pages/`

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
