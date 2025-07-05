# Use the official Node.js image as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install curl for healthcheck, needed build tools, and gosu for user switching
RUN apt-get update && \
    apt-get install -y curl python3 make g++ gosu && \
    rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json (if available)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY tsconfig.json ./tsconfig.json

# Copy the packages that backend depends on
COPY packages/ ./packages/

RUN npm ci && npm cache clean --force
RUN npm run build:libs

# Build backend
COPY backend/ ./backend/
RUN npm run build --workspace=backend 

# Move node_modules to the dist directory
RUN mv ./backend/node_modules ./dist/backend/node_modules && \
    rm -rf ./backend && \
    mv ./dist/backend ./backend && \
    rm -rf ./dist

# Create entrypoint script to handle dynamic user permissions like LinuxServer.io
COPY backend-e2e/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create necessary directories
RUN mkdir -p /usr/src/app/data && \
    touch /usr/src/app/.env

# Create default user but we'll override this at runtime
RUN groupadd -g 1000 miauflix 2>/dev/null || true && \
    useradd -u 1000 -g 1000 -m -s /bin/bash miauflix 2>/dev/null || true

# Expose the port the app runs on
EXPOSE 3000
EXPOSE 6499

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use entrypoint to handle user permissions dynamically
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Start the backend service using the built JavaScript files
CMD ["node", "--env-file", ".env", "./backend/app.js"]