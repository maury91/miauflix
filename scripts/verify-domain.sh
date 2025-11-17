#!/bin/bash

# Load utility functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -d|--domain)
      PRIMARY_DOMAIN="$2"
      shift 2
      ;;
    -w|--www)
      CHECK_WWW=true
      shift
      ;;
    *)
      print_error "Unknown option: $1"
      print_status "Usage: $0 -d DOMAIN [-w]"
      print_status "  -d, --domain DOMAIN  The domain to verify"
      print_status "  -w, --www           Also check www subdomain"
      exit 1
      ;;
  esac
done

# Check if domain is provided
if [ -z "$PRIMARY_DOMAIN" ]; then
  print_error "Domain must be provided"
  print_status "Usage: $0 -d DOMAIN [-w]"
  exit 1
fi

# If domain starts with www, set PRIMARY_DOMAIN to the base domain
if [[ "$PRIMARY_DOMAIN" == www.* ]]; then
  PRIMARY_DOMAIN="${PRIMARY_DOMAIN#www.}"
  CHECK_WWW=true
fi

# Set secondary domain if www check is enabled
if [ "$CHECK_WWW" = true ]; then
  SECONDARY_DOMAIN="www.$PRIMARY_DOMAIN"
fi

# Function to check HTTP challenge path
check_challenge_path() {
    local domain=$1
    print_status "Testing Let's Encrypt HTTP challenge path for $domain..."
    
    # Use absolute paths with SCRIPT_DIR
    mkdir -p "${SCRIPT_DIR}/../nginx/certbot/www/.well-known/acme-challenge"
    echo "test-file" > "${SCRIPT_DIR}/../nginx/certbot/www/.well-known/acme-challenge/test-file"
    
    # Start Nginx for testing if it's not already running
    if ! docker ps | grep -q "nginx"; then
        print_warning "Starting Nginx container temporarily..."
        
        # Get the docker compose command
        dockercompose=$(get_docker_compose_cmd)
        if [ $? -ne 0 ]; then
            return 1
        fi
        
        # Start nginx container without changing directories
        (cd "${SCRIPT_DIR}/.." && $dockercompose up -d nginx)
        sleep 2
    fi
    
    # Attempt to access the test file
    print_status "Checking if challenge path is accessible..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://${domain}/.well-known/acme-challenge/test-file)
    
    if [ "$HTTP_STATUS" == "200" ]; then
        print_status "✅ Success: Challenge path is accessible. Let's Encrypt will be able to verify your domain."
        
        # Clean up
        rm -f "${SCRIPT_DIR}/../nginx/certbot/www/.well-known/acme-challenge/test-file"
        return 0
    else
        print_error "Cannot access challenge path. HTTP status: $HTTP_STATUS"
        print_warning "Please make sure your Nginx configuration includes the following:"
        print_warning "location /.well-known/acme-challenge/ {"
        print_warning "    root /var/www/certbot;"
        print_warning "}"
        print_warning "And ensure that port 80 is accessible from the internet."
        
        # Clean up
        rm -f "${SCRIPT_DIR}/../nginx/certbot/www/.well-known/acme-challenge/test-file"
        return 1
    fi
}

# Main execution
print_status "=== Domain Verification for Let's Encrypt ==="
print_status "Checking domain: $PRIMARY_DOMAIN"
if [ "$CHECK_WWW" = true ]; then
    print_status "Also checking: $SECONDARY_DOMAIN"
fi
echo ""

# Check primary domain
check_dns "$PRIMARY_DOMAIN"
PRIMARY_RESULT=$?

# Check secondary domain if applicable
SECONDARY_RESULT=0
if [ "$CHECK_WWW" = true ]; then
    echo ""
    check_dns "$SECONDARY_DOMAIN"
    SECONDARY_RESULT=$?
fi

echo ""
check_ports
PORTS_RESULT=$?

echo ""
check_challenge_path "$PRIMARY_DOMAIN"
CHALLENGE_RESULT=$?

echo ""
# If DNS checks are successful but only challenge path fails, it's a recoverable error
# as the init-letsencrypt.sh script will start Nginx with proper configuration
if [ $PRIMARY_RESULT -eq 0 ] && [ $SECONDARY_RESULT -eq 0 ]; then
    if [ $CHALLENGE_RESULT -ne 0 ]; then
        print_warning "⚠️ Warning: DNS verification passed, but challenge path is not accessible."
        print_warning "This will be fixed by the Let's Encrypt setup script."
        print_warning "Continuing with Let's Encrypt setup..."
        exit 0
    else
        print_status "✅ Domain verification passed! All checks successful."
        exit 0
    fi
else
    print_error "Domain verification failed. Please fix the DNS issues before continuing."
    exit 1
fi
