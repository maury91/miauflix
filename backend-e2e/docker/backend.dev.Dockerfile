# Development Dockerfile for backend with hot reloading
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

# Copy package files
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

# Install dependencies
RUN npm install

# Copy backend source (will be overridden by volume mount)
COPY backend/ ./backend/

# Install nodemon globally for hot reloading
RUN npm install -g nodemon tsx

# Create directories for data
RUN mkdir -p /app/data

ENV DATA_DIR=/app/data/

COPY .env ./backend/.env

# Expose port
EXPOSE 3000

# Set working directory to backend
WORKDIR /usr/src/app/backend

# Start with nodemon for hot reloading
CMD ["nodemon", "--watch", "src", "--ext", "ts", "--exec", "node --env-file .env --experimental-specifier-resolution=node --loader ./loader.js", "src/app.ts"]
