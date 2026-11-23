# Build context is the repository root so the service can consume shared contracts.
FROM oven/bun:1.4.0 AS bun-runtime

FROM node:22-slim AS builder
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
COPY packages/anime-mapping packages/anime-mapping
COPY services/media-catalog services/media-catalog
RUN npm run build --workspace @miauwatch/source-metadata-extractor && \
    npm run build --workspace @miauwatch/contract && \
    npm run build --workspace @miauwatch/service-contracts && \
    npm run build --workspace @miauwatch/anime-mapping && \
    npm run build --workspace @miauwatch/service-configuration && \
    bun build services/media-catalog/src/index.ts --target=bun --external sharp --outfile=/tmp/media-catalog.js

FROM builder AS development
# glibc gives every thread its own malloc arena and rarely returns freed memory; with
# native work on many threads (crypto/sqlite in Node, libvips/WASM in Bun) RSS only grows.
ENV MALLOC_ARENA_MAX=2
WORKDIR /workspace/services/media-catalog
CMD ["bun", "--watch", "src/index.ts"]

FROM bun-runtime AS production
# DejaVu: card images draw Greek and Cyrillic names, which the bundled Poppins lacks
RUN apt-get update && apt-get install -y --no-install-recommends wget fonts-dejavu-core && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /tmp/media-catalog.js ./index.js
# sharp loads its native addon and libvips from the @img package for this platform, which a bundle
# cannot hold: it stays external and ships with its dependencies (without them Bun would try to
# install it from the registry at startup, and fail offline)
COPY --from=builder /workspace/node_modules/sharp ./node_modules/sharp
COPY --from=builder /workspace/node_modules/@img ./node_modules/@img
COPY --from=builder /workspace/node_modules/detect-libc ./node_modules/detect-libc
COPY --from=builder /workspace/node_modules/semver ./node_modules/semver
# CatalogDatabase resolves Drizzle migrations relative to the bundled entrypoint.
COPY --from=builder /workspace/services/media-catalog/src/db/migrations ./migrations
# The font card images draw a title's name in when it has no logo
COPY --from=builder /workspace/services/media-catalog/assets/fonts ./fonts
# Keep the face detector self-contained in the runtime image. Only the model
# used by backdrop focus and the WASM binaries are needed.
COPY --from=builder /workspace/node_modules/@vladmandic/human/models/blazeface.json ./models/blazeface.json
COPY --from=builder /workspace/node_modules/@vladmandic/human/models/blazeface.bin ./models/blazeface.bin
# CenterNet provides a scene-level person signal that lets stylized animal faces
# use BlazeFace's lower-confidence candidates without accepting statue/background false positives.
COPY --from=builder /workspace/node_modules/@vladmandic/human/models/centernet.json ./models/centernet.json
COPY --from=builder /workspace/node_modules/@vladmandic/human/models/centernet.bin ./models/centernet.bin
COPY --from=builder /workspace/node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm ./wasm/tfjs-backend-wasm.wasm
COPY --from=builder /workspace/node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm ./wasm/tfjs-backend-wasm-simd.wasm
COPY --from=builder /workspace/node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm ./wasm/tfjs-backend-wasm-threaded-simd.wasm

# glibc gives every thread its own malloc arena and rarely returns freed memory; with
# native work on many threads (crypto/sqlite in Node, libvips/WASM in Bun) RSS only grows.
ENV MALLOC_ARENA_MAX=2
ENV DATA_DIR=/app/data
ENV BACKDROP_FOCUS_MODEL_DIR=/app/models
ENV BACKDROP_FOCUS_WASM_DIR=/app/wasm
ENV CARD_IMAGE_FONT_FILE=/app/fonts/Poppins-SemiBold.ttf
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
