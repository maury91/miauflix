FROM oven/bun:1.4.0 AS bun-runtime

FROM node:22-slim AS runtime
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
COPY services/list-service/package.json services/list-service/package.json
COPY services/media-catalog/package.json services/media-catalog/package.json
RUN sed -i 's/"prepare".*/"prepare": "echo skipped",/' packages/*/package.json || true
RUN npm ci --ignore-scripts

COPY packages/service-contracts packages/service-contracts
COPY services/list-service services/list-service
RUN npm run build --workspace @miauflix/service-contracts

FROM runtime AS development
COPY --from=runtime /workspace /workspace
WORKDIR /workspace/services/list-service
CMD ["bun", "--watch", "src/index.ts"]

FROM bun-runtime AS production
WORKDIR /app
COPY --from=runtime /workspace/node_modules /app/node_modules
COPY --from=runtime /workspace/packages/service-contracts /app/packages/service-contracts
COPY --from=runtime /workspace/services/list-service /app/services/list-service
ENV LIST_SERVICE_DATA_DIR=/app/data
RUN mkdir -p /app/data
VOLUME /app/data
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 CMD bun -e "fetch('http://localhost:3002/health').then(r => { if (!r.ok) process.exit(1) })"
CMD ["bun", "run", "/app/services/list-service/src/index.ts"]
