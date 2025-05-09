# Let's Encrypt Setup Guide

This document provides detailed information about setting up Let's Encrypt certificates for your web application.

## Overview

Let's Encrypt is a free, automated, and open Certificate Authority. It allows you to obtain certificates that are trusted by web browsers without any cost. The certificates are valid for 90 days and can be automatically renewed.

## Prerequisites

Before proceeding with Let's Encrypt setup, ensure:

1. You have a domain name (e.g., `example.com`) that you control
2. Your domain's DNS is configured to point to your server's IP address
3. Your server is publicly accessible on ports 80 and 443
4. Docker and Docker Compose are installed

## Verification Steps

### 1. Check DNS Configuration

Verify that your domain correctly points to your server:

```bash
./scripts/verify-domain.sh -d example.com
```

If you want to also include the www subdomain:

```bash
./scripts/verify-domain.sh -d example.com -w
```

This script checks:

- Whether your domain resolves to your server's IP address
- Whether ports 80 and 443 are accessible
- Whether the Let's Encrypt HTTP challenge path is correctly configured

If any issues are found, the script will provide guidance on how to fix them.

### 2. Configure Nginx

The application uses a template-based approach for Nginx configuration. Generate a configuration file from the template:

```bash
./scripts/generate_nginx_config.sh -d example.com -w
```

This creates `nginx/conf.d/default.conf` configured for your domain.

## Obtaining Certificates

Once verification passes, you can obtain Let's Encrypt certificates using:

```bash
./scripts/init-letsencrypt.sh -d example.com -e your.email@example.com
```

Include the `-w` flag to add the www subdomain:

```bash
./scripts/init-letsencrypt.sh -d example.com -e your.email@example.com -w
```

### Testing with Staging Environment

Let's Encrypt has rate limits on certificate issuance. For testing, use the staging environment:

```bash
./scripts/init-letsencrypt.sh -d example.com -e your.email@example.com -s
```

Staging certificates are not trusted by browsers but work exactly like production certificates for testing purposes.

## How It Works

The script performs these steps:

1. Creates temporary self-signed certificates
2. Configures Nginx to use these certificates
3. Sets up a Docker Compose service with Certbot
4. Uses HTTP validation to verify domain ownership
5. Obtains Let's Encrypt certificates
6. Configures Nginx to use the Let's Encrypt certificates

## Directory Structure

```
nginx/
├── certbot/
│   ├── conf/                # Certbot configuration
│   └── www/                 # Web root for HTTP challenges
└── conf.d/
    ├── default.conf         # Active Nginx configuration
    └── default.conf.template # Template for configuration
```

## Certificate Renewal

Let's Encrypt certificates expire after 90 days. The Certbot container is configured to check twice a day and automatically renew certificates that are close to expiration.

The renewal process uses the same validation method (HTTP validation) as the initial certificate issuance.

## Advanced Configuration

### Manual Certificate Renewal

To manually trigger certificate renewal:

```bash
docker compose run --rm certbot renew
```

### HTTPS Configuration

The nginx configuration includes modern and secure SSL settings:

- TLS 1.2 and 1.3 only (older versions are disabled)
- Strong cipher suites
- HTTP Strict Transport Security (HSTS)

### Certificate Files

Let's Encrypt certificates are stored in:

```
nginx/certbot/conf/live/example.com/
├── cert.pem       # Server certificate
├── chain.pem      # Intermediate certificate
├── fullchain.pem  # Server + intermediate certificates
└── privkey.pem    # Private key
```

## Troubleshooting

### Rate Limiting

Let's Encrypt has [rate limits](https://letsencrypt.org/docs/rate-limits/) to prevent abuse:
- 50 certificates per registered domain per week
- 5 duplicate certificates per week 
- 5 failed validations per hour

If you hit rate limits, use the staging environment (`-s` flag) or wait until the rate limit resets.

### Validation Failures

If domain validation fails:

1. Ensure your domain's DNS is correctly configured
2. Check that port 80 is accessible from the internet
3. Verify that Nginx is correctly configured to serve the challenge path

### Certificate Not Trusted

If using staging certificates, browsers will show warnings. This is expected. For production use, remove the `-s` flag.