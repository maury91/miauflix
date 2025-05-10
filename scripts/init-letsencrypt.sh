#!/bin/bash

# Load utility functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

# Default settings
rsa_key_size=4096
data_path="${SCRIPT_DIR}/../nginx/certbot"
email="" # Will prompt if empty
staging=0 # Default to production
include_www=false

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -d|--domain)
      PRIMARY_DOMAIN="$2"
      shift 2
      ;;
    -e|--email)
      email="$2"
      shift 2
      ;;
    -w|--www)
      include_www=true
      shift
      ;;
    -s|--staging)
      staging=1
      shift
      ;;
    *)
      print_message "$RED" "Unknown option: $1"
      print_message "$GREEN" "Usage: $0 -d DOMAIN [-e EMAIL] [-w] [-s]"
      print_message "$GREEN" "  -d, --domain DOMAIN  The domain to obtain certificates for"
      print_message "$GREEN" "  -e, --email EMAIL    Email for Let's Encrypt registration and notifications"
      print_message "$GREEN" "  -w, --www           Include www subdomain"
      print_message "$GREEN" "  -s, --staging       Use Let's Encrypt staging server"
      exit 1
      ;;
  esac
done

# Check if domain is provided
if [ -z "$PRIMARY_DOMAIN" ]; then
  print_message "$RED" "Error: Domain must be provided"
  print_message "$GREEN" "Usage: $0 -d DOMAIN [-e EMAIL] [-w] [-s]"
  exit 1
fi

# If domain starts with www, set PRIMARY_DOMAIN to the base domain
if [[ "$PRIMARY_DOMAIN" == www.* ]]; then
  PRIMARY_DOMAIN="${PRIMARY_DOMAIN#www.}"
  include_www=true
fi

# Set up domains array
if [ "$include_www" = true ]; then
  domains=("$PRIMARY_DOMAIN" "www.$PRIMARY_DOMAIN")
else
  domains=("$PRIMARY_DOMAIN")
fi

print_message "$GREEN" "=== Let's Encrypt Certificate Setup for ${domains[0]} ==="

# Ask for email if not set
if [ -z "$email" ]; then
  read -p "Enter your email (used for urgent renewal and security notices): " email
  if [ -z "$email" ]; then
    print_message "$YELLOW" "Warning: Running without providing an email address is not recommended."
    print_message "$YELLOW" "You will not receive important certificate expiration notifications."
    read -p "Continue without email? (y/N) " continue_without_email
    if [ "$continue_without_email" != "Y" ] && [ "$continue_without_email" != "y" ]; then
      exit 1
    fi
  fi
fi

# Check for existing certificates
if [ -d "$data_path/conf/live/${domains[0]}" ]; then
  print_message "$YELLOW" "Existing certificate found for ${domains[0]}."
  read -p "Continue and replace existing certificate? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit 1
  fi
fi

# Get docker compose command
cd "${SCRIPT_DIR}/.."
dockercompose=$(get_docker_compose_cmd)
if [ $? -ne 0 ]; then
  exit 1
fi

# Ensure the data path exists and set permissions
mkdir -p "$data_path/conf"
mkdir -p "$data_path/www"

# Create subdirectories that might be needed
mkdir -p "$data_path/conf/live"
mkdir -p "$data_path/conf/archive"
mkdir -p "$data_path/conf/renewal"
mkdir -p "$data_path/conf/renewal-hooks/pre"
mkdir -p "$data_path/conf/renewal-hooks/post"
mkdir -p "$data_path/conf/renewal-hooks/deploy"
mkdir -p "$data_path/www/.well-known/acme-challenge"

# Ensure proper permissions
print_message "$GREEN" "Setting proper permissions for certificate directories..."
chmod -R 755 "$data_path/conf" || print_message "$YELLOW" "Warning: Could not set permissions on conf directory"
chmod -R 755 "$data_path/www" || print_message "$YELLOW" "Warning: Could not set permissions on www directory"

# Download recommended TLS parameters
if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  print_message "$GREEN" "Downloading recommended TLS parameters..."
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
  if [ $? -ne 0 ]; then
    print_message "$RED" "Failed to download TLS parameters. Please check your internet connection."
    exit 1
  fi
  print_message "$GREEN" "TLS parameters downloaded successfully."
fi

# Prepare domain arguments for certbot
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

# Select appropriate email arg
email_arg=""
if [ -n "$email" ]; then
  email_arg="--email $email"
else 
  email_arg="--register-unsafely-without-email"
fi

print_message "$GREEN" "Stopping any running containers..."

# Stop any existing containers
$dockercompose down

