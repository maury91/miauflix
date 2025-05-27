#!/bin/bash

# Test-only script - runs tests against already running Docker services
# This assumes you've already started the services with docker compose

set -e

echo "🧪 Running E2E tests against running services..."

# Navigate to the backend-e2e directory
cd "$(dirname "$0")/.."

# Check if backend service is running and healthy
echo "🔍 Checking if backend service is running..."

# Try to get the port from environment or use default
PORT=${PORT:-3000}
BACKEND_URL="http://localhost:$PORT"

# Test if backend is responding
if ! curl -f -s "$BACKEND_URL/health" > /dev/null; then
    echo "❌ Backend service is not responding at $BACKEND_URL"
    echo "💡 Make sure you've started the services first:"
    echo "   docker compose -f docker/docker-compose.test.yml up -d"
    echo "   or"
    echo "   docker compose -f docker/docker-compose.dev.yml up -d"
    exit 1
fi

echo "✅ Backend service is responding"

# Set environment variables for tests
export BACKEND_URL="$BACKEND_URL"

# Run the tests
echo "🧪 Running tests..."
npm test

echo "✅ Tests completed"