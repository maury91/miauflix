#!/bin/bash

# Load utility functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/scripts/utils.sh"

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
    -h|--help)
      print_message "$GREEN" "Usage: $0 -d DOMAIN [-w]"
      print_message "$GREEN" "Sets up SSL certificates for your domain."
      print_message "$GREEN" "  -d, --domain DOMAIN  The domain to set up certificates for"
      print_message "$GREEN" "  -w, --www           Include www subdomain"
      print_message "$GREEN" "  -h, --help          Show this help message"
      exit 0
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

print_message "$BLUE" "================================================================="
print_message "$BLUE" "              SSL Certificate Setup"
print_message "$BLUE" "================================================================="
print_message "$GREEN" ""
print_message "$GREEN" "This script will help you set up SSL certificates for your web application."
print_message "$GREEN" "You can choose between Let's Encrypt certificates (recommended for production)"
print_message "$GREEN" "or self-signed certificates (for development/testing)."

# If domain starts with www, set domain to the base domain
if [[ "$domain" == www.* ]]; then
  domain="${domain#www.}"
  include_www=true
fi

# Build the domain argument
domain_arg="-d $domain"
if [ "$include_www" = true ]; then
  domain_arg="$domain_arg -w"
fi

print_message "$GREEN" ""
print_message "$YELLOW" "Please select an option:"
print_message "$YELLOW" "1. Set up Let's Encrypt certificates for $domain"
print_message "$YELLOW" "2. Set up self-signed certificates"
print_message "$YELLOW" "3. Exit"
print_message "$GREEN" ""

read -p "Enter your choice (1-3): " choice

case $choice in
  1)
    print_message "$GREEN" "Setting up Let's Encrypt certificates..."
    print_message "$GREEN" "First, let's verify your domain configuration."
    print_message "$GREEN" ""
    
    # Run domain verification script with the domain
    bash ./scripts/verify-domain.sh $domain_arg
    if [ $? -ne 0 ]; then
      print_message "$RED" "Domain verification failed. Please fix the issues before continuing."
      exit 1
    fi
    
    # If verification passed, proceed with Let's Encrypt setup
    print_message "$GREEN" ""
    print_message "$GREEN" "Domain verification passed! Proceeding with Let's Encrypt setup."
    print_message "$GREEN" ""
    
    # Ask if staging should be used
    read -p "Use Let's Encrypt staging environment for testing? (y/N): " use_staging
    staging_arg=""
    if [[ "$use_staging" =~ ^[Yy]$ ]]; then
      staging_arg="-s"
    fi
    
    # Ask for email address
    print_message "$GREEN" ""
    read -p "Enter your email address for Let's Encrypt notifications (optional): " email
    email_arg=""
    if [ -n "$email" ]; then
      email_arg="-e $email"
    fi
    
    # Run Let's Encrypt setup
    bash ./scripts/init-letsencrypt.sh $domain_arg $staging_arg $email_arg
    if [ $? -ne 0 ]; then
      print_message "$RED" "Let's Encrypt setup failed. Please check the error messages above."
      exit 1
    fi
    
    print_message "$GREEN" ""
    print_message "$GREEN" "Let's Encrypt setup completed successfully!"
    print_message "$GREEN" "Your site should now be accessible at https://$domain"
    ;;
    
  2)
    print_message "$GREEN" "Setting up self-signed certificates..."
    
    bash ./scripts/setup-https.sh $domain_arg
    if [ $? -ne 0 ]; then
      print_message "$RED" "Self-signed certificate setup failed. Please check the error messages above."
      exit 1
    fi
    
    print_message "$GREEN" ""
    print_message "$GREEN" "Self-signed certificate setup completed successfully!"
    print_message "$GREEN" "Note: Browsers will show a security warning because the certificate is self-signed."
    ;;
    
  3)
    print_message "$GREEN" "Exiting without changes."
    exit 0
    ;;
    
  *)
    print_message "$RED" "Invalid choice. Please run the script again and select a valid option."
    exit 1
    ;;
esac

print_message "$BLUE" "================================================================="
print_message "$BLUE" "                    Setup Complete"
print_message "$BLUE" "================================================================="
