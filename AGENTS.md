# Repository Guidelines

## Project Structure & Module Organization
Miauflix uses npm workspaces (`backend`, `frontend`, `packages/*`) with shared tooling at the root. Feature code lives in `backend/src` (services, routes, entities, repositories) and `frontend/src` (pages, components, Redux store). End-to-end harness scripts sit in `backend-e2e/`, while HTTP fixtures reside in `backend/test-fixtures/`. Keep binaries, generated assets, and logs out of source control; anything temporary belongs under `dist/` or `logs/`.

## Build, Test, and Development Commands
Use `npm run dev` to launch backend and frontend together. Backend-only work: `npm run start:backend` for hot reload, `npm run build:backend` for production bundles. Frontend builds with `npm run build:frontend`; verify TypeScript via `npm run check:ts`. Core test entry points are `npm test --workspace backend`, `npm run test:frontend`, and full-stack e2e via `npm run test:backend:e2e`. Start the Docker-based harness with `npm run start:backend:e2e -- -d` and stop it using `npm run stop:backend:e2e` when finished.

## Coding Style & Naming Conventions
TypeScript is the default everywhere. Run `npm run format` (Prettier) before committing and keep two-space indentation. Backend uses ESLint with `npm run lint`; services, repositories, and routes follow the `FeatureNameService` / `feature.routes.ts` pattern. Import paths rely on TS config aliases such as `@services/download/download.service`, so prefer aliased imports over deep relatives. React components live in PascalCase files; hooks and utilities stay in lowerCamelCase modules.

## Testing Guidelines
Jest powers unit and integration suites. Declare `jest.mock()` at the top of each test file and use the shared `setupTest()` helper for isolation. Seed randomness via `configureFakerSeed()` and pull recorded responses from `backend/test-fixtures/` instead of live API calls. Frontend e2e and visual checks run through `npm run test:frontend:e2e` and `npm run test:frontend:visual`; keep snapshots deterministic and update fixtures intentionally.

## Commit & Pull Request Guidelines
Follow the existing short, imperative commit style (`Add AgentOS`, `Update README`). Squash local work before opening a PR. Provide clear descriptions that explain the user impact, list affected services or routes, and attach test output. Reference related issues or docs explicitly, and include screenshots or terminal logs when UI or operational behavior changes.

## Security & Configuration Tips
Never read `process.env` directly—always use the `ENV()` helper from `@constants` for validated configuration. Entity edits auto-sync to SQLite, so plan migrations carefully and run the relevant test suites before pushing. Keep secrets in `.env` files that stay outside Git, and AI agents must treat those files as off-limits (never open, copy, or log them). Avoid adding new dependencies without using the root-level `npm install --workspace <name>` pattern.
