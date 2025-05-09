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

# Function to get the external IP address of the server
get_external_ip() {
  # Try multiple services in case one fails
  EXTERNAL_IP=$(curl -s https://ipinfo.io/ip || curl -s https://api.ipify.org || curl -s https://icanhazip.com)
  
  if [[ -z "$EXTERNAL_IP" ]]; then
    print_message "$RED" "Error: Could not determine external IP address automatically."
    print_message "$YELLOW" "Please enter your server's external IP address manually:"
    read -r EXTERNAL_IP
    
    if [[ -z "$EXTERNAL_IP" ]]; then
      print_message "$RED" "No IP address provided. Exiting."
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

# Function to get the appropriate docker compose command
get_docker_compose_cmd() {
  if command_exists "docker-compose"; then
    echo "docker-compose"
  elif command_exists "docker" && docker compose version > /dev/null 2>&1; then
    echo "docker compose"
  else
    print_message "$RED" "Error: neither docker-compose nor docker compose is available."
    return 1
  fi
  return 0
}

# Function to check if DNS is correctly configured
check_dns() {
    local domain=$1
    print_message "$GREEN" "Checking DNS configuration for $domain..."
    
    # Get the current IP address of the server
    SERVER_IP=$(get_external_ip)
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Get the IP address that the domain points to
    DOMAIN_IP=$(dig +short $domain)
    if [ -z "$DOMAIN_IP" ]; then
        print_message "$RED" "Error: Domain $domain does not resolve to any IP address"
        print_message "$YELLOW" "Please configure your DNS settings to point $domain to $SERVER_IP"
        print_message "$YELLOW" "DNS record: $domain. IN A $SERVER_IP"
        return 1
    fi
    
    # Check if the domain points to this server
    if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
        print_message "$RED" "Warning: Domain $domain points to $DOMAIN_IP, but this server's IP is $SERVER_IP"
        print_message "$YELLOW" "Please update your DNS settings to point $domain to $SERVER_IP"
        print_message "$YELLOW" "DNS record: $domain. IN A $SERVER_IP"
        return 1
    else
        print_message "$GREEN" "✅ Success: Domain $domain correctly points to $SERVER_IP"
        return 0
    fi
}

# Function to check if ports are open
check_ports() {
    print_message "$GREEN" "Checking if ports 80 and 443 are accessible..."
    
    # Check if the ports are open locally
    nc -z localhost 80 > /dev/null 2>&1
    PORT_80_LOCAL=$?
    
    nc -z localhost 443 > /dev/null 2>&1
    PORT_443_LOCAL=$?
    
    if [ $PORT_80_LOCAL -ne 0 ]; then
        print_message "$YELLOW" "Warning: Port 80 does not appear to be open locally"
    else
        print_message "$GREEN" "Success: Port 80 is open locally"
    fi
    
    if [ $PORT_443_LOCAL -ne 0 ]; then
        print_message "$YELLOW" "Warning: Port 443 does not appear to be open locally"
    else
        print_message "$GREEN" "Success: Port 443 is open locally"
    fi
    
    print_message "$YELLOW" "Please ensure your firewall and/or cloud provider allows incoming traffic on ports 80 and 443"
}

# Function to create directory structure if it doesn't exist
create_directories() {
  mkdir -p ./nginx/certbot/conf
  mkdir -p ./nginx/certbot/www
  mkdir -p ./nginx/ssl
}
