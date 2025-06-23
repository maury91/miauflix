## 🔖 Task ↔ File Mapping

> **Status Updated:** 2025-06-25 - Verified against actual codebase implementation

| Roadmap Tag          | Status          | Main Files                                                                                                                               |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `backend#auth`       | ✅ **Complete** | `auth.service.ts`, `auth.routes.ts`, `user.entity.ts`, `refresh-token.entity.ts`, `auth.middleware.ts`                                   |
| `backend#sources`    | ✅ **Complete** | `source.service.ts`, `content-directories/yts/`, `content-directories/therarbg/`, `movie-source.entity.ts`, `movie-source.repository.ts` |
| `backend#stream`     | ❌ **Missing**  | Stream endpoint not implemented - requires `routes/stream.routes.ts`, streaming service integration                                      |
| `backend#stream-e2e` | ❌ **Missing**  | E2E testing infrastructure - requires `backend-e2e/` expansion, torrent testing containers                                               |
| `backend#preload`    | ❌ **Missing**  | Viewport preload queue not implemented - requires `/api/ui/viewport` endpoint                                                            |
| `backend#lists`      | ✅ **Complete** | `list.service.ts`, `list.syncronizer.ts`, `list.entity.ts`, `trakt.service.ts`, `trakt.routes.ts`                                        |
| `backend#encryption` | ✅ **Complete** | `encryption.service.ts`, `movie-source.repository.ts`, `scripts/migrate-encrypt.ts`                                                      |
| `infra#e2e-stream`   | ❌ **Missing**  | E2E infrastructure setup - requires Docker containers, test content generation, compose file updates                                     |

## 🔍 Implementation Status Notes

### ✅ Completed Tasks (Not in Original Todos)

- **Authentication System**: Full JWT implementation with refresh tokens, role-based access, audit logging
- **Source Aggregation**: Multi-provider system (YTS + THERARBG) with background processing, VPN awareness
- **WebTorrent Infrastructure**: Complete `download.service.ts` with tracker management, stats scraping
- **Database Layer**: Complete entity model with 13+ entities, repository pattern, encryption
- **API Routes**: Comprehensive route system with authentication, rate limiting, validation

### ❌ Missing Critical Components

- **Stream Endpoint**: `/api/stream/:sourceId` route for video streaming (all infrastructure exists)
- **Viewport Preload**: `/api/ui/viewport` endpoint for priority-based preloading

### 📋 File Reference Corrections

- `tracker.service.ts` → `content-directories/` (actual location)
- `webtorrent.service.ts` → `download.service.ts` (actual filename)
- Added `content-directories/therarbg/` (second provider implementation)
