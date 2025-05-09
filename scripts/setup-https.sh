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
      print_message "$RED" "Unknown option: $1"
      print_message "$GREEN" "Usage: $0 -d DOMAIN [-w]"
      print_message "$GREEN" "  -d, --domain DOMAIN  The domain to set up certificates for"
      print_message "$GREEN" "  -w, --www           Include www subdomain"
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

print_message "$GREEN" "Generating self-signed certificates..."

# Generate 2048-bit DH parameters for improved security
if [ ! -f "$SSL_DIR/dhparam.pem" ]; then
  print_message "$GREEN" "Generating DH parameters. This may take a few minutes..."
  openssl dhparam -out "$SSL_DIR/dhparam.pem" 2048
else
  print_message "$GREEN" "Using existing DH parameters."
fi

# Create self-signed certificate
print_message "$GREEN" "Creating self-signed certificate for $subject_name..."

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
  print_message "$GREEN" "✅ Self-signed certificate created successfully"
  # Remove temporary OpenSSL config
  rm "$SSL_DIR/openssl.cnf"
else
  print_message "$RED" "❌ Failed to create self-signed certificate"
  exit 1
fi

# Generate Nginx configuration
print_message "$GREEN" "Updating Nginx configuration for $domain..."

# Generate Nginx config using our template
domain_arg="-d $domain"
if [ "$include_www" = true ]; then
  domain_arg="$domain_arg -w"
fi    # Run generate_nginx_config.sh
"${SCRIPT_DIR}/generate_nginx_config.sh" $domain_arg

# Update SSL certificate paths to point to self-signed certificates
base_path="${SCRIPT_DIR}/.."
nginx_conf="${base_path}/nginx/conf.d/default.conf"

# Fix the certificate paths - using more specific patterns to avoid duplicate replacements
sed -i "s#ssl_certificate .*fullchain.pem;#ssl_certificate /etc/nginx/ssl/fullchain.pem;#" "$nginx_conf"
sed -i "s#ssl_certificate_key .*privkey.pem;#ssl_certificate_key /etc/nginx/ssl/privkey.pem;#" "$nginx_conf"
sed -i "s#ssl_dhparam .*pem;#ssl_dhparam /etc/nginx/ssl/dhparam.pem;#" "$nginx_conf"

print_message "$GREEN" "✅ Self-signed SSL certificate setup completed successfully!"
