# Frontend Architecture

This document outlines the frontend directory structure after the migration from `frontend-legacy`. It highlights the responsibilities of the new top-level folders and points to the key files that bootstrap the application.

## Directory Overview

- `src/app/`
  - `AppShell.tsx`: Minimal application shell that coordinates the splash animation and initial route rendering.
  - `bootstrap/`: Client and server entrypoints (`client.tsx`, `server.tsx`) plus SSR mocks used during server rendering.
  - `shell/`: Housing platform-level UI such as the `IntroAnimation`.
  - `startup/`: Device-specific bootstrap scripts (e.g. Tizen helper modules).

- `src/pages/`
  - Route-level React screens. A page lays out its screen and composes features; it holds only code that belongs to that screen.
  - `home/`: the Home screen. It hosts the browse rows, the hero, the sidebar, and the details and player views, which come from `features/details` and `features/player`.

- `src/features/`
  - Domain-specific slices that compose state, APIs, and UI. A feature may import from `shared/`, `store/` and other features, never from `pages/`.
  - Each feature uses the same subfolders: `api/` (RTK Query), `hooks/`, `lib/` (pure logic), `ui/` (components).
  - `auth/`: login and device authentication (`LoginWithEmail`, `LoginWithQR`, `QRDisplay`).
  - `details/`: the title details view (`MediaDetails`, `EpisodesSection`, season loading).
  - `player/`: the player (`PlayerView`, `PlayerControls`, `AvplayVideo`, subtitles, audio delivery, playback messages).
  - `progress/`: watch progress and the episode rules built on it (continue watching, next episode).
  - `notifications/`, `integrations/` (Trakt), `profiles/`, `preload/`, `home-feed/`: one domain each.

- `src/shared/`
  - Cross-cutting assets and helpers.
  - `components/`: Generic building blocks such as `Spinner`.
  - `hooks/`: Reusable React hooks (`useWindowSize`).
  - `lib/`: Pure utility helpers (`object.ts`, `media.utils.ts`, `image-preloader.ts`, `homeNavigation.ts`).
  - `ui/logo/`: Branded primitives (`Logo` component and Storybook story).
  - `config/`: Environment helpers (`env.ts`) and exported runtime constants (`constants.ts`).
  - `styles/`: Global styles (`global.css`).

- `src/store/`
  - Central Redux Toolkit store setup (`store.ts`) that registers feature APIs and exposes `store`, `AppDispatch`, and `RootState`.

- `src/types/`
  - Shared TypeScript contracts re-exported across features (e.g. auth state shapes).

- `src/utils/`
  - Imperative platform helpers (secure profile storage and access token management).

## Entrypoints

- `src/main.tsx`
  - Thin shim that imports the browser bootstrap (`src/app/bootstrap/client.tsx`).
- `src/main-server.tsx`
  - Re-exports the SSR entry (`src/app/bootstrap/server.tsx`).

## Testing & Stories

- Component and feature tests live beside their implementations.
- Storybook stories follow the same co-location (e.g. `IntroAnimation.stories.tsx`, `QRDisplay.stories.tsx`).

This structure keeps platform bootstrap, routes, and feature domains isolated while promoting reuse through the `shared/` namespace.
