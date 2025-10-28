# Miauflix Frontend

Modern React + Vite client that powers the TV experience. The source tree keeps routing, domain features, shared building blocks, and app bootstrap concerns clearly separated.

## Quick Start

- Install dependencies from the repo root: `npm install`
- Start the full stack dev environment: `npm run dev`
- Frontend-only build: `npm run --workspace @miauflix/frontend build`
- Unit tests: `npm run --workspace @miauflix/frontend test`

## Key Entry Points

- `src/main.tsx` – browser bootstrap that mounts the React app.
- `src/main-server.tsx` – exports SSR helpers for the Vite build pipeline.
- `src/app/AppShell.tsx` – minimal application shell that wires providers, the intro animation, and the active route tree.

## Source Structure

```
src/
├── app/             # Application shell, bootstrapping, and platform start-up
│   ├── AppShell.tsx
│   ├── bootstrap/   # Client + server entrypoints, SSR mocks
│   ├── shell/       # Intro animation and future shell-level widgets
│   └── startup/     # Tizen-specific launch scripts and helpers
├── pages/           # Route-level screens (e.g., login)
├── features/        # Domain modules with colocated API, UI, and logic
│   └── auth/
│       ├── api/     # RTK Query slices for auth flows
│       ├── lib/     # Feature-specific utilities and tests
│       └── ui/      # Auth-related view components (email + QR login)
├── shared/          # Cross-feature hooks, UI primitives, styles, config
│   ├── components/  # Generic visual components (Spinner, etc.)
│   ├── config/      # Environment + platform constants
│   ├── hooks/       # Reusable hooks (e.g., useWindowSize)
│   ├── lib/         # Framework-agnostic helpers
│   └── styles/      # Global CSS and theming assets
├── store/           # Redux store configuration and exports
├── types/           # Shared TypeScript contracts consumed across layers
└── utils/           # Imperative utilities for storage and token handling
```

Tests, stories, and supporting files live beside their source to keep feature modules self-contained. For example, the QR login widget includes its Storybook stories and Vitest specs in `features/auth/ui/login/`.

## Path Aliases

The following aliases are defined in `tsconfig.json` and `vite.config.ts`:

- `@app/*` → `src/app/*`
- `@features/*` → `src/features/*`
- `@pages/*` → `src/pages/*`
- `@shared/*` → `src/shared/*`
- `@store/*` → `src/store/*`
- `@types/*` → `src/types/*`
- `@utils/*` → `src/utils/*`

Use aliases in new imports to keep references stable when files move.

## Conventions

- Co-locate tests (`*.test.ts[x]`) and stories with the component or utility they cover.
- Keep feature folders domain-focused; shared code should live under `src/shared/` or `src/utils/`.
- Prefer RTK Query for API access inside `features/*/api`, and surface hooks through feature modules rather than importing the slice directly.
- Run `npm run --workspace @miauflix/frontend format` (if available) before committing to maintain consistent styling.

This structure keeps login and intro animation code active while isolating reusable primitives for future pages. As additional features move from `frontend-legacy`, follow the same module boundaries to keep the tree predictable.
