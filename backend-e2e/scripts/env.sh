#!/bin/bash

# Unified environment script for both development and testing
# Usage:
#   ./scripts/env.sh dev                                    # Start development environment  
#   ./scripts/env.sh test                                   # Run all tests
#   ./scripts/env.sh test movie.test.ts                     # Run specific test file
#   ./scripts/env.sh test --testNamePattern="Movie"         # Run tests matching pattern

set -e

MODE="$1"

script_dir=$(dirname $(realpath "$0"))
backend_e2e_dir=$(dirname "$script_dir")
root_dir=$(dirname "$backend_e2e_dir")
log_file="$backend_e2e_dir/logs/$(date +'%Y-%m-%d_%H-%M-%S').log"

mkdir -p "$(dirname "$log_file")"

shift # Remove first argument, rest are test arguments

if [[ "$MODE" != "dev" && "$MODE" != "test" ]]; then
    echo "❌ Usage: $0 <dev|test> [test-args...]"
    echo ""
    echo "Examples:"
    echo "  $0 dev                                    # Start development environment"
    echo "  $0 test                                   # Run all tests"
    echo "  $0 test movie.test.ts                     # Run specific test"
    echo "  $0 test --testNamePattern=\"Movie\"        # Run matching tests"
    exit 1
fi

# Set configuration based on mode
if [[ "$MODE" == "dev" ]]; then
    DOCKER_COMPOSE_FILE="docker/docker-compose.dev.yml"
    PROJECT_NAME="miauflix-dev"
    DESCRIPTION="Development Environment with Hot Reloading"
else
    DOCKER_COMPOSE_FILE="docker/docker-compose.test.yml"
    PROJECT_NAME="miauflix-tests"
    DESCRIPTION="Docker-based Integration Test Environment"
fi

cd "$root_dir"

echo "🚀 Starting $DESCRIPTION..."

# Find available ports
echo "🔍 Finding available ports..."
eval $($script_dir/find-port.sh)
echo "  🔌 Backend port: $PORT"

# Export the ports for docker-compose
export PORT

# Function to cleanup artifacts
cleanupArtifacts() {
    echo "🧹 Cleaning up previous build artifacts..."
    cd ${backend_e2e_dir}
    rm -rf docker/dist
}

# Function to cleanup on exit
cleanup() {
    TERM_SIGNAL=$?
    if [[ $TERM_SIGNAL -ne 0 ]]; then
        echo "⚠️  Script terminated with signal $TERM_SIGNAL"
        # docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE logs --tail '5000'
        if [[ -f $log_file ]]; then
            tail -n 100 "$log_file"
        fi
    fi
    if [[ -n $logged_pid ]]; then
        kill $logged_pid || true
    fi
    if [[ -f $log_file ]]; then
        echo "📜 Full Logs saved to $log_file"
    else
        echo "⚠️  No logs were generated"
    fi
    echo "🧹 Cleaning up $MODE environment..."
    cleanupArtifacts
    docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE down -v --remove-orphans
    exit $TERM_SIGNAL
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Build libraries
npm run build:libs

# Clean up previous build artifacts
cleanupArtifacts
cd ${root_dir}
mkdir -p backend-e2e/docker/dist

# Copy new build artifacts
cp -r packages/yts-sanitizer backend-e2e/docker/dist

# Navigate to the integration tests directory
cd ${backend_e2e_dir}

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
echo "🧹 Removing any existing $MODE containers..."
docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE down -v --remove-orphans

# Start all services
echo "🚀 Starting the $MODE environment with Docker Compose..."
if [[ "$MODE" == "dev" ]]; then
    docker compose --env-file ../.env -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" up --build -d
else
    docker compose --env-file ../.env -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" up --build -d
fi

docker compose -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" logs --since 1m  --follow &> "$log_file" &
logged_pid=$!
cleanupArtifacts

# Wait for services to start
echo "⏳ Waiting for services to start..."
if [[ "$MODE" == "dev" ]]; then
    sleep 2
else
    sleep 5
    
    # For test mode, check if backend is ready
    echo "🔍 Checking if backend is ready..."
    MAX_ATTEMPTS=30
    ATTEMPT=1
    BACKEND_READY=false

    while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
        if docker compose -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" ps | grep backend | grep "(healthy)" > /dev/null; then
            BACKEND_READY=true
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
fi

# Extract admin credentials using separate script
echo "🔍 Extracting admin credentials..."
if ! ./scripts/extract-credentials.sh 60 "$PROJECT_NAME" "$DOCKER_COMPOSE_FILE"; then
    echo "⚠️  Continuing without credentials - some tests may be skipped"
fi

if [[ "$MODE" == "dev" ]]; then
    # Development mode - keep running
    echo "🎯 Development environment is running!"
    echo "   Backend: http://localhost:$PORT"
    echo "   To view logs: docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE logs -f"
    echo "   To stop: docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE down"
    echo ""
    echo "📡 Press Ctrl+C to stop the development environment"
    
    # Keep script running until interrupted
    while true; do
        sleep 1
    done
else
    # Test mode - run tests and exit
    echo "🧪 Running integration tests..."
    
    # Pass any additional arguments to npm test (e.g., test name patterns)
    if [ $# -gt 0 ]; then
        echo "🎯 Running specific tests: $*"
        npm test -- "$@"
    else
        echo "🧪 Running all tests..."
        npm test
    fi
    
    echo "✅ E2E tests completed"
fi
