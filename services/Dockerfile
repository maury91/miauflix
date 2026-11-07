# Bunqueue 2.8.61's compiled server and its executable expect the Bun Alpine
# runtime. Build the application dependencies on the same base so native
# packages such as sharp use the matching musl binaries.
FROM ghcr.io/egeominotti/bunqueue:2.8.61 AS builder

USER root
RUN apk add --no-cache nodejs npm

WORKDIR /workspace
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY backend-e2e/package.json backend-e2e/package.json
COPY packages/source-metadata-extractor/package.json packages/source-metadata-extractor/package.json
COPY packages/contract/package.json packages/contract/package.json
COPY packages/service-contracts/package.json packages/service-contracts/package.json
COPY packages/service-configuration/package.json packages/service-configuration/package.json
COPY services/media-catalog/package.json services/media-catalog/package.json
COPY services/list-service/package.json services/list-service/package.json
COPY services/sources/package.json services/sources/package.json
COPY services/media-load/package.json services/media-load/package.json

RUN sed -i 's/"prepare".*/"prepare": "echo skipped",/' packages/*/package.json || true
# The base image sets NODE_ENV=production; the build needs dev dependencies (TypeScript types),
# which the `npm prune --omit=dev` below removes again.
RUN npm ci --ignore-scripts --include=dev
# media-load's tracker client loads WebRTC; fetch node-datachannel's prebuilt (musl) binary.
RUN npm rebuild node-datachannel

COPY packages/source-metadata-extractor packages/source-metadata-extractor
COPY packages/contract packages/contract
COPY packages/service-contracts packages/service-contracts
COPY packages/service-configuration packages/service-configuration
COPY services/media-catalog services/media-catalog
COPY services/list-service services/list-service
COPY services/sources services/sources
COPY services/media-load services/media-load
RUN npm run build --workspace @miauflix/source-metadata-extractor && \
    npm run build --workspace @miauflix/contract && \
    npm run build --workspace @miauflix/service-contracts && \
    npm run build --workspace @miauflix/service-configuration && \
    npm prune --omit=dev --ignore-scripts

# Shared by both runtime images: the same base, user, data layout and entrypoint. Both containers
# can mount the same /app/data volume; each service keeps its own subdirectory.
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

COPY --chown=1001:1001 services/entrypoint.sh /app/miauflix-services-entrypoint.sh
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
# The entrypoint starts as root only to hand its data (and the downloads volume) to bunqueue, then
# drops to it. CMD names the services the container runs.
ENTRYPOINT ["/bin/bash", "/app/miauflix-services-entrypoint.sh"]

# --- miauflix-catalog-services: Bunqueue, media catalog and lists. Talks to TMDB and Trakt only,
# so it needs no VPN. ---
FROM runtime-base AS catalog-services

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

EXPOSE 3001 3002 6789 6790
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=10 \
  CMD bun -e "await Promise.all(['http://127.0.0.1:' + (process.env.CATALOG_PORT || 3001) + '/health','http://127.0.0.1:' + (process.env.LIST_SERVICE_PORT || 3002) + '/health','http://127.0.0.1:' + (process.env.HTTP_PORT || 6790) + '/health'].map(async url => { const response = await fetch(url); if (!response.ok) throw new Error(url + ' returned ' + response.status) }))"
CMD ["bunqueue", "media-catalog", "list-service"]

# --- miauflix-video-services: source search and media load (the torrent engine and its
# downloads). Everything that reaches indexers, trackers and peers: run it behind the VPN. ---
FROM runtime-base AS video-services

COPY --from=builder --chown=1001:1001 /workspace/services/sources ./services/sources
COPY --from=builder --chown=1001:1001 /workspace/services/media-load ./services/media-load

EXPOSE 3003 3004
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=10 \
  CMD bun -e "await Promise.all(['http://127.0.0.1:' + (process.env.SOURCES_PORT || 3003) + '/health','http://127.0.0.1:' + (process.env.MEDIA_LOAD_PORT || 3004) + '/health'].map(async url => { const response = await fetch(url); if (!response.ok) throw new Error(url + ' returned ' + response.status) }))"
CMD ["sources", "media-load"]

# --- miauflix-services (deprecated): all of the above in one container, for deployments that
# still use the compose files from before the split. Watchtower keeps updating them. ---
FROM catalog-services AS services

COPY --from=builder --chown=1001:1001 /workspace/services/sources ./services/sources
COPY --from=builder --chown=1001:1001 /workspace/services/media-load ./services/media-load

EXPOSE 3001 3002 3003 3004 6789 6790
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=10 \
  CMD bun -e "await Promise.all(['http://127.0.0.1:' + (process.env.CATALOG_PORT || 3001) + '/health','http://127.0.0.1:' + (process.env.LIST_SERVICE_PORT || 3002) + '/health','http://127.0.0.1:' + (process.env.SOURCES_PORT || 3003) + '/health','http://127.0.0.1:' + (process.env.MEDIA_LOAD_PORT || 3004) + '/health','http://127.0.0.1:' + (process.env.HTTP_PORT || 6790) + '/health'].map(async url => { const response = await fetch(url); if (!response.ok) throw new Error(url + ' returned ' + response.status) }))"
CMD ["bunqueue", "media-catalog", "list-service", "sources", "media-load"]
