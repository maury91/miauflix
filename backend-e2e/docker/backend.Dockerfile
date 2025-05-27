# Production Dockerfile for Miauflix Backend
FROM node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json files
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

# Install dependencies
RUN npm install

# Copy backend source code and configuration
COPY backend/ ./backend/
COPY backend-e2e/.env.test ./.env

# Build TypeScript (optional, since the app can run with loader.js)
RUN npm run build --workspace=backend || true

# Create directories for data
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/app/data/

# Expose ports
EXPOSE 3000
EXPOSE 6499

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "run", "start", "--workspace=backend"]
