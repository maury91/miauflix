FROM oven/bun:1.4.0 AS bun-runtime

FROM node:22-slim AS runtime
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /workspace
COPY package.json bun.lock turbo.json tsconfig.json ./
# Every workspace's manifest: a frozen `bun install` stops when one is missing.
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY backend-e2e/package.json backend-e2e/package.json
COPY packages/anime-mapping/package.json packages/anime-mapping/package.json
COPY packages/contract/package.json packages/contract/package.json
COPY packages/service-configuration/package.json packages/service-configuration/package.json
COPY packages/service-contracts/package.json packages/service-contracts/package.json
COPY packages/source-metadata-extractor/package.json packages/source-metadata-extractor/package.json
COPY packages/vpn-guard/package.json packages/vpn-guard/package.json
COPY services/list-service/package.json services/list-service/package.json
COPY services/media-catalog/package.json services/media-catalog/package.json
COPY services/media-load/package.json services/media-load/package.json
COPY services/sources/package.json services/sources/package.json
RUN sed -i 's/"prepare".*/"prepare": "echo skipped",/' packages/*/package.json || true
# Retried: bun install fails outright on a transient registry or GitHub download error.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    for attempt in 1 2 3; do \
      bun install --frozen-lockfile --ignore-scripts && break; \
      [ "$attempt" = 3 ] && exit 1; \
      echo "bun install failed (attempt $attempt), retrying"; sleep 20; \
    done

COPY packages/source-metadata-extractor packages/source-metadata-extractor
COPY packages/contract packages/contract
COPY packages/service-contracts packages/service-contracts
COPY packages/service-configuration packages/service-configuration
COPY services/list-service services/list-service
RUN npm run build --workspace @miauflix/source-metadata-extractor && \
    npm run build --workspace @miauflix/contract && \
    npm run build --workspace @miauflix/service-contracts && \
    npm run build --workspace @miauflix/service-configuration

FROM runtime AS development
COPY --from=runtime /workspace /workspace
WORKDIR /workspace/services/list-service
CMD ["bun", "--watch", "src/index.ts"]

FROM runtime AS production-dependencies
# Bun cannot prune: reinstall the production dependencies alone.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    rm -rf node_modules && \
    bun install --frozen-lockfile --production --ignore-scripts --filter @miauflix/list-service

FROM bun-runtime AS production
WORKDIR /app
COPY --from=production-dependencies /workspace/node_modules /app/node_modules
COPY --from=runtime /workspace/packages/source-metadata-extractor /app/packages/source-metadata-extractor
COPY --from=runtime /workspace/packages/contract /app/packages/contract
COPY --from=runtime /workspace/packages/service-contracts /app/packages/service-contracts
COPY --from=runtime /workspace/packages/service-configuration /app/packages/service-configuration
COPY --from=runtime /workspace/services/list-service /app/services/list-service
ENV LIST_SERVICE_DATA_DIR=/app/data
RUN mkdir -p /app/data && chown bun:bun /app/data
VOLUME /app/data
EXPOSE 3002
USER bun
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 CMD bun -e "fetch('http://localhost:3002/health').then(r => { if (!r.ok) process.exit(1) })"
CMD ["bun", "run", "/app/services/list-service/src/index.ts"]
