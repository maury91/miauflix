FROM oven/bun:latest

# Install wget for healthcheck
RUN apt-get update && apt-get install -y wget && apt-get clean

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
COPY tsconfig.json ./
RUN bun install

# Copy source code
COPY . ./

# Expose port
EXPOSE 3000

# Copy Trakt-specific request handler to enable POST OAuth support
COPY trakt/trakt.handleRequest.ts ./handleRequest.ts

# Start the mock server using the "start" script from package.json
CMD ["bun", "start"]