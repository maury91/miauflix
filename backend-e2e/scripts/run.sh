#!/bin/bash

# Docker-based Integration Test Runner Script
# This script uses Docker Compose to start all necessary services and run the tests

set -e

DOCKER_COMPOSE_FILE="docker/docker-compose.test.yml"
PROJECT_NAME="miauflix-tests"

echo "🧪 Starting Docker-based Integration Test Environment..."

# Find available ports
echo "🔍 Finding available ports..."
eval $($(dirname "$0")/find-port.sh)
echo "  🔌 Backend port: $PORT"

# Export the ports for docker-compose
export PORT

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up test environment..."
    docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE down -v --remove-orphans
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Navigate to the integration tests directory
cd "$(dirname "$0")/.."

# Load environment variables if .env exists
if [[ -f "../.env" ]]; then
    export $(grep -v '^#' ../.env | xargs)
    echo "🔧 Loaded environment variables from .env file"
else
    echo "⚠️  No .env file found, using default environment variables"
    export TMDB_API_ACCESS_TOKEN="mock-tmdb-token-for-testing"
    export TRAKT_CLIENT_ID="mock-trakt-client-id"
    export TRAKT_CLIENT_SECRET="mock-trakt-client-secret"
fi

# Make sure all previous containers are removed
echo "🧹 Removing any existing test containers..."
docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE down -v --remove-orphans

# Start all services
echo "🚀 Starting the test environment with Docker Compose..."
docker compose --env-file ../.env -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" up --build -d

# Wait for services to be ready (docker compose will handle dependency waiting)
echo "⏳ Waiting for all services to be ready..."
sleep 5

# Check if backend is ready
echo "🔍 Checking if backend is ready..."
MAX_ATTEMPTS=30
ATTEMPT=1
BACKEND_READY=false

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    if docker compose -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" ps | grep backend | grep "(healthy)" > /dev/null; then
        BACKEND_READY=true
        HEALTHY=true
        break
    fi
    echo "⏳ Waiting for backend to be ready (attempt $ATTEMPT/$MAX_ATTEMPTS)..."
    ATTEMPT=$((ATTEMPT+1))
    sleep 2
done

if [ "$BACKEND_READY" = false ]; then
    echo "❌ Backend failed to become ready. Exiting..."
    exit 1
fi

# Extract admin credentials using separate script
echo "🔍 Extracting admin credentials..."
if ! $(dirname "$0")/extract-credentials.sh 60 "$PROJECT_NAME" "$DOCKER_COMPOSE_FILE"; then
    echo "⚠️  Continuing without credentials - some tests may be skipped"
fi

# Run the tests
echo "🧪 Running integration tests..."

# Run the tests
npm test

echo "✅ E2E tests completed"
