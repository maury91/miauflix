# Use the official Node.js image as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install curl for healthcheck and needed build tools
RUN apt-get update && apt-get install -y curl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json (if available)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies using npm
RUN npm install

# Expose the port the app runs on
EXPOSE 3000
EXPOSE 6499

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the backend service in debug mode
CMD ["npm", "run", "start", "--workspace=backend"]