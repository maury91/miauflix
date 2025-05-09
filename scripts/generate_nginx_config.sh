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
      print_message "$RED" "Unknown option: $1"
      print_message "$GREEN" "Usage: $0 -d DOMAIN [-w]"
      exit 1
      ;;
  esac
done

# Check if domain is provided
if [ -z "$domain" ]; then
  print_message "$RED" "Error: Domain must be provided"
  print_message "$GREEN" "Usage: $0 -d DOMAIN [-w]"
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

# Check if template exists
template_file="${SCRIPT_DIR}/../nginx/conf.d/default.conf.template"
output_file="${SCRIPT_DIR}/../nginx/conf.d/default.conf"

if [ ! -f "$template_file" ]; then
  print_message "$RED" "Error: Template file not found: $template_file"
  exit 1
fi

# Create a backup of the original config if it exists
if [ -f "$output_file" ] && [ ! -f "${output_file}.bak" ]; then
  cp "$output_file" "${output_file}.bak"
  print_message "$GREEN" "Original Nginx configuration backed up to ${output_file}.bak"
fi

# Generate configuration from template
print_message "$GREEN" "Generating Nginx configuration for domain: $domain"
if [ "$include_www" = true ]; then
  print_message "$GREEN" "Including www subdomain: $www_domain"
fi

# Replace placeholders with actual values
sed "s/{{DOMAIN}}/$domain/g" "$template_file" | \
sed "s/{{WWW_DOMAIN}}/$www_domain/g" > "$output_file"

print_message "$GREEN" "✅ Nginx configuration generated successfully: $output_file"
exit 0
