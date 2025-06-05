FROM oven/bun:latest

# Install wget for healthcheck
RUN apt-get update && apt-get install -y wget && apt-get clean

WORKDIR /app

# Copy package.json and install dependencies
COPY mock/yts-package.json ./package.json
COPY mock/tsconfig.json ./

# Copy the yts-sanitizer package to the expected relative path
COPY dist/yts-sanitizer/ ./yts-sanitizer
RUN bun install

# Copy source code
COPY mock/ ./

# Expose port
EXPOSE 3000

# Copy YTS-specific sanitizer to replace the identity sanitizer
COPY mock/yts/yts.sanitize.ts ./sanitize.ts

# Start the mock server using the "start" script from package.json
CMD ["bun", "start"]
