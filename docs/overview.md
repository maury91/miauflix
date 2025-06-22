## 📚 Backend Documentation Overview

> **Documentation Status:** Updated 2025-01-XX with implementation verification  
> **Note:** Documentation has been updated to reflect actual codebase implementation status

This directory provides a layered reference for the **miauflix-bun** backend.
Start here and dive progressively deeper:

| Level | File                                                                          | What You'll Find                                                         |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1     | **overview.md** (this file)                                                   | High-level map & quick links                                             |
| 1     | [backend/README.md#documentation-hub](../backend/README.md#documentation-hub) | Documentation hub with organized links                                   |
| 2     | [architecture.md](architecture.md)                                            | Tech‑stack snapshot (runtime, DB, torrent, external APIs)                |
| 2     | [directory-structure.md](directory-structure.md)                              | Complete project structure with route files & components                 |
| 2     | [coding-conventions.md](coding-conventions.md)                                | Import style, env helper, error handling, tests                          |
| 2     | [request-life-cycle.md](request-life-cycle.md)                                | Mermaid flow from Client → Hono → WebTorrent                             |
| 3     | [extension-recipes.md](extension-recipes.md)                                  | Step‑by‑step guides (add route, new tracker, encrypt field)              |
| 3     | [task-file-mapping.md](task-file-mapping.md)                                  | **Updated:** Roadmap tags ↔ key source files with implementation status |
| 3     | [run-and-debug.md](run-and-debug.md)                                          | Dev commands, config system & testing setup                              |
| 3     | [workflow.md](workflow.md)                                                    | Copilot iterative development workflow                                   |
| 3     | [testing-infrastructure.md](testing-infrastructure.md)                        | Testing setup, frameworks & best practices                               |

## 🔧 Specialized Technical Documentation

### Core Systems

| Document                                                       | Focus Area         | Key Topics                                                    | Status      |
| -------------------------------------------------------------- | ------------------ | ------------------------------------------------------------- | ----------- |
| [**Scheduler Service**](../backend/docs/scheduler-service.md)  | Background Tasks   | Job scheduling, task management, cron-like functionality      | ✅ Complete |
| [**Chunk Stores System**](../backend/docs/chunk-stores.md)     | Torrent Management | Distributed chunk storage, retrieval, caching strategies      | ✅ Complete |
| [**Authentication System**](../backend/docs/authentication.md) | Security           | JWT implementation, refresh tokens, role-based access         | ✅ Complete |
| [**Configuration System**](../backend/docs/configuration.md)   | Setup & Config     | Interactive setup, environment management, auto-configuration | ✅ Complete |

### Infrastructure & Operations

| Document                                                          | Focus Area | Key Topics                                                  | Status                                       |
| ----------------------------------------------------------------- | ---------- | ----------------------------------------------------------- | -------------------------------------------- |
| [**Security Implementation**](../backend/docs/security.md)        | Security   | Encryption, audit logging, security middleware              | ✅ Complete                                  |
| [**Media Services**](../backend/docs/media-services.md)           | Streaming  | Video streaming, torrent integration, quality management    | ⚠️ Partially complete                        |
| [**Streaming Services**](../backend/docs/streaming-services.md)   | Streaming  | **Updated:** WebTorrent infrastructure vs missing endpoints | ⚠️ Infrastructure complete, endpoint missing |
| [**VPN Fallback System**](../backend/docs/vpn-fallback-system.md) | Network    | VPN management, failover strategies, network resilience     | ✅ Complete                                  |
| [**Reverse Proxy Setup**](../backend/docs/reverse-proxy.md)       | Deployment | Nginx configuration, SSL setup, load balancing              | ✅ Complete                                  |

## 🗺️ Documentation Navigation

### For New Developers

1. Start with **[architecture.md](architecture.md)** for system overview
2. Review **[directory-structure.md](directory-structure.md)** for codebase layout
3. Follow **[run-and-debug.md](run-and-debug.md)** for development setup
4. Explore **[testing-infrastructure.md](testing-infrastructure.md)** for testing

### For Feature Development

1. Check **[extension-recipes.md](extension-recipes.md)** for implementation guides
2. Reference **[task-file-mapping.md](task-file-mapping.md)** for file locations and implementation status
3. Follow **[coding-conventions.md](coding-conventions.md)** for style guidelines
4. Use **[workflow.md](workflow.md)** for development process

### For System Understanding

1. **[Scheduler Service](../backend/docs/scheduler-service.md)** - Background processing (✅ Complete)
2. **[Chunk Stores System](../backend/docs/chunk-stores.md)** - Torrent management (✅ Complete)
3. **[Authentication System](../backend/docs/authentication.md)** - Security implementation (✅ Complete)
4. **[Configuration System](../backend/docs/configuration.md)** - Setup and config management (✅ Complete)

## ⚠️ Implementation Status Notes

### ✅ Production-Ready Components

- **Source Aggregation**: Multi-provider system (YTS + THERARBG) with background processing
- **WebTorrent Infrastructure**: Complete client with tracker management and stats scraping
- **Authentication**: Full JWT system with refresh tokens and role-based access
- **Database Layer**: Complete entity model with encryption and repository pattern
- **Background Tasks**: All 7 scheduled tasks operational

### ❌ Missing Critical Components

- **Stream Endpoint**: `/api/stream/:sourceId` not implemented (prevents video playback)
- **Viewport Preload**: `/api/ui/viewport` endpoint missing (performance optimization)

> **Tip:** Consult Level 2 docs when exploring, then Level 3 guides when building features. Specialized docs provide deep technical implementation details. Check implementation status in task-file-mapping.md before starting development.
