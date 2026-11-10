# Development Dockerfile for backend with hot reloading
FROM oven/bun:1.4.0 AS bun-runtime

FROM node:22-slim
# The backend runs on Bun; npm installs the workspaces and builds the shared packages.
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y curl python3 make g++ gosu && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and build config
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY backend/package.json backend/tsconfig.json ./backend/
COPY frontend/package.json ./frontend/
COPY services/media-catalog/package.json ./services/media-catalog/
COPY services/list-service/package.json ./services/list-service/

# Copy the packages that backend depends on
COPY packages/ ./packages/

# Install dependencies with npm cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Build workspace packages that backend depends on
RUN npm run build:libs

# Copy backend source (will be overridden by volume mount)
COPY backend/ ./backend/

COPY .env ./backend

# Create entrypoint script to handle dynamic user permissions like LinuxServer.io
COPY backend-e2e/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create necessary directories
RUN mkdir -p /usr/src/app/data && \
    mkdir -p /usr/src/app/public && \
    touch /usr/src/app/.env

# Create default user but we'll override this at runtime
RUN groupadd -g 1000 miauflix 2>/dev/null || true && \
    useradd -u 1000 -g 1000 -m -s /bin/bash miauflix 2>/dev/null || true

# Expose port
EXPOSE 3000

# Set working directory to backend
WORKDIR /usr/src/app

# Use entrypoint to handle user permissions dynamically
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Bun restarts the backend when a file it imports changes. Run it from the root,
# where tsconfig.json enables the legacy decorators for path-aliased modules.
CMD ["bun", "--watch", "--env-file=backend/.env", "backend/src/app.ts"]
