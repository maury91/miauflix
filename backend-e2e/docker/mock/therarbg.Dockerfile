FROM oven/bun:latest

# Install wget for healthcheck
RUN apt-get update && apt-get install -y wget && apt-get clean

WORKDIR /app

# Copy package.json and install dependencies
COPY mock/therarbg-package.json ./package.json
COPY mock/tsconfig.json ./

# Copy the therarbg-sanitizer package to the expected relative path
COPY dist/therarbg-sanitizer/ ./therarbg-sanitizer
COPY dist/source-metadata-extractor/ ./source-metadata-extractor
RUN bun install

# Copy source code
COPY mock/ ./

# Expose port
EXPOSE 3000

# Copy TheRARBG-specific sanitizer to replace the identity sanitizer
COPY mock/therarbg/therarbg.sanitize.ts ./sanitize.ts

# Start the mock server using the "start" script from package.json
CMD ["bun", "start"] 