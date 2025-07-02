#!/bin/bash

# Stop script for miauflix development environment
# Usage: ./scripts/stop.sh

set -e

script_dir=$(dirname $(realpath "$0"))
backend_e2e_dir=$(dirname "$script_dir")
root_dir=$(dirname "$backend_e2e_dir")

# Configuration for development environment
DOCKER_COMPOSE_FILE="docker/docker-compose.dev.yml"
PROJECT_NAME="miauflix-dev"

echo "🛑 Stopping miauflix development environment..."

cd "$backend_e2e_dir"

# Stop and remove containers, networks, and volumes
docker compose -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" down -v --remove-orphans

# Clean up build artifacts
echo "🧹 Cleaning up build artifacts..."
rm -rf docker/dist

# Cleanup old log files using common script
$script_dir/cleanup-logs.sh

echo "✅ Development environment stopped successfully"
echo "   All containers, networks, and volumes have been removed"