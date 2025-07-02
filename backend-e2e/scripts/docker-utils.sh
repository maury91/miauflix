#!/bin/bash

# Shared Docker utilities for E2E testing environment
# Used by env.sh and test-only.sh to avoid duplication

# Default constants (can be overridden by function arguments)
readonly DEFAULT_PROJECT_NAME="miauflix-dev"
readonly DEFAULT_DOCKER_COMPOSE_FILE="docker/docker-compose.dev.yml"

# Verbose logging helper
log_verbose() {
    if [[ "$VERBOSE" == "1" ]]; then
        echo "$@"
    fi
}

# Function to extract port from running containers
# Usage: extract_port_from_containers [project_name] [compose_file] [backend_e2e_dir]
extract_port_from_containers() {
    local project_name="${1:-$DEFAULT_PROJECT_NAME}"
    local compose_file="${2:-$DEFAULT_DOCKER_COMPOSE_FILE}"
    local backend_e2e_dir="${3:-.}"
    
    # Ensure we're in the right directory for docker compose commands
    local current_dir=$(pwd)
    cd "$backend_e2e_dir"
    
    # Try to get the port from the running backend container
    local container_port=$(docker compose -p "$project_name" -f "$compose_file" port backend 3000 2>/dev/null | cut -d: -f2)
    if [[ -n "$container_port" && "$container_port" =~ ^[0-9]+$ ]]; then
        cd "$current_dir"
        echo "$container_port"
        return 0
    fi
    
    # Fallback: try to get port from docker ps output
    container_port=$(docker ps --filter "name=${project_name}-backend" --format "table {{.Ports}}" | grep -o '[0-9]*:3000' | cut -d: -f1 | head -n1)
    if [[ -n "$container_port" && "$container_port" =~ ^[0-9]+$ ]]; then
        cd "$current_dir"
        echo "$container_port"
        return 0
    fi
    
    cd "$current_dir"
    return 1
}

# Function to check if containers are already running and healthy
# Usage: check_containers_running [project_name] [compose_file] [backend_e2e_dir]
check_containers_running() {
    local project_name="${1:-$DEFAULT_PROJECT_NAME}"
    local compose_file="${2:-$DEFAULT_DOCKER_COMPOSE_FILE}"
    local backend_e2e_dir="${3:-.}"
    
    log_verbose "🔍 Checking if containers are already running..."
    
    # Ensure we're in the right directory for docker compose commands
    local current_dir=$(pwd)
    cd "$backend_e2e_dir"
    
    # Check specifically if backend service is running (not just created)
    local backend_running=$(docker compose -p "$project_name" -f "$compose_file" ps backend --format "table {{.Service}}\t{{.State}}" 2>/dev/null | grep "running" | wc -l 2>/dev/null || echo "0")
    # Ensure backend_running is a valid number
    if ! [[ "$backend_running" =~ ^[0-9]+$ ]]; then
        backend_running=0
    fi
    
    # Also count all containers for diagnostic info
    local containers_running=$(docker compose -p "$project_name" -f "$compose_file" ps --format "table {{.Service}}\t{{.State}}" 2>/dev/null | grep -v "SERVICE" | grep -c "running" 2>/dev/null || echo "0")
    # Ensure we have a valid number
    if ! [[ "$containers_running" =~ ^[0-9]+$ ]]; then
        containers_running=0
    fi
    
    log_verbose "🐳 Found $containers_running running containers for project $project_name"
    
    cd "$current_dir"
    
    if [[ "$backend_running" -eq 0 ]]; then
        log_verbose "❌ Backend service is not running for project $project_name"
        return 1
    fi
    
    return 0
}

# Function to check if backend is healthy on a given port
# Usage: check_backend_health <port>
check_backend_health() {
    local port="$1"
    if [[ -z "$port" ]]; then
        log_verbose "❌ No port provided to check_backend_health"
        return 1
    fi
    
    log_verbose "🏥 Checking backend health on port $port..."
    if curl -s -f "http://localhost:$port/health" >/dev/null 2>&1; then
        log_verbose "✅ Backend is healthy and responding on port $port"
        return 0
    else
        log_verbose "❌ Backend not responding on port $port"
        return 1
    fi
}

# Function to get port from running containers and verify health
# Usage: get_running_backend_port [project_name] [compose_file] [backend_e2e_dir]
get_running_backend_port() {
    local project_name="${1:-$DEFAULT_PROJECT_NAME}"
    local compose_file="${2:-$DEFAULT_DOCKER_COMPOSE_FILE}"
    local backend_e2e_dir="${3:-.}"
    
    if ! check_containers_running "$project_name" "$compose_file" "$backend_e2e_dir"; then
        return 1
    fi
    
    # Extract the port from running containers
    local detected_port=$(extract_port_from_containers "$project_name" "$compose_file" "$backend_e2e_dir")
    if [[ -z "$detected_port" ]]; then
        log_verbose "❌ Could not detect port from running containers"
        return 1
    fi
    
    log_verbose "🔌 Detected backend running on port: $detected_port"
    
    # Check if backend is responding
    if check_backend_health "$detected_port"; then
        echo "$detected_port"
        return 0
    else
        return 1
    fi
} 