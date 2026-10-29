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
RUN mkdir -p packages/source-metadata-extractor packages/yts-sanitizer packages/therarbg-sanitizer packages/service-contracts backend frontend services/media-catalog services/list-service
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY packages/source-metadata-extractor/package.json ./packages/source-metadata-extractor/
COPY packages/yts-sanitizer/package.json ./packages/yts-sanitizer/
COPY packages/therarbg-sanitizer/package.json ./packages/therarbg-sanitizer/
COPY packages/service-contracts/package.json ./packages/service-contracts/
COPY packages/service-configuration/package.json ./packages/service-configuration/
COPY services/media-catalog/package.json ./services/media-catalog/
COPY services/list-service/package.json ./services/list-service/

# Temporarily remove problematic prepare scripts that require source code
RUN sed -i 's/"prepare".*/"prepare": "echo skipped",/' packages/*/package.json || true

# --- Production dependencies for the backend workspace only ---
# Keeps devDependencies (TypeScript, Vite, Jest, Storybook, ...) and other
# workspaces' dependencies out of the runtime image.
FROM deps-base AS prod-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace backend

# --- Build Stage ---
FROM deps-base AS builder
# Install dependencies with npm cache mount for faster installs
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy shared packages first so library builds cache independently
COPY packages/ ./packages/
COPY backend/ ./backend/

# Copy frontend sources before running the complete build graph so the same
# Turbo cache is available to the backend client and frontend tasks.
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
FROM node:22-slim
WORKDIR /usr/src/app

# Install gosu and curl for entrypoint/healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends gosu curl ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Copy built output from dist directory (where tsc puts compiled JS files)
COPY --from=builder /usr/src/app/dist/backend /usr/src/app/backend
# Copy built packages (internal workspace dependencies)
COPY --from=builder /usr/src/app/packages/source-metadata-extractor/dist /usr/src/app/packages/source-metadata-extractor/dist
COPY --from=builder /usr/src/app/packages/source-metadata-extractor/package.json /usr/src/app/packages/source-metadata-extractor/package.json
COPY --from=builder /usr/src/app/packages/yts-sanitizer/dist /usr/src/app/packages/yts-sanitizer/dist
COPY --from=builder /usr/src/app/packages/yts-sanitizer/package.json /usr/src/app/packages/yts-sanitizer/package.json
COPY --from=builder /usr/src/app/packages/therarbg-sanitizer/dist /usr/src/app/packages/therarbg-sanitizer/dist
COPY --from=builder /usr/src/app/packages/therarbg-sanitizer/package.json /usr/src/app/packages/therarbg-sanitizer/package.json
COPY --from=builder /usr/src/app/packages/service-contracts/dist /usr/src/app/packages/service-contracts/dist
COPY --from=builder /usr/src/app/packages/service-contracts/package.json /usr/src/app/packages/service-contracts/package.json
# Copy production-only node_modules (workspace dependencies)
COPY --from=prod-deps /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=prod-deps /usr/src/app/backend/node_modules /usr/src/app/backend/node_modules
COPY --from=builder /usr/src/app/.env /usr/src/app/.env
# Copy built frontend into public directory to be served by backend (and shared with nginx)
COPY --from=builder /usr/src/app/dist/frontend /usr/src/app/public

# Set default frontend directory for static serving
ENV FRONTEND_DIR=/usr/src/app/public
# glibc gives every thread its own malloc arena and rarely returns freed memory; with
# native work on many threads (crypto/sqlite in Node, libvips/WASM in Bun) RSS only grows.
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
CMD ["node", "--env-file-if-exists", ".env", "./backend/app.js"]
