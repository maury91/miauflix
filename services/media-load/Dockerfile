FROM oven/bun:1.4.0 AS bun-runtime

FROM node:22-slim AS runtime
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /workspace
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY backend-e2e/package.json backend-e2e/package.json
COPY packages/source-metadata-extractor/package.json packages/source-metadata-extractor/package.json
COPY packages/contract/package.json packages/contract/package.json
COPY packages/service-contracts/package.json packages/service-contracts/package.json
COPY packages/service-configuration/package.json packages/service-configuration/package.json
COPY services/list-service/package.json services/list-service/package.json
COPY services/sources/package.json services/sources/package.json
COPY services/media-load/package.json services/media-load/package.json
COPY services/media-catalog/package.json services/media-catalog/package.json
RUN sed -i 's/"prepare".*/"prepare": "echo skipped",/' packages/*/package.json || true
RUN npm ci --ignore-scripts
# bittorrent-tracker and WebTorrent load WebRTC; fetch node-datachannel's prebuilt binary.
RUN npm rebuild node-datachannel

COPY packages/source-metadata-extractor packages/source-metadata-extractor
COPY packages/contract packages/contract
COPY packages/service-contracts packages/service-contracts
COPY packages/service-configuration packages/service-configuration
COPY services/media-load services/media-load
RUN npm run build --workspace @miauflix/source-metadata-extractor && \
    npm run build --workspace @miauflix/contract && \
    npm run build --workspace @miauflix/service-contracts && \
    npm run build --workspace @miauflix/service-configuration

FROM runtime AS development
WORKDIR /workspace/services/media-load
CMD ["bun", "--watch", "src/index.ts"]

FROM runtime AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM bun-runtime AS production
WORKDIR /app
COPY --from=production-dependencies /workspace/node_modules /app/node_modules
COPY --from=runtime /workspace/packages/source-metadata-extractor /app/packages/source-metadata-extractor
COPY --from=runtime /workspace/packages/contract /app/packages/contract
COPY --from=runtime /workspace/packages/service-contracts /app/packages/service-contracts
COPY --from=runtime /workspace/packages/service-configuration /app/packages/service-configuration
COPY --from=runtime /workspace/services/media-load /app/services/media-load
# The service database, and the downloads at the path the backend used to keep them.
RUN mkdir -p /app/data /usr/src/app/downloads && chown -R bun:bun /app/data /usr/src/app/downloads
ENV MEDIA_LOAD_PORT=3004 \
    MEDIA_LOAD_DATA_DIR=/app/data
EXPOSE 3004
VOLUME /app/data
USER bun
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 CMD bun -e "fetch('http://127.0.0.1:' + (process.env.MEDIA_LOAD_PORT || 3004) + '/health').then(r => { if (!r.ok) process.exit(1) })"
CMD ["bun", "run", "/app/services/media-load/src/index.ts"]
