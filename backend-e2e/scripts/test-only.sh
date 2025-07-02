#!/bin/bash

# Test-only script - runs tests against already running Docker services
# This assumes you've already started the services with docker compose

set -e

echo "🧪 Running E2E tests against running services..."

# Navigate to the backend-e2e directory
cd "$(dirname "$0")/.."

# Import shared Docker utilities (now we're in backend-e2e, so scripts/ is relative to here)
source "scripts/docker-utils.sh"

# Define Docker configuration (defaults to dev environment)
PROJECT_NAME="miauflix-dev"
DOCKER_COMPOSE_FILE="docker/docker-compose.dev.yml"

# Check if backend service is running and healthy
echo "🔍 Checking if backend service is running..."

# Try to detect port from running containers, fallback to environment or default
if [[ -z "$PORT" ]]; then
    DETECTED_PORT=$(extract_port_from_containers "$PROJECT_NAME" "$DOCKER_COMPOSE_FILE" ".")
    if [[ -n "$DETECTED_PORT" ]]; then
        PORT="$DETECTED_PORT"
        echo "🔌 Detected backend running on port: $PORT"
    else
        PORT=3000
        echo "⚠️  Could not detect port, using default: $PORT"
    fi
else
    echo "🔌 Using provided PORT: $PORT"
fi

BACKEND_URL="http://localhost:$PORT"

# Test if backend is responding
if ! curl -f -s "$BACKEND_URL/health" > /dev/null; then
    echo "❌ Backend service is not responding at $BACKEND_URL"
    echo "💡 Make sure you've started the services first:"
    echo "   ./scripts/env.sh dev          # Interactive mode"
    echo "   ./scripts/env.sh dev -d       # Detached mode"
    echo "   npm run dev                   # Using package.json script"
    echo "   npm run dev:detached          # Using package.json script"
    exit 1
fi

echo "✅ Backend service is responding"

# Set environment variables for tests
export BACKEND_URL="$BACKEND_URL"

# Run the tests
echo "🧪 Running tests..."
npm test

echo "✅ Tests completed"