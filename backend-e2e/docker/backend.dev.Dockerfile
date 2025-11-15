# Development Dockerfile for backend with hot reloading
FROM node:22-slim

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y curl python3 make g++ gosu && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Copy the packages that backend depends on
COPY packages/ ./packages/

# Install dependencies with npm cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy backend source (will be overridden by volume mount)
COPY backend/ ./backend/

# Install nodemon globally for hot reloading with npm cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install -g nodemon tsx

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

# Start with nodemon for hot reloading
CMD ["nodemon", "--watch", "backend/src", "--ext", "ts", "--exec", "node --env-file backend/.env --experimental-specifier-resolution=node --loader ./backend/loader.js", "backend/src/app.ts"]
