# Miauflix Backend

> **Status**: 100% complete and production-ready, including full streaming capabilities. Only needs frontend JWT authentication integration.

## Quick Start

```bash
# Install dependencies
npm install --workspace backend

# Run with configuration wizard
npm run start:backend

# Or run with Docker
docker-compose up
```

## Documentation

### 📖 Essential Docs

| File                                                     | Purpose                  |
| -------------------------------------------------------- | ------------------------ |
| [architecture.md](../docs/architecture.md)               | Technical stack overview |
| [directory-structure.md](../docs/directory-structure.md) | Codebase layout          |
| [coding-conventions.md](../docs/coding-conventions.md)   | Code style guide         |
| [run-and-debug.md](../docs/run-and-debug.md)             | Development setup        |

### 🔄 Development Workflow

| File                                                 | Purpose                       |
| ---------------------------------------------------- | ----------------------------- |
| [workflow.md](../docs/workflow.md)                   | Development process           |
| [extension-recipes.md](../docs/extension-recipes.md) | How to add features           |
| [task-file-mapping.md](../docs/task-file-mapping.md) | Implementation status by file |

### 🔧 System Documentation

| File                                                | Purpose                       |
| --------------------------------------------------- | ----------------------------- |
| [authentication.md](docs/authentication.md)         | JWT auth system (complete)    |
| [security.md](docs/security.md)                     | VPN detection & audit logging |
| [media-services.md](docs/media-services.md)         | TMDB, Trakt.tv integration    |
| [streaming-services.md](docs/streaming-services.md) | WebTorrent infrastructure     |
| [configuration.md](docs/configuration.md)           | Environment setup             |

## What's Implemented

### ✅ Production Ready

- **Authentication**: Complete JWT system with refresh tokens
- **Source Discovery**: YTS + THERARBG content directory aggregation
- **Background Processing**: 7 scheduled tasks running continuously
- **Database**: SQLite + TypeORM with encryption
- **Security**: VPN detection, audit logging, rate limiting
- **Streaming Infrastructure**: Complete `/stream/:token` endpoint with quality selection
- **API Infrastructure**: All backend routes implemented and functional

### ⚠️ Integration Needed

- **Frontend JWT**: Token management and authentication flow integration with existing backend

## Architecture

- **Framework**: Hono (lightweight web framework)
- **Database**: SQLite with TypeORM
- **Media Streaming**: WebTorrent client for peer-to-peer delivery
- **Auth**: JWT with JOSE library
- **Background Jobs**: Custom scheduler (100ms-5s intervals)

See [architecture.md](../docs/architecture.md) for complete details.

## Testing

```bash
# Unit tests
npm test --workspace backend

# E2E tests (spins up Docker environment)
npm run test:backend:e2e
```

## Need Help?

Check the [overview.md](../docs/overview.md) for the complete documentation map.
