#!/bin/bash

# Load utility functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

# Check if .env file exists
ENV_FILE="${SCRIPT_DIR}/../.env"

# Generate a secure random string for the reverse proxy secret
# Using OpenSSL for secure random generation
print_status "Generating a secure random reverse proxy secret..."
SECRET=$(openssl rand -base64 64 | tr -dc 'a-zA-Z0-9!@#$%^&*()_+-=' | head -c 64)

if [ -f "$ENV_FILE" ] && grep -q "REVERSE_PROXY_SECRET=" "$ENV_FILE"; then
    # Ask before overwriting
    print_warning "REVERSE_PROXY_SECRET already exists in .env file."
    read -p "Do you want to replace it? (y/n): " confirm
    if [[ "$confirm" =~ ^[Yy] ]]; then
        update_env_var "REVERSE_PROXY_SECRET" "$SECRET"
        print_status "✅ REVERSE_PROXY_SECRET updated in .env file."
    else
        print_status "Keeping existing REVERSE_PROXY_SECRET."
    fi
else
    update_env_var "REVERSE_PROXY_SECRET" "$SECRET"
    print_status "✅ REVERSE_PROXY_SECRET added to .env file."
fi

print_status "✅ To apply the changes:"
print_status "Restart the Nginx container with: docker compose down nginx && docker compose up -d nginx"
