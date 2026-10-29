#!/bin/bash

# Color codes for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
  local color=$1
  local message=$2
  echo -e "${color}${message}${NC}"
}

# Print status message (green)
print_status() {
  print_message "${GREEN}" "$1"
}

# Print warning message (yellow)
print_warning() {
  print_message "${YELLOW}" "$1"
}

# Print error message (red)
print_error() {
  print_message "${RED}" "[ERROR] $1"
}

# Function to get the external IP address of the server
get_external_ip() {
  # Try multiple services in case one fails
  EXTERNAL_IP=$(curl -s https://ipinfo.io/ip || curl -s https://api.ipify.org || curl -s https://icanhazip.com)
  
  if [[ -z "$EXTERNAL_IP" ]]; then
    print_error "Could not determine external IP address automatically."
    print_warning "Please enter your server's external IP address manually:"
    read -r EXTERNAL_IP
    
    if [[ -z "$EXTERNAL_IP" ]]; then
      print_error "No IP address provided. Exiting."
      return 1
    fi
  fi
  
  echo "$EXTERNAL_IP"
  return 0
}

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

get_owner_group() {
  stat -c '%u:%g' "$1" 2>/dev/null || stat -f '%u:%g' "$1" 2>/dev/null
}

get_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null
}

# Docker Desktop accesses bind-mount sources through the logged-in macOS user.
# Service directories still need their container UID/GID ownership, so grant
# the host user an inheritable ACL instead of weakening their POSIX modes.
ensure_docker_desktop_access() {
  local target_dir="$1"

  if [ "$(uname -s)" != "Darwin" ]; then
    return 0
  fi

  if [ -r "$target_dir" ] && [ -w "$target_dir" ] && [ -x "$target_dir" ]; then
    return 0
  fi

  local host_user
  host_user=$(id -un)
  local host_acl="user:${host_user} allow read,write,execute,delete,add_file,add_subdirectory,file_inherit,directory_inherit"

  if chmod +a "$host_acl" "$target_dir" 2>/dev/null; then
    return 0
  fi

  if command_exists sudo && sudo chmod +a "$host_acl" "$target_dir"; then
    return 0
  fi

  print_error "Cannot grant ${host_user} access to ${target_dir} for Docker Desktop."
  return 1
}

# Development images run as root inside the container, so they do not need
# production UID/GID ownership on their bind mounts. Keep new directories
# private to the host user and preserve permissions on existing data.
ensure_development_data_dir() {
  local project_dir="${1:-$(pwd)}"
  local target_dir

  for target_dir in "$project_dir/data" "$project_dir/data/media-catalog" "$project_dir/data/list-service"; do
    if ! (umask 077; mkdir -p "$target_dir"); then
      print_error "Cannot create ${target_dir}. Restore access for $(id -un), then retry."
      return 1
    fi

    if [ ! -r "$target_dir" ] || [ ! -w "$target_dir" ] || [ ! -x "$target_dir" ]; then
      print_error "Development data directory ${target_dir} must be readable, writable, and searchable by $(id -un). Restore host-user access, then retry."
      return 1
    fi
  done
}

