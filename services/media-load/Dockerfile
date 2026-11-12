# Development image (docker-compose.dev.yml). The published miauflix-media-load image is the
# `media-load` target of services/Dockerfile.
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
# bittorrent-tracker and WebTorrent load WebRTC; fetch node-datachannel's prebuilt binary.
# The npm cache keeps the downloaded binary (_prebuilds), so it is fetched from GitHub once.
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3; do \
      npm rebuild node-datachannel && break; \
      [ "$attempt" = 3 ] && exit 1; \
      echo "node-datachannel download failed (attempt $attempt), retrying"; sleep 20; \
    done

COPY packages/source-metadata-extractor packages/source-metadata-extractor
COPY packages/contract packages/contract
COPY packages/service-contracts packages/service-contracts
COPY packages/service-configuration packages/service-configuration
COPY packages/vpn-guard packages/vpn-guard
COPY services/media-load services/media-load
RUN npm run build --workspace @miauflix/source-metadata-extractor && \
    npm run build --workspace @miauflix/contract && \
    npm run build --workspace @miauflix/service-contracts && \
    npm run build --workspace @miauflix/service-configuration && \
    npm run build --workspace @miauflix/vpn-guard

FROM runtime AS development
WORKDIR /workspace/services/media-load
CMD ["bun", "--watch", "src/index.ts"]
