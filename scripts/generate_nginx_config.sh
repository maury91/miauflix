#!/bin/bash

# Load utility functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

# Initialize variables
domain=""
include_www=false

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -d|--domain)
      domain="$2"
      shift 2
      ;;
    -w|--www)
      include_www=true
      shift
      ;;
    *)
      print_error "Unknown option: $1"
      print_status "Usage: $0 -d DOMAIN [-w]"
      exit 1
      ;;
  esac
done

# Check if domain is provided
if [ -z "$domain" ]; then
  print_error "Domain must be provided"
  print_status "Usage: $0 -d DOMAIN [-w]"
  exit 1
fi

# If domain starts with www, set domain to the base domain
if [[ "$domain" == www.* ]]; then
  domain="${domain#www.}"
  include_www=true
fi

# Set www domain
if [ "$include_www" = true ]; then
  www_domain="www.$domain"
else
  www_domain=""
fi

# Load environment variables if .env exists
if [ -f "${SCRIPT_DIR}/../.env" ]; then
  source "${SCRIPT_DIR}/../.env"
fi

# Generate configuration from template
print_status "Generating Nginx configuration for domain: $domain"
if [ "$include_www" = true ]; then
  print_status "Including www subdomain: $www_domain"
fi

# Check for reverse proxy secret
if [ -z "$REVERSE_PROXY_SECRET" ]; then
  print_warning "REVERSE_PROXY_SECRET is not set in .env file"
  print_warning "Client IP addresses won't be properly detected behind the reverse proxy"
  print_warning "Consider adding a strong random secret to your .env file"
fi

# Update environment variables in .env file
update_env_var "DOMAIN" "$domain"

# Update WWW_DOMAIN in .env
if [ "$include_www" = true ]; then
  update_env_var "WWW_DOMAIN" "$www_domain"
else
  update_env_var "WWW_DOMAIN" ""
fi

print_status "Updated DOMAIN and WWW_DOMAIN in .env file"
print_status "✅ Nginx configuration setup complete"
print_status "Docker will use environment variables from .env file when starting"
print_status "Restart the Nginx container with: docker compose down nginx && docker compose up -d nginx"
exit 0
