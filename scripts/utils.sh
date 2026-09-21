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

# Prepare the host-visible data directories used by the Docker services.
# The catalog image runs as linuxserver (UID/GID 911) in production, while the
# development compose stack shares the parent directory with the backend. Do
# not chown the whole tree to the catalog user; make the directory boundaries
# writable and scope catalog ownership to its own subdirectory.
ensure_data_dir() {
  local project_dir="${1:-$(pwd)}"
  local data_dir="${project_dir}/data"
  local catalog_data_dir="${project_dir}/data/media-catalog"
  local list_service_data_dir="${project_dir}/data/list-service"

  if ! mkdir -p "$catalog_data_dir" 2>/dev/null; then
    if ! command_exists sudo || ! sudo mkdir -p "$catalog_data_dir"; then
      print_error "Cannot create ${catalog_data_dir}."
      return 1
    fi
  fi

  if ! mkdir -p "$list_service_data_dir" 2>/dev/null; then
    if ! command_exists sudo || ! sudo mkdir -p "$list_service_data_dir"; then
      print_error "Cannot create ${list_service_data_dir}."
      return 1
    fi
  fi

  local catalog_owner
  catalog_owner=$(stat -c '%u:%g' "$catalog_data_dir" 2>/dev/null || stat -f '%u:%g' "$catalog_data_dir" 2>/dev/null) || catalog_owner=""

  if [ "$catalog_owner" != "911:911" ]; then
    if ! chown -R 911:911 "$catalog_data_dir" 2>/dev/null; then
      if ! command_exists sudo || ! sudo chown -R 911:911 "$catalog_data_dir"; then
        print_warning "Could not assign ${catalog_data_dir} to catalog UID/GID 911:911; continuing with shared directory permissions."
      fi
    fi
  fi

  local list_service_owner
  list_service_owner=$(stat -c '%u:%g' "$list_service_data_dir" 2>/dev/null || stat -f '%u:%g' "$list_service_data_dir" 2>/dev/null) || list_service_owner=""

  if [ "$list_service_owner" != "1000:1000" ]; then
    if ! chown -R 1000:1000 "$list_service_data_dir" 2>/dev/null; then
      if ! command_exists sudo || ! sudo chown -R 1000:1000 "$list_service_data_dir"; then
        print_error "Cannot assign ${list_service_data_dir} to List Service UID/GID 1000:1000."
        return 1
      fi
    fi
  fi

  if ! chmod 0770 "$list_service_data_dir" 2>/dev/null; then
    if ! command_exists sudo || ! sudo chmod 0770 "$list_service_data_dir"; then
      print_error "Cannot make ${list_service_data_dir} writable for the List Service."
      return 1
    fi
  fi

  # Keep the host owner for the backend and share the directory with the
  # catalog's fixed UID/GID without granting access to every local account.
  if chgrp 911 "$data_dir" "$catalog_data_dir" 2>/dev/null && \
    chmod 2770 "$data_dir" 2>/dev/null && chmod 0770 "$catalog_data_dir" 2>/dev/null; then
    return 0
  fi

  if command_exists sudo && \
    sudo chgrp 911 "$data_dir" "$catalog_data_dir" && \
    sudo chmod 2770 "$data_dir" && sudo chmod 0770 "$catalog_data_dir"; then
    return 0
  fi

  # Some host systems do not expose the catalog GID to the invoking user.
  # Grant only UID 911 access through the host ACL instead of opening the
  # directories to every local account.
  chmod 0700 "$data_dir" "$catalog_data_dir" 2>/dev/null || true
  if command_exists setfacl && \
    setfacl -m u:911:rwx "$data_dir" "$catalog_data_dir" 2>/dev/null && \
    setfacl -d -m u:911:rwx "$catalog_data_dir" 2>/dev/null; then
    return 0
  fi

  if [ "$(uname -s)" = "Darwin" ] && \
    chmod +a "user:911 allow read,write,execute,delete,add_file,add_subdirectory,file_inherit,directory_inherit" "$data_dir" "$catalog_data_dir" 2>/dev/null; then
    return 0
  fi

  print_error "Cannot make ${data_dir} writable for the Docker services."
  print_status "Run: sudo chgrp 911 ${data_dir} ${catalog_data_dir} && sudo chmod 2770 ${data_dir} && sudo chmod 0770 ${catalog_data_dir}"
  return 1
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
