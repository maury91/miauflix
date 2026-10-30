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
COPY packages/yts-sanitizer/package.json packages/yts-sanitizer/package.json
COPY packages/therarbg-sanitizer/package.json packages/therarbg-sanitizer/package.json
COPY packages/contract/package.json packages/contract/package.json
COPY packages/service-contracts/package.json packages/service-contracts/package.json
COPY packages/service-configuration/package.json packages/service-configuration/package.json
COPY services/media-catalog/package.json services/media-catalog/package.json
COPY services/list-service/package.json services/list-service/package.json

RUN sed -i 's/"prepare".*/"prepare": "echo skipped",/' packages/*/package.json || true
# The base image sets NODE_ENV=production; the build needs dev dependencies (TypeScript types),
# which the `npm prune --omit=dev` below removes again.
RUN npm ci --ignore-scripts --include=dev

COPY packages/contract packages/contract
COPY packages/service-contracts packages/service-contracts
COPY packages/service-configuration packages/service-configuration
COPY services/media-catalog services/media-catalog
COPY services/list-service services/list-service
RUN npm run build --workspace @miauflix/contract && \
    npm run build --workspace @miauflix/service-contracts && \
    npm run build --workspace @miauflix/service-configuration && \
    npm prune --omit=dev --ignore-scripts

FROM ghcr.io/egeominotti/bunqueue:2.8.61 AS runtime

USER root
RUN apk add --no-cache bash && \
    mkdir -p /app/data/bunqueue /app/data/catalog /app/data/list-service /app/models /app/wasm && \
    chown -R bunqueue:bunqueue /app/data /app/models /app/wasm

WORKDIR /workspace
COPY --from=builder --chown=1001:1001 /workspace/node_modules ./node_modules
COPY --from=builder --chown=1001:1001 /workspace/packages/contract ./packages/contract
COPY --from=builder --chown=1001:1001 /workspace/packages/service-contracts ./packages/service-contracts
COPY --from=builder --chown=1001:1001 /workspace/packages/service-configuration ./packages/service-configuration
COPY --from=builder --chown=1001:1001 /workspace/services/media-catalog ./services/media-catalog
COPY --from=builder --chown=1001:1001 /workspace/services/list-service ./services/list-service

COPY --from=builder --chown=1001:1001 /workspace/node_modules/@vladmandic/human/models/blazeface.json /app/models/blazeface.json
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@vladmandic/human/models/blazeface.bin /app/models/blazeface.bin
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@vladmandic/human/models/centernet.json /app/models/centernet.json
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@vladmandic/human/models/centernet.bin /app/models/centernet.bin
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm /app/wasm/tfjs-backend-wasm.wasm
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm /app/wasm/tfjs-backend-wasm-simd.wasm
COPY --from=builder --chown=1001:1001 /workspace/node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm /app/wasm/tfjs-backend-wasm-threaded-simd.wasm

COPY --chown=1001:1001 services/entrypoint.sh /app/miauflix-services-entrypoint.sh
RUN chmod +x /app/miauflix-services-entrypoint.sh

ENV CATALOG_DATA_DIR=/app/data/catalog \
    CATALOG_PORT=3001 \
    LIST_SERVICE_DATA_DIR=/app/data/list-service \
    LIST_SERVICE_PORT=3002 \
    DATA_PATH=/app/data/bunqueue/bunqueue.db \
    TCP_PORT=6789 \
    HTTP_PORT=6790 \
    BACKDROP_FOCUS_MODEL_DIR=/app/models \
    BACKDROP_FOCUS_WASM_DIR=/app/wasm

EXPOSE 3001 3002 6789 6790
VOLUME /app/data
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=10 \
  CMD bun -e "await Promise.all(['http://127.0.0.1:3001/health','http://127.0.0.1:3002/health','http://127.0.0.1:6790/health'].map(async url => { const response = await fetch(url); if (!response.ok) throw new Error(url + ' returned ' + response.status) }))"

USER bunqueue
ENTRYPOINT ["/bin/bash", "/app/miauflix-services-entrypoint.sh"]
