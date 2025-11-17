#!/bin/bash

# Script to build and deploy frontend to Docker volume
# Builds frontend with production environment variables and syncs to frontend_static volume

set -e

# Source utility functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

VOLUME_NAME="frontend_static"
PROJECT_ROOT="${SCRIPT_DIR}/.."
FRONTEND_DIST_DIR="${PROJECT_ROOT}/dist/frontend"
TEMP_CONTAINER_NAME="miauflix-frontend-sync-$$"

# Check if Docker is available
if ! command_exists docker; then
    print_error "Docker is not installed or not in PATH"
    exit 1
fi

# Check if docker compose is available
DOCKER_COMPOSE_CMD=$(get_docker_compose_cmd)
if [ $? -ne 0 ]; then
    print_error "Docker Compose is not available"
    exit 1
fi

# Step 1: Build frontend with production environment variables
print_status "Building frontend with production environment variables..."
cd "${PROJECT_ROOT}"

# Use same environment variable as Dockerfile (VITE_API_URL=/)
export VITE_API_URL=/
npm run build:frontend

if [ ! -d "$FRONTEND_DIST_DIR" ]; then
    print_error "Frontend build failed or dist/frontend directory not found"
    exit 1
fi

print_status "Frontend built successfully"

# Step 2: Ensure volume exists
print_status "Checking if volume '$VOLUME_NAME' exists..."
if ! docker volume inspect "$VOLUME_NAME" > /dev/null 2>&1; then
    print_status "Volume '$VOLUME_NAME' does not exist, creating it..."
    docker volume create "$VOLUME_NAME"
    print_status "Volume created successfully"
else
    print_status "Volume '$VOLUME_NAME' already exists"
fi

# Step 3: Sync files to volume using temporary container
print_status "Syncing files to volume using temporary container..."

# Create temporary container with volume mounted
docker run --rm \
    --name "$TEMP_CONTAINER_NAME" \
    -v "$VOLUME_NAME:/target" \
    -v "$FRONTEND_DIST_DIR:/source:ro" \
    alpine:latest \
    sh -c "rm -rf /target/* && cp -r /source/* /target/ && chmod -R 755 /target"

if [ $? -eq 0 ]; then
    print_status "Files synced successfully to volume '$VOLUME_NAME'"
    print_status "Frontend deployment complete!"
    print_warning "Note: Nginx may need to be restarted to serve the new files"
    print_warning "Run: $DOCKER_COMPOSE_CMD restart nginx"
else
    print_error "Failed to sync files to volume"
    exit 1
fi

