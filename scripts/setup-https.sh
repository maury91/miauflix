#!/bin/bash

# Load utility functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

# Parse command-line arguments
include_www=false
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
      print_status "  -d, --domain DOMAIN  The domain to set up certificates for"
      print_status "  -w, --www           Include www subdomain"
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

print_message "$BLUE" "================================================================="
print_message "$BLUE" "              Self-Signed SSL Certificate Setup"
print_message "$BLUE" "================================================================="

# If domain starts with www, set to base domain
if [[ "$domain" == www.* ]]; then
  domain="${domain#www.}"
  include_www=true
fi

# Prepare subject name and alt names
subject_name="$domain"
alt_names=""

# Add IP alt name if domain looks like an IP
if [[ "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  alt_names="IP:$domain"
else
  alt_names="DNS:$domain"
  if [ "$include_www" = true ]; then
    alt_names="$alt_names,DNS:www.$domain"
  fi
fi

# SSL directory
SSL_DIR="${SCRIPT_DIR}/../nginx/ssl"
mkdir -p "$SSL_DIR"

print_status "Generating self-signed certificates..."

# Generate 2048-bit DH parameters for improved security
if [ ! -f "$SSL_DIR/dhparam.pem" ]; then
  print_status "Generating DH parameters. This may take a few minutes..."
  openssl dhparam -out "$SSL_DIR/dhparam.pem" 2048
else
  print_status "Using existing DH parameters."
fi

# Create self-signed certificate
print_status "Creating self-signed certificate for $subject_name..."

# Create OpenSSL configuration file
cat > "$SSL_DIR/openssl.cnf" << EOC
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = $subject_name

[v3_req]
subjectAltName = $alt_names
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOC

# Generate certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$SSL_DIR/privkey.pem" \
  -out "$SSL_DIR/fullchain.pem" \
  -config "$SSL_DIR/openssl.cnf"

# Check if certificate was created successfully
if [ $? -eq 0 ]; then
  print_status "✅ Self-signed certificate created successfully"
  # Remove temporary OpenSSL config
  rm "$SSL_DIR/openssl.cnf"
else
  print_error "Failed to create self-signed certificate"
  exit 1
fi

# Generate Nginx configuration
print_status "Updating Nginx configuration for $domain..."

# Generate Nginx config using our template
domain_arg="-d $domain"
if [ "$include_www" = true ]; then
  domain_arg="$domain_arg -w"
fi    # Run generate_nginx_config.sh
"${SCRIPT_DIR}/generate_nginx_config.sh" $domain_arg

# Ensure template directory exists
base_path="${SCRIPT_DIR}/.."
nginx_template_dir="${base_path}/nginx/templates"

# Make sure the template directory exists
if [ ! -d "$nginx_template_dir" ]; then
  print_status "Creating Docker template directory..."
  mkdir -p "$nginx_template_dir"
fi

# Check if the template exists
nginx_template="${nginx_template_dir}/default.conf.template"
if [ ! -f "$nginx_template" ]; then
  print_error "Template file not found: $nginx_template"
  print_warning "Please create a template file before running this script."
  exit 1
fi

# Create environment variables for SSL paths to use in Docker
update_env_var "SSL_CERTIFICATE" "/etc/nginx/ssl/fullchain.pem"
update_env_var "SSL_CERTIFICATE_KEY" "/etc/nginx/ssl/privkey.pem"
update_env_var "SSL_DHPARAM" "/etc/nginx/ssl/dhparam.pem"

print_status "✅ Self-signed SSL certificate setup completed successfully!"
