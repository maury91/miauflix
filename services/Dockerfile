# Bunqueue 2.8.61's compiled server and its executable expect the Bun Alpine
# runtime. Build the application dependencies on the same base so native
# packages such as sharp use the matching musl binaries.
FROM ghcr.io/egeominotti/bunqueue:2.8.61 AS builder

USER root
RUN apk add --no-cache nodejs npm

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
# The base image sets NODE_ENV=production; the build needs dev dependencies (TypeScript types),
# which the production reinstall below leaves out again.
# Retried: bun install fails outright on a transient registry or GitHub download error.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    for attempt in 1 2 3; do \
      NODE_ENV=development bun install --frozen-lockfile --ignore-scripts && break; \
      [ "$attempt" = 3 ] && exit 1; \
      echo "bun install failed (attempt $attempt), retrying"; sleep 20; \
    done

COPY packages/source-metadata-extractor packages/source-metadata-extractor
COPY packages/contract packages/contract
COPY packages/service-contracts packages/service-contracts
COPY packages/service-configuration packages/service-configuration
COPY packages/vpn-guard packages/vpn-guard
COPY packages/anime-mapping packages/anime-mapping
COPY services/media-catalog services/media-catalog
COPY services/list-service services/list-service
COPY services/sources services/sources
COPY services/media-load services/media-load
RUN npm run build --workspace @miauflix/source-metadata-extractor && \
    npm run build --workspace @miauflix/contract && \
    npm run build --workspace @miauflix/service-contracts && \
    npm run build --workspace @miauflix/service-configuration && \
    npm run build --workspace @miauflix/anime-mapping && \
    npm run build --workspace @miauflix/vpn-guard
# Bun cannot prune: reinstall the services' production dependencies alone.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    rm -rf node_modules && \
    bun install --frozen-lockfile --production --ignore-scripts \
      --filter @miauflix/media-catalog --filter @miauflix/list-service \
      --filter @miauflix/sources-service --filter @miauflix/media-load-service
# media-load's tracker client loads WebRTC; fetch node-datachannel's prebuilt (musl) binary.
# The npm cache keeps the downloaded binary (_prebuilds), so it is fetched from GitHub once.
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3; do \
      npm rebuild node-datachannel && break; \
      [ "$attempt" = 3 ] && exit 1; \
      echo "node-datachannel download failed (attempt $attempt), retrying"; sleep 20; \
    done

# Shared by every runtime image: the same base, user, data layout and entrypoint. The images only
# differ in which services they contain and run (CMD), so containers of any of them can share one
# /app/data volume: each service keeps its own directory in it.
FROM ghcr.io/egeominotti/bunqueue:2.8.61 AS runtime-base

USER root
RUN apk add --no-cache bash git su-exec && \
    mkdir -p /app/data/bunqueue /app/data/catalog /app/data/list-service /app/data/sources /app/data/media-load /usr/src/app/downloads && \
    chown -R bunqueue:bunqueue /app/data /usr/src/app/downloads

WORKDIR /workspace
COPY --from=builder --chown=1001:1001 /workspace/node_modules ./node_modules
COPY --from=builder --chown=1001:1001 /workspace/packages/source-metadata-extractor ./packages/source-metadata-extractor
COPY --from=builder --chown=1001:1001 /workspace/packages/contract ./packages/contract
COPY --from=builder --chown=1001:1001 /workspace/packages/service-contracts ./packages/service-contracts
COPY --from=builder --chown=1001:1001 /workspace/packages/service-configuration ./packages/service-configuration
COPY --from=builder --chown=1001:1001 /workspace/packages/vpn-guard ./packages/vpn-guard
COPY --from=builder --chown=1001:1001 /workspace/packages/anime-mapping ./packages/anime-mapping

COPY --chown=1001:1001 services/entrypoint.sh /app/miauflix-services-entrypoint.sh
COPY --chown=1001:1001 services/healthcheck.ts /app/healthcheck.ts
RUN chmod +x /app/miauflix-services-entrypoint.sh

ENV CATALOG_DATA_DIR=/app/data/catalog \
    CATALOG_PORT=3001 \
    LIST_SERVICE_DATA_DIR=/app/data/list-service \
    LIST_SERVICE_PORT=3002 \
    SOURCES_PORT=3003 \
    SOURCES_DATA_DIR=/app/data/sources \
    MEDIA_LOAD_PORT=3004 \
    MEDIA_LOAD_DATA_DIR=/app/data/media-load \
    DATA_PATH=/app/data/bunqueue/bunqueue.db \
    TCP_PORT=6789 \
    HTTP_PORT=6790

VOLUME /app/data
# Checks the services this container runs (the ones its CMD names).
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=10 CMD bun /app/healthcheck.ts
# The entrypoint starts as root only to hand its data (and the downloads volume) to bunqueue, then
# drops to it. CMD names the services the container runs: override it to run any subset.
ENTRYPOINT ["/bin/bash", "/app/miauflix-services-entrypoint.sh"]

