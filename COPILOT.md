# Miauflix Development Instructions

## Documentation Structure (Layered Approach)

**Level 1** - Start Here:

- `/docs/overview.md` - Complete documentation map

**Level 2** - Core Understanding:

- `architecture.md` - Tech stack (runtime, DB, torrent, APIs)
- `directory-structure.md` - Backend folder organization
- `coding-conventions.md` - Import style, env helpers, error handling
- `request-life-cycle.md` - Request flow visualization

**Level 3** - Implementation:

- `extension-recipes.md` - Step-by-step feature guides
- `workflow.md` - Development workflow (Unit → E2E → Regression)
- `run-and-debug.md` - Environment setup & commands

> 💡 **Tip:** Browse Level 2 when exploring, use Level 3 when building

## Quick Start Checklist

1. **Check existing features first** via manual testing below
2. **Follow the workflow**: `/docs/workflow.md`
3. **Implementation patterns**: `/docs/extension-recipes.md`

## Essential Commands

```bash
# Development
npm run dev:backend                   # Hot reload development, avoid using it
npm run start:backend:e2e             # Mock server + auto-extracted credentials, prefer this one

# Testing
npm run test:backend                  # Unit tests
npm run test:backend:e2e              # Full e2e suite (spins up environment)
npm run test:backend:e2e:dev <file>   # Single e2e test against running server, use when `start:backend:e2e`, this is the ideal one for e2e tests
cd backend-e2e && time npm test      # Performance measurement
```

## Quick Feature Implementation

Refer to `/docs/extension-recipes.md` for step-by-step guides:

- Add new route
- Add torrent provider
- Encrypt DB field

## Architecture References

- **E2E test architecture**: `/backend-e2e/README.md`

_For detailed architecture, directory structure, request flow, and coding conventions - see Level 2 docs above_

## Manual API Testing

```bash
# Start environment and get auto-extracted credentials from backend-e2e/admin-credentials.json
npm run start:backend:e2e

# Login and test
TOKEN=$(curl -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@CONTAINER_ID.local","password":"GENERATED_PASSWORD"}' | jq -r '.accessToken')

curl -X GET "http://localhost:3000/movies/550" -H "Authorization: Bearer $TOKEN" | jq
```

## Core Development Principles

- **Security-first**: Whitelist approach, proper auth guards
- **Pattern consistency**: Follow existing codebase patterns
- **Test coverage**: Write tests for all new features
- **Error handling**: Use proper logging and error responses
- **Dockerized Development**: Always run backend in dockerized environment, never start backend directly without Docker
- **Dependency Injection**: Services should not initialize other services internally - use constructor injection pattern
- **Always Run From Root**: Execute all commands from project root directory, never from subdirectories (ensures proper .env resolution and relative paths)
- **Never Change Directories**: Use npm scripts or full paths instead of `cd backend && npm ...` - always stay in root directory when executing commands

## Implementation Behavioral Guidelines

### Command Execution

- Always execute from project root directory (`/home/vscode/projects/miauflix-bun`)
- Use npm scripts defined in root package.json (e.g., `npm run test:backend`) instead of changing directories
- For subdirectory scripts, use `--workspace` flag (e.g., `npm run test --workspace=backend`) to stay in root
- When running node directly, use paths relative to root (e.g., `node backend/src/app.js`)
- Never use `cd subdirectory && command` pattern - stay in root and reference paths

### Service Architecture

- Initialize all services in `app.ts` and inject dependencies via constructors
- Use repository patterns with smart getters/setters for data transformation (encryption, validation, etc.)
- Implement "transition strategies" for schema changes - keep legacy columns during migrations

### Database Operations

- Always implement three modes for data migrations: dry-run, simulation, and actual execution
- Use repository patterns instead of direct database access to leverage existing business logic
- Log progress in batches and collect/report all errors at the end (don't fail fast)
- Choose appropriate column types: BLOB for binary data, TEXT for strings

### Environment & Configuration

- Use relative paths in environment variables (e.g., `DATA_DIR=./data`)
- Validate all required environment variables at application startup
- Save configuration files relative to project root, not execution directory

## E2E Test Optimization Guidelines

### Performance (Target: <5 seconds)

- Use `RATE_LIMIT_TEST_MODE=true` environment variable
- Add `_forceRateLimit=true` query param only when testing rate limiting specifically
- Remove artificial delays - achieved 92% speed improvement (45s → 3.4s)

### Reliability

- **Never silently skip tests** - always throw descriptive errors when prerequisites missing:
  ```typescript
  if (!userCredentials) {
    throw new Error('No user credentials available - ensure backend is running');
  }
  ```
- Clean console output: remove info logs, keep critical error messages only
- Tests should fail loudly when environment isn't properly configured

## Recent Optimizations

### Script Consolidation ✅

- **Issue**: Duplicate logic between `dev.sh` and `run.sh` scripts
- **Solution**: Created unified `env.sh` script with mode arguments
- **Usage**:
  - `./scripts/env.sh dev` (replaces `dev.sh`)
  - `./scripts/env.sh test` (replaces `run.sh`)
- **Benefits**: 60% less code duplication, single maintenance point
- **Updated References**: All package.json, README.md, and test files
