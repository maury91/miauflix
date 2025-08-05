# --- Build Stage ---
FROM node:22-slim AS builder
WORKDIR /usr/src/app

# Install build tools (no unnecessary recommends)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ gosu curl && \
    rm -rf /var/lib/apt/lists/*

# Copy root manifests first
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Create package directories and copy ONLY their package.json files for dependency resolution
RUN mkdir -p packages/source-metadata-extractor packages/yts-sanitizer packages/therarbg-sanitizer backend
COPY backend/package.json ./backend/
COPY packages/source-metadata-extractor/package.json ./packages/source-metadata-extractor/
COPY packages/yts-sanitizer/package.json ./packages/yts-sanitizer/
COPY packages/therarbg-sanitizer/package.json ./packages/therarbg-sanitizer/

# Temporarily remove problematic prepare scripts that require source code
RUN sed -i 's/"prepare".*/"prepare": "echo skipped",/' packages/*/package.json

# Install dependencies (this layer will be cached unless dependencies change)
RUN npm ci

# NOW copy the full source code (including original package.json files)
COPY packages/ ./packages/
COPY backend/ ./backend/

# Build shared libs first (required for backend build)
RUN npm run build:libs

# Build backend
RUN npm run build --workspace=backend

# Create empty .env file for runtime stage
RUN touch .env

# --- Runtime Stage ---
FROM node:22-slim
WORKDIR /usr/src/app

# Install gosu and curl for entrypoint/healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends gosu curl && \
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
# Copy all node_modules from root (workspace dependencies)
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=builder /usr/src/app/backend/node_modules /usr/src/app/backend/node_modules
COPY --from=builder /usr/src/app/.env /usr/src/app/.env

# Copy entrypoint script
COPY backend-e2e/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create necessary directories and set permissions
RUN mkdir -p /usr/src/app/data

# Expose ports
EXPOSE 3000
EXPOSE 6499

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "--env-file", ".env", "./backend/app.js"]