#!/bin/bash

# Extract admin credentials from backend Docker logs
# This script monitors Docker logs for admin user creation and saves credentials to JSON

set -e

# Default values (can be overridden)
PROJECT_NAME="miauflix-dev"
DOCKER_COMPOSE_FILE="docker/docker-compose.dev.yml"

# Function to extract credentials from logs
extract_credentials() {
    local timeout=${1:-60}
    local project_name=${2:-$PROJECT_NAME}
    local compose_file=${3:-$DOCKER_COMPOSE_FILE}
    local credentials_file="./admin-credentials.json"
    
    echo "👀 Monitoring logs for admin credentials..."
    echo "   📦 Project: $project_name"
    echo "   🐳 Compose file: $compose_file"
    
    # Remove old credentials file if it exists
    rm -f "$credentials_file"
    
    # Monitor logs for specified timeout (default 60 seconds)
    for i in $(seq 1 $timeout); do
        # Get logs from the backend service
        LOGS=$(docker compose -p "$project_name" -f "$compose_file" logs backend 2>/dev/null || echo "")
        
        # Search for the credential pattern
        if echo "$LOGS" | grep -q "Created initial admin user with email:"; then
            # Extract credentials using the pattern from auth.service.ts
            ADMIN_LINE=$(echo "$LOGS" | grep "Created initial admin user with email:" | tail -1)
            
            if [[ $ADMIN_LINE =~ Created\ initial\ admin\ user\ with\ email:\ ([^\ ]+)\ and\ password:\ ([^\ ]+) ]]; then
                ADMIN_EMAIL="${BASH_REMATCH[1]}"
                ADMIN_PASSWORD="${BASH_REMATCH[2]}"
                
                # Save credentials to JSON file
                cat > "$credentials_file" << EOF
{
  "adminEmail": "$ADMIN_EMAIL",
  "adminPassword": "$ADMIN_PASSWORD"
}
EOF
                
                echo "✅ Admin credentials found and saved to $credentials_file"
                echo "  📧 Email: $ADMIN_EMAIL"
                echo "  🔑 Password: $ADMIN_PASSWORD"
                return 0
            fi
        fi
        
        echo "⏳ Waiting for admin user creation... ($i/$timeout)"
        sleep 1
    done
    
    echo "⚠️  Warning: Admin credentials not found in logs within $timeout seconds"
    echo "   You may need to check the backend logs manually:"
    echo "   docker compose -p $project_name -f $compose_file logs backend"
    return 1
}

# Main execution
main() {
    # Navigate to the integration tests directory
    cd "$(dirname "$0")/.."
    
    # Parse arguments
    # Usage: extract-credentials.sh [timeout] [project_name] [compose_file]
    local timeout=${1:-60}
    local project_name=${2:-$PROJECT_NAME}
    local compose_file=${3:-$DOCKER_COMPOSE_FILE}
    
    extract_credentials $timeout $project_name $compose_file
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