# Make sure certbot directories exist with proper permissions
print_message "$GREEN" "Creating certificate directories..."
mkdir -p "$data_path/conf" "$data_path/www/.well-known/acme-challenge"

# Generate Nginx configuration using the template
domain_arg="-d ${domains[0]}"
if [ "$include_www" = true ]; then
  domain_arg="$domain_arg -w"
fi

"${SCRIPT_DIR}/generate_nginx_config.sh" $domain_arg

print_message "$GREEN" "Starting Nginx for certificate request..."
$dockercompose up -d nginx
sleep 5

# Add a test file to confirm challenge path is working
echo "test-certbot-file" > "$data_path/www/.well-known/acme-challenge/test-file"

# Verify challenge path is working
print_message "$GREEN" "Testing challenge path accessibility..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${domains[0]}/.well-known/acme-challenge/test-file")
if [ "$HTTP_STATUS" != "200" ]; then
  print_message "$RED" "Challenge path is not accessible (status code: $HTTP_STATUS)"
  print_message "$YELLOW" "Please check your Nginx configuration and domain settings"
  exit 1
fi
print_message "$GREEN" "✓ Challenge path is accessible!"

print_message "$GREEN" "Cleaning up existing certificates..."
# Clean up existing certificates using Docker with proper permissions
docker run --rm \
  -v "$data_path/conf:/etc/letsencrypt" \
  -v "$data_path/www:/var/www/certbot" \
  --entrypoint "/bin/sh" \
  certbot/certbot \
  -c "rm -rf /etc/letsencrypt/live/${domains[0]} /etc/letsencrypt/archive/${domains[0]} /etc/letsencrypt/renewal/${domains[0]}.conf 2>/dev/null || true"

print_message "$GREEN" "Requesting Let's Encrypt certificates for ${domains[0]}..."

# Select appropriate staging arg
if [ $staging -eq 1 ]; then
  staging_arg="--staging"
  print_message "$YELLOW" "Using staging environment for testing"
else
  staging_arg=""
fi

# Request the actual certificate
print_message "$GREEN" "Issuing Let's Encrypt certificate request. This will validate your domain ownership..."
print_message "$YELLOW" "Note: This validation process can only succeed when:"
print_message "$YELLOW" "1. Your domain actually points to this server's IP address"
print_message "$YELLOW" "2. This server is accessible from the Internet on port 80"
print_message "$YELLOW" "3. The domain validation server can reach your Nginx container"
print_message "$GREEN" ""

# Using Docker to obtain the certificate to avoid permission issues
print_message "$GREEN" "Requesting certificate with certbot. This may take a few minutes..."

docker run --rm \
  -v "$data_path/conf:/etc/letsencrypt" \
  -v "$data_path/www:/var/www/certbot" \
  certbot/certbot \
  certonly --webroot \
  -w /var/www/certbot \
  $email_arg \
  --agree-tos \
  --no-eff-email \
  $staging_arg \
  $domain_args \
  --key-type rsa \
  --rsa-key-size $rsa_key_size \
  --force-renewal \
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  print_message "$RED" "Failed to obtain Let's Encrypt certificates."
  print_message "$YELLOW" "Common issues:"
  print_message "$YELLOW" "- Domain doesn't point to this server's IP"
  print_message "$YELLOW" "- Port 80 is not accessible from the Internet"
  print_message "$YELLOW" "- Let's Encrypt rate limits (use --staging/-s flag for testing)"
  print_message "$YELLOW" "- Nginx configuration issue with the .well-known/acme-challenge/ path"
  print_message "$GREEN" ""
  print_message "$YELLOW" "For testing locally, you can use self-signed certificates instead."
  exit 1
else
  print_message "$GREEN" "Certificate successfully obtained!"
fi

# Update environment variables with the certificate paths
print_message "$GREEN" "Updating environment variables with certificate paths..."
update_env_var "SSL_CERTIFICATE" "/etc/letsencrypt/live/${domains[0]}/fullchain.pem"
update_env_var "SSL_CERTIFICATE_KEY" "/etc/letsencrypt/live/${domains[0]}/privkey.pem"
update_env_var "SSL_DHPARAM" "/etc/letsencrypt/ssl-dhparams.pem"

print_message "$GREEN" "Reloading Nginx with new certificates..."
$dockercompose down nginx
$dockercompose up -d nginx

print_message "$GREEN" "✅ Let's Encrypt certificate setup complete!"
if [ $staging -eq 1 ]; then
  print_message "$YELLOW" "Note: You used the staging environment. The certificate won't be trusted by browsers."
  print_message "$YELLOW" "When you're ready to get a production certificate, run this script again without the -s/--staging flag."
else
  print_message "$GREEN" "Your site should now be accessible at https://${domains[0]}"
fi
