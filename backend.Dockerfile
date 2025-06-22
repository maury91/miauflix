# Use the official Node.js image as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install curl for healthcheck and needed build tools
RUN apt-get update && apt-get install -y curl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json (if available)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY tsconfig.json ./tsconfig.json

# Copy the packages that backend depends on
COPY packages/ ./packages/

# Install all dependencies for building
RUN npm ci && npm cache clean --force

# Copy backend source code (needed for TypeScript project references)
COPY backend/ ./backend/

# Build backend first (required for backend-client project reference), then other packages
RUN npm run build:libs && npm run build --workspace=backend 

# Move node_modules to the dist directory
RUN mv ./backend/node_modules ./dist/backend/node_modules && \
    rm -rf ./backend && \
    mv ./dist/backend ./backend && \
    rm -rf ./dist

# Create a non-root user for security
RUN groupadd -r miauflix && useradd -r -g miauflix miauflix
RUN chown -R miauflix:miauflix /usr/src/app
USER miauflix

# Expose the port the app runs on
EXPOSE 3000
EXPOSE 6499

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the backend service using the built JavaScript files
CMD ["node", "--env-file", ".env", "./backend/app.js"]