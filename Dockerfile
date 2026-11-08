# The backend runs on Bun; npm still installs the workspace dependencies.
FROM oven/bun:1.4.0 AS bun-runtime

# --- Dependency manifests (shared by builder and prod-deps) ---
FROM node:22-slim AS deps-base
WORKDIR /usr/src/app

# Install build tools (no unnecessary recommends)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ gosu curl && \
    rm -rf /var/lib/apt/lists/*

# Copy root manifests first
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY turbo.json ./

# Create package directories and copy ONLY their package.json files for dependency resolution
RUN mkdir -p packages/source-metadata-extractor packages/contract packages/service-contracts packages/service-configuration backend frontend services/media-catalog services/list-service services/sources services/media-load
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY packages/source-metadata-extractor/package.json ./packages/source-metadata-extractor/
COPY packages/contract/package.json ./packages/contract/
COPY packages/service-contracts/package.json ./packages/service-contracts/
COPY packages/service-configuration/package.json ./packages/service-configuration/
COPY services/media-catalog/package.json ./services/media-catalog/
COPY services/list-service/package.json ./services/list-service/
COPY services/sources/package.json ./services/sources/
COPY services/media-load/package.json ./services/media-load/

# Temporarily remove problematic prepare scripts that require source code
RUN sed -i 's/"prepare".*/"prepare": "echo skipped",/' packages/*/package.json || true

# --- Production dependencies for the backend workspace only ---
# Keeps devDependencies (TypeScript, Vite, Jest, Storybook, ...) and other
# workspaces' dependencies out of the runtime image.
FROM deps-base AS prod-deps
# Retried: npm ci fails outright on a transient registry or GitHub download error.
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3; do \
      npm ci --omit=dev --workspace backend && break; \
      [ "$attempt" = 3 ] && exit 1; \
      echo "npm ci failed (attempt $attempt), retrying"; sleep 20; \
    done

# --- Build Stage ---
FROM deps-base AS builder
# Install dependencies with npm cache mount for faster installs. This stage only builds
# dist/ (the runtime's node_modules come from prod-deps), so install scripts are skipped:
# some download native binaries from GitHub Releases (node-datachannel), which the build
# never loads. Retried: npm ci fails outright on a transient registry error.
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3; do \
      npm ci --ignore-scripts && break; \
      [ "$attempt" = 3 ] && exit 1; \
      echo "npm ci failed (attempt $attempt), retrying"; sleep 20; \
    done

# Copy shared packages first so library builds cache independently
COPY packages/ ./packages/
COPY backend/ ./backend/

# Copy frontend sources before running the complete build graph so the same
# Turbo cache is available to the backend client and frontend tasks.
# The profile editor's sprite sheets are generated from these originals (prebuild/predev).
COPY assets/profile/ ./assets/profile/
COPY scripts/generate-profile-sprites.mjs ./scripts/
COPY frontend/ ./frontend/
# The frontend TypeScript build includes Storybook fixtures under src/. Those
# fixtures intentionally reuse the repository-level provider recordings.
COPY test-fixtures/ ./test-fixtures/
RUN --mount=type=cache,target=/usr/src/app/.turbo \
    --mount=type=cache,target=/usr/src/app/node_modules/.vite \
    npm run build:backend && \
    VITE_API_URL=/ npm run build:frontend

# Create empty .env file for runtime stage
RUN touch .env

# --- Runtime Stage ---
FROM bun-runtime
WORKDIR /usr/src/app

# Install gosu and curl for entrypoint/healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends gosu curl ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Bun runs the backend's TypeScript sources: `bun build` would emit the wrong decorators for
# modules imported through tsconfig paths, which TypeORM entities are. For those modules Bun
# also reads `experimentalDecorators` from the tsconfig.json of the working directory, so the
# root one comes along.
COPY tsconfig.json /usr/src/app/tsconfig.json
COPY backend/src /usr/src/app/backend/src
COPY backend/tsconfig.json backend/package.json /usr/src/app/backend/
# Copy built packages (internal workspace dependencies)
COPY --from=builder /usr/src/app/packages/source-metadata-extractor/dist /usr/src/app/packages/source-metadata-extractor/dist
COPY --from=builder /usr/src/app/packages/source-metadata-extractor/package.json /usr/src/app/packages/source-metadata-extractor/package.json
COPY --from=builder /usr/src/app/packages/contract/dist /usr/src/app/packages/contract/dist
COPY --from=builder /usr/src/app/packages/contract/package.json /usr/src/app/packages/contract/package.json
COPY --from=builder /usr/src/app/packages/service-contracts/dist /usr/src/app/packages/service-contracts/dist
COPY --from=builder /usr/src/app/packages/service-contracts/package.json /usr/src/app/packages/service-contracts/package.json
COPY --from=builder /usr/src/app/packages/service-configuration/dist /usr/src/app/packages/service-configuration/dist
COPY --from=builder /usr/src/app/packages/service-configuration/package.json /usr/src/app/packages/service-configuration/package.json
# Copy production-only node_modules (workspace dependencies)
COPY --from=prod-deps /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=prod-deps /usr/src/app/backend/node_modules /usr/src/app/backend/node_modules
COPY --from=builder /usr/src/app/.env /usr/src/app/.env
# Copy built frontend into public directory to be served by backend (and shared with nginx)
COPY --from=builder /usr/src/app/dist/frontend /usr/src/app/public

# Set default frontend directory for static serving
ENV FRONTEND_DIR=/usr/src/app/public
# glibc gives every thread its own malloc arena and rarely returns freed memory; with
# native work on many threads (crypto/sqlite, libvips/WASM) RSS only grows.
ENV MALLOC_ARENA_MAX=2

# Copy entrypoint script
COPY backend-e2e/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create necessary directories and set permissions
RUN mkdir -p /usr/src/app/data

# Expose ports
EXPOSE 3000
EXPOSE 6499

# Healthcheck. Docker only marks the container unhealthy; the compose files run autoheal to
# restart it. The long start period covers data migrations at the first start after an upgrade.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5m --retries=3 \
  CMD curl -fsS -o /dev/null --max-time 8 "http://localhost:${PORT:-3000}/api/health" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bun", "--env-file=.env", "./backend/src/app.ts"]
