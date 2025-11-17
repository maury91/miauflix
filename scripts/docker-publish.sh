#!/bin/bash

# MiauFlix Docker Image Management Script
# This script helps with building, tagging, and pushing Docker images to GitHub Container Registry

set -e

# Source utility functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

# Configuration
REGISTRY="ghcr.io"
REPOSITORY="${GITHUB_REPOSITORY:-$(git config --get remote.origin.url | sed 's/.*github.com[:\/]\([^\/]*\/[^\/]*\).*/\1/' | sed 's/\.git$//')}"
VERSION="${1:-latest}"

# Check if user is logged in to GitHub Container Registry
check_login() {
    print_status "Checking GitHub Container Registry login..."
    if ! docker info | grep -q "ghcr.io"; then
        print_warning "You may need to login to GitHub Container Registry"
        echo "Run: echo \$GITHUB_TOKEN | docker login ghcr.io -u \$GITHUB_USERNAME --password-stdin"
        echo "Or: docker login ghcr.io"
    fi
}

# Build images
build_images() {
    print_status "Building MiauFlix Docker image..."
    
    export DOCKER_BUILDKIT=1
    print_status "Building and compiling backend image..."
    docker build -t "${REGISTRY}/${REPOSITORY}:${VERSION}" \
                 -t "${REGISTRY}/${REPOSITORY}:latest" \
                 -f Dockerfile .
    
    print_status "Backend image built successfully!"
}

# Push images
push_images() {
    print_status "Pushing image to GitHub Container Registry..."
    
    # Push backend image
    docker push "${REGISTRY}/${REPOSITORY}:${VERSION}"
    if [ "$VERSION" != "latest" ]; then
        docker push "${REGISTRY}/${REPOSITORY}:latest"
    fi
}

# List images
list_images() {
    print_status "Local MiauFlix Docker image:"
    docker images | grep -E "(${REPOSITORY}|miauflix)" || echo "No MiauFlix images found locally"
}

# Clean up old images
cleanup_images() {
    print_status "Cleaning up old Docker images..."
    docker image prune -f
    docker builder prune -f
}

# Show usage
usage() {
    echo "Usage: $0 [VERSION] [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build     Build Docker images"
    echo "  push      Push images to registry (requires build first)"
    echo "  deploy    Build and push images"
    echo "  list      List local MiauFlix images"
    echo "  cleanup   Clean up old Docker images"
    echo "  login     Show login instructions"
    echo ""
    echo "Examples:"
    echo "  $0 v1.0.0 deploy    # Build and push version 1.0.0"
    echo "  $0 latest build     # Build latest version"
    echo "  $0 list             # List local images"
}

# Main logic
case "${2:-deploy}" in
    "build")
        build_images
        ;;
    "push")
        check_login
        push_images
        ;;
    "deploy")
        build_images
        check_login
        push_images
        ;;
    "list")
        list_images
        ;;
    "cleanup")
        cleanup_images
        ;;
    "login")
        check_login
        ;;
    "help"|"--help"|"-h")
        usage
        ;;
    *)
        print_error "Unknown command: ${2}"
        usage
        exit 1
        ;;
esac

print_status "Operation completed successfully!"
echo ""
echo "Your image is available at:"
echo "  ${REGISTRY}/${REPOSITORY}:${VERSION}"
