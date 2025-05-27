#!/bin/bash

# Development environment setup script
# Starts services with hot reloading for development

set -e

DOCKER_COMPOSE_FILE="docker/docker-compose.dev.yml"
PROJECT_NAME="miauflix-dev"

echo "🚀 Starting Development Environment with Hot Reloading..."

# Find available ports
echo "🔍 Finding available ports..."
eval $($(dirname "$0")/find-port.sh)
echo "  🔌 Backend port: $PORT"

# Export the ports for docker-compose
export PORT

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up development environment..."
    docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE down -v --remove-orphans
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Navigate to the integration tests directory
cd "$(dirname "$0")/.."
export $(cat ../.env | xargs)

# Make sure all previous containers are removed
echo "🧹 Removing any existing development containers..."
docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE down -v --remove-orphans

# Start all services in detached mode
echo "🚀 Starting the development environment with Docker Compose..."
docker compose --env-file ../.env -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" up --build -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 2

# Extract admin credentials using separate script
echo "🔍 Extracting admin credentials..."
if ! $(dirname "$0")/extract-credentials.sh 60 "$PROJECT_NAME" "$DOCKER_COMPOSE_FILE"; then
    echo "⚠️  Continuing without credentials - some tests may be skipped"
fi

echo "🎯 Development environment is running!"
echo "   Backend: http://localhost:$PORT"
echo "   To view logs: docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE logs -f"
echo "   To stop: docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE down"

# Keep script running until interrupted
echo "📡 Press Ctrl+C to stop the development environment"
while true; do
    sleep 1
done