# Pick the compose files for a deployment built from this checkout, unless COMPOSE_FILE is
# already set (in the environment or in .env), and export them as COMPOSE_FILE.
# Adds docker-compose.vpn.yml when NORDVPN_PRIVATE_KEY is set.
use_source_compose_files() {
  local env_file="${1:-.env}"

  # docker-compose.build.yml runs Miauflix as this user, so it can read the mounted .env.
  export USER_ID="${USER_ID:-$(id -u)}"
  export GROUP_ID="${GROUP_ID:-$(id -g)}"

  if [ -z "${COMPOSE_FILE:-}" ] && [ -f "$env_file" ]; then
    COMPOSE_FILE=$(grep -E '^COMPOSE_FILE=' "$env_file" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  fi

  if [ -n "${COMPOSE_FILE:-}" ]; then
    print_status "Using COMPOSE_FILE=${COMPOSE_FILE}"
    export COMPOSE_FILE
    return 0
  fi

  if [ -z "${NORDVPN_PRIVATE_KEY:-}" ] && [ -f "$env_file" ]; then
    NORDVPN_PRIVATE_KEY=$(grep -E '^NORDVPN_PRIVATE_KEY=' "$env_file" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  fi

  COMPOSE_FILE="docker-compose.yml:docker-compose.build.yml:docker-compose.flaresolverr.yml:docker-compose.tracing.yml"
  if [ -n "${NORDVPN_PRIVATE_KEY:-}" ]; then
    COMPOSE_FILE="${COMPOSE_FILE}:docker-compose.vpn.yml"
  else
    print_warning "NORDVPN_PRIVATE_KEY not set, starting without VPN..."
  fi

  print_status "Using COMPOSE_FILE=${COMPOSE_FILE}"
  export COMPOSE_FILE
}

# Function to get the appropriate docker compose command
get_docker_compose_cmd() {
  if command_exists "docker-compose"; then
    echo "docker-compose"
  elif command_exists "docker" && docker compose version > /dev/null 2>&1; then
    echo "docker compose"
  else
    print_error "neither docker-compose nor docker compose is available."
    return 1
  fi
  return 0
}

# Function to check if DNS is correctly configured
check_dns() {
    local domain=$1
    print_status "Checking DNS configuration for $domain..."
    
    # Get the current IP address of the server
    SERVER_IP=$(get_external_ip)
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Get the IP address that the domain points to
    DOMAIN_IP=$(dig +short $domain)
    if [ -z "$DOMAIN_IP" ]; then
        print_error "Domain $domain does not resolve to any IP address"
        print_warning "Please configure your DNS settings to point $domain to $SERVER_IP"
        print_warning "DNS record: $domain. IN A $SERVER_IP"
        return 1
    fi
    
    # Check if the domain points to this server
    if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
        print_warning "Domain $domain points to $DOMAIN_IP, but this server's IP is $SERVER_IP"
        print_warning "Please update your DNS settings to point $domain to $SERVER_IP"
        print_warning "DNS record: $domain. IN A $SERVER_IP"
        return 1
    else
        print_status "✅ Success: Domain $domain correctly points to $SERVER_IP"
        return 0
    fi
}

# Function to check if ports are open
check_ports() {
    print_status "Checking if ports 80 and 443 are accessible..."
    
    # Check if the ports are open locally
    nc -z localhost 80 > /dev/null 2>&1
    PORT_80_LOCAL=$?
    
    nc -z localhost 443 > /dev/null 2>&1
    PORT_443_LOCAL=$?
    
    if [ $PORT_80_LOCAL -ne 0 ]; then
        print_warning "Port 80 does not appear to be open locally"
    else
        print_status "Success: Port 80 is open locally"
    fi
    
    if [ $PORT_443_LOCAL -ne 0 ]; then
        print_warning "Port 443 does not appear to be open locally"
    else
        print_status "Success: Port 443 is open locally"
    fi
    
    print_warning "Please ensure your firewall and/or cloud provider allows incoming traffic on ports 80 and 443"
}

# Function to create directory structure if it doesn't exist
create_directories() {
  mkdir -p ./nginx/certbot/conf
  mkdir -p ./nginx/certbot/www
  mkdir -p ./nginx/ssl
}

# Function to update or add a variable in the .env file
# Usage: update_env_var "VARIABLE_NAME" "value"
update_env_var() {
  local var_name=$1
  local var_value=$2
  local env_file="${SCRIPT_DIR}/../.env"
  
  if [ -e "$env_file" ] && [ ! -f "$env_file" ]; then
    print_error ".env must be a regular file, but it is not: $env_file"
    return 1
  fi

  # Create .env file if it doesn't exist
  if [ ! -e "$env_file" ]; then
    touch "$env_file"
    print_status "Created new .env file at $env_file"
  fi
  
  # Check if the variable already exists in the .env file
  if grep -q "^${var_name}=" "$env_file"; then
    # Replace the existing value
    sed -i "s|^${var_name}=.*$|${var_name}=${var_value}|" "$env_file"
    print_status "Updated $var_name in .env file"
  else
    # Add the new variable
    echo "${var_name}=${var_value}" >> "$env_file"
    print_status "Added $var_name to .env file"
  fi
  
  return 0
}
