FROM oven/bun:latest

# Install wget for healthcheck
RUN apt-get update && apt-get install -y wget && apt-get clean

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
COPY tsconfig.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install

# Copy source code
COPY . ./

# Expose port
EXPOSE 80

# Start the mock server using the "start" script from package.json
CMD ["bun", "start"]
