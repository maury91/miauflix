# Build context is the repository root so the service can consume shared contracts.
FROM oven/bun:1.4.0 AS bun-runtime

FROM node:22-slim AS builder
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /workspace

COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY backend-e2e/package.json backend-e2e/package.json
COPY packages/source-metadata-extractor/package.json packages/source-metadata-extractor/package.json
COPY packages/yts-sanitizer/package.json packages/yts-sanitizer/package.json
COPY packages/therarbg-sanitizer/package.json packages/therarbg-sanitizer/package.json
COPY packages/service-contracts/package.json packages/service-contracts/package.json
COPY services/media-catalog/package.json services/media-catalog/package.json

RUN sed -i 's/"prepare".*/"prepare": "echo skipped",/' packages/*/package.json || true
RUN npm ci --ignore-scripts

COPY packages/service-contracts packages/service-contracts
COPY services/media-catalog services/media-catalog
RUN npm run build --workspace @miauflix/service-contracts && \
    bun build services/media-catalog/src/index.ts --target=bun --outfile=/tmp/media-catalog.js

FROM builder AS development
WORKDIR /workspace/services/media-catalog
CMD ["bun", "--watch", "src/index.ts"]

FROM bun-runtime AS production
RUN apt-get update && apt-get install -y --no-install-recommends wget && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /tmp/media-catalog.js ./index.js
# CatalogDatabase resolves Drizzle migrations relative to the bundled entrypoint.
COPY --from=builder /workspace/services/media-catalog/src/db/migrations ./migrations

ENV DATA_DIR=/app/data
RUN groupadd --gid 911 linuxserver && \
    useradd --uid 911 --gid 911 --create-home --shell /usr/sbin/nologin linuxserver && \
    mkdir -p /app/data && \
    chown -R linuxserver:linuxserver /app/data
VOLUME /app/data
USER linuxserver
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["bun", "run", "index.js"]