# --- Service code, one layer each, so every image copies only what it runs ---
FROM runtime-base AS catalog-code
RUN mkdir -p /app/models /app/wasm && chown bunqueue:bunqueue /app/models /app/wasm
COPY --from=builder --chown=1001:1001 /workspace/services/media-catalog ./services/media-catalog
COPY --from=builder --chown=1001:1001 /workspace/services/list-service ./services/list-service
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@vladmandic/human/models/blazeface.json /app/models/blazeface.json
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@vladmandic/human/models/blazeface.bin /app/models/blazeface.bin
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@vladmandic/human/models/centernet.json /app/models/centernet.json
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@vladmandic/human/models/centernet.bin /app/models/centernet.bin
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm /app/wasm/tfjs-backend-wasm.wasm
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm /app/wasm/tfjs-backend-wasm-simd.wasm
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm /app/wasm/tfjs-backend-wasm-threaded-simd.wasm
ENV BACKDROP_FOCUS_MODEL_DIR=/app/models \
    BACKDROP_FOCUS_WASM_DIR=/app/wasm

# --- miauflix-catalog-services: Bunqueue, media catalog and lists. Talks to TMDB and Trakt only,
# so it never needs the VPN. ---
FROM catalog-code AS catalog-services
EXPOSE 3001 3002 6789 6790
CMD ["bunqueue", "media-catalog", "list-service"]

# --- miauflix-sources: source search on its own. Runs its own VPN check. ---
FROM runtime-base AS sources
COPY --from=builder --chown=1001:1001 /workspace/services/sources ./services/sources
# A standalone volume holds this service only, as in the earlier miauflix-sources image.
ENV SOURCES_DATA_DIR=/app/data
EXPOSE 3003
CMD ["sources"]

# --- miauflix-media-load: the torrent engine on its own. Runs its own VPN check. ---
# Debian, not the Alpine base: FFmpeg on musl decodes TrueHD about 8 times slower (42 s against
# 5 s for two minutes of 5.1), which held TV remuxes at about 3x real time instead of 20x. Its
# production dependencies are installed here, so native packages get their glibc binaries; the
# workspace packages it uses are plain JavaScript and come from the Alpine builder.
FROM oven/bun:1.4.0 AS media-load-builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs npm ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY package.json bun.lock turbo.json tsconfig.json ./
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
RUN --mount=type=cache,target=/root/.bun/install/cache \
    for attempt in 1 2 3; do \
      bun install --frozen-lockfile --production --ignore-scripts \
        --filter @miauflix/media-load-service && break; \
      [ "$attempt" = 3 ] && exit 1; \
      echo "bun install failed (attempt $attempt), retrying"; sleep 20; \
    done
# node-datachannel's prebuilt (glibc) binary, for the tracker client's WebRTC.
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3; do \
      npm rebuild node-datachannel && break; \
      [ "$attempt" = 3 ] && exit 1; \
      echo "node-datachannel download failed (attempt $attempt), retrying"; sleep 20; \
    done

FROM oven/bun:1.4.0 AS media-load
# FFmpeg builds the TV remuxes (HLS, audio converted to E-AC-3) of stored files. The entrypoint
# drops to the bunqueue user (uid 1001, as in the other images, so a shared volume keeps its
# owner) with su-exec, which gosu stands in for.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg gosu && \
    rm -rf /var/lib/apt/lists/* && \
    ln -s "$(command -v gosu)" /usr/local/bin/su-exec && \
    groupadd -g 1001 bunqueue && useradd -u 1001 -g 1001 -M -d /workspace -s /bin/bash bunqueue && \
    mkdir -p /app/data /usr/src/app/downloads && \
    chown -R bunqueue:bunqueue /app/data /usr/src/app/downloads
WORKDIR /workspace
COPY --from=media-load-builder --chown=1001:1001 /workspace/node_modules ./node_modules
COPY --from=builder --chown=1001:1001 /workspace/packages/source-metadata-extractor ./packages/source-metadata-extractor
COPY --from=builder --chown=1001:1001 /workspace/packages/contract ./packages/contract
COPY --from=builder --chown=1001:1001 /workspace/packages/service-contracts ./packages/service-contracts
COPY --from=builder --chown=1001:1001 /workspace/packages/service-configuration ./packages/service-configuration
COPY --from=builder --chown=1001:1001 /workspace/packages/vpn-guard ./packages/vpn-guard
COPY --from=builder --chown=1001:1001 /workspace/services/media-load ./services/media-load
COPY --chown=1001:1001 services/entrypoint.sh /app/miauflix-services-entrypoint.sh
COPY --chown=1001:1001 services/healthcheck.ts /app/healthcheck.ts
RUN chmod +x /app/miauflix-services-entrypoint.sh
# A standalone volume holds this service and, by default, its downloads, as in the earlier
# miauflix-media-load image.
ENV MEDIA_LOAD_PORT=3004 \
    MEDIA_LOAD_DATA_DIR=/app/data \
    MEDIA_LOAD_DEFAULT_DOWNLOAD_PATH=/app/data/downloads
VOLUME /app/data
EXPOSE 3004
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=10 CMD bun /app/healthcheck.ts
ENTRYPOINT ["/bin/bash", "/app/miauflix-services-entrypoint.sh"]
CMD ["media-load"]

# --- miauflix-services: every service in one container, to save resources. Also the default
# target. Override CMD to run a subset. ---
FROM catalog-code AS services
# FFmpeg for media-load's TV remuxes. On Alpine it decodes TrueHD about 8 times slower than the
# standalone miauflix-media-load image (Debian): remuxes still work, at about 3x real time.
RUN apk add --no-cache ffmpeg
COPY --from=builder --chown=1001:1001 /workspace/services/sources ./services/sources
COPY --from=builder --chown=1001:1001 /workspace/services/media-load ./services/media-load
EXPOSE 3001 3002 3003 3004 6789 6790
CMD ["bunqueue", "media-catalog", "list-service", "sources", "media-load"]
