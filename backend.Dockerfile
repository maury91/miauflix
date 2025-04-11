# Use the official Bun image as a parent image
FROM oven/bun:latest

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and bun.lockb
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies using Bun
RUN bun install

# Expose the port the app runs on
EXPOSE 9229

# Start the backend service in debug mode
CMD ["bun", "--inspect", "--pwd", "backend", "src/app.ts"]