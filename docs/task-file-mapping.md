## 🔖 Task ↔ File Mapping

> **Status Updated:** 2025-06-25 - Verified against actual codebase implementation

| Roadmap Tag          | Status          | Main Files                                                                                                                               |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `backend#auth`       | ✅ **Complete** | `auth.service.ts`, `auth.routes.ts`, `user.entity.ts`, `refresh-token.entity.ts`, `auth.middleware.ts`                                   |
| `backend#sources`    | ✅ **Complete** | `source.service.ts`, `content-directories/yts/`, `content-directories/therarbg/`, `movie-source.entity.ts`, `movie-source.repository.ts` |
| `backend#stream`     | ✅ **Complete** | `routes/stream.routes.ts`, `stream.service.ts`                                                                                           |
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

### 🔄 In Progress

- **Progress API**: Backend structure ready (`progress.routes.ts`), frontend updated (`progress.ts`), TODO: implement real data retrieval in backend GET endpoint
- **Frontend Type System**: Phase 1 - Fixing type mismatches and API contracts

### ❌ Missing Critical Components

- **Viewport Preload**: `/api/ui/viewport` endpoint for priority-based preloading

### ✅ Recently Fixed Issues

- **SeasonsCount/SeasonNumber**: ✅ **RESOLVED** - Fixed type mismatches in frontend components
  - `mediaDetails.tsx`: Calculate `seasonsCount` from `show.seasons.length`
  - `tvShowPage.tsx`: Fixed `useState` usage for latest season/episode tracking
- **Categories API**: ✅ **RESOLVED** - Completely removed redundant categories API
  - `categories.ts`: Deleted redundant API file
  - `app.tsx`: Updated to use `useGetListsQuery` instead of `useGetCategoriesQuery`
  - `usePreloadHomeImages.ts`: Updated to use `useGetListsQuery`
  - `categories.tsx`: Updated component to use `useGetListsQuery`
  - `store.ts`: Removed `categoriesApi` from store configuration
  - `home.ts`: Updated slice to use `listsApi` matcher instead of `categoriesApi`
  - **Result**: Categories and lists are now unified, no duplicate APIs
- **Phase 1 Type System Fixes**: ✅ **COMPLETED** - All 9 remaining errors fixed
  - **Missing Users API**: ✅ **RESOLVED** - Removed dead import from `newProfileScreen.tsx`
  - **Progress Hook Index Type**: ✅ **RESOLVED** - Added null check for `showSlug` in `useInitialProgress.tsx`
  - **Slider Data Type**: ✅ **RESOLVED** - Fixed `backdrop` property to never be null in `useGetSeasonEpisodes.tsx`
  - **Device Login API**: ✅ **RESOLVED** - Fixed parameter structure and response handling in `deviceLogin.tsx`
  - **NewProfileScreen Issues**: ✅ **RESOLVED** - Fixed mutation usage and expiration check
  - **Stream URL Type Mismatch**: ✅ **RESOLVED** - Modified `setStreamUrl` action to handle both full and simplified formats
  - **Player Initial Position**: ✅ **RESOLVED** - Fixed type conversion in `useInitialProgress.tsx`
  - **Backend Client Export Issue**: ✅ **RESOLVED** - Fixed module format mismatch between JS and TS files
  - **Auth API Typo**: ✅ **RESOLVED** - Fixed `DevicleAuthResponse` typo to `DeviceAuthResponse`
  - **Result**: Frontend build now passes successfully with 0 errors! 🎉

### 🎯 **Phase 1 Complete - All Type System Issues Resolved!**

The frontend now builds successfully with no TypeScript errors. All architectural mismatches between frontend and backend have been resolved.

### 📋 File Reference Corrections

- `tracker.service.ts` → `content-directories/` (actual location)
- `webtorrent.service.ts` → `download.service.ts` (actual filename)
- Added `content-directories/therarbg/` (second provider implementation)
