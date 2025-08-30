# SSL Certificates Setup Guide

This guide explains how to set up HTTPS for your Miauflix deployment. Two options are available:

1. **Let's Encrypt certificates** - Free, automated certificates (recommended for production)
2. **Self-signed certificates** - For development and testing environments

## Quick Start

The easiest way to set up HTTPS is to use the automated setup script:

```bash
chmod +x setup-ssl.sh
./setup-ssl.sh -d yourdomain.com
```

This script will:

- Verify your domain configuration
- Guide you through certificate setup
- Configure Nginx for HTTPS
- Set up automatic renewal

## Option 1: Let's Encrypt Certificates (Recommended)

Let's Encrypt provides free, automated SSL certificates that are trusted by all major web browsers. This is the recommended option for production deployments.

### Prerequisites

Before setting up Let's Encrypt certificates, ensure:

1. **Domain name**: You own a domain (e.g., `yourdomain.com`)
2. **DNS configuration**: Your domain points to your server's IP address
3. **Port access**: Your server is accessible from the internet on ports 80 and 443
4. **Docker installed**: Docker and Docker Compose are installed and running

### Setup Process

#### 1. Verify Your Domain

First, verify that your domain is correctly configured:

```bash
./scripts/verify-domain.sh -d yourdomain.com
```

To include the www subdomain:

```bash
./scripts/verify-domain.sh -d yourdomain.com -w
```

This script verifies:

- **DNS configuration**: Domain points to your server's IP
- **Port accessibility**: Ports 80 and 443 are reachable
- **Challenge path**: Let's Encrypt HTTP validation path is configured

#### 2. Obtain Let's Encrypt Certificates

After successful domain verification, obtain certificates:

```bash
./scripts/init-letsencrypt.sh -d yourdomain.com -e your.email@example.com
```

**Options:**

- Include www subdomain: Add `-w` flag
- Testing mode: Add `-s` flag (uses staging environment, avoids rate limits)

### Automatic Certificate Renewal

Let's Encrypt certificates expire after 90 days, but renewal is fully automated:

- **Automatic checks**: The certbot container checks for renewal twice daily
- **Automatic renewal**: Certificates are renewed automatically 30 days before expiration
- **Zero downtime**: Renewal happens without service interruption
- **No maintenance**: Once set up, the system handles all renewals

## Option 2: Self-Signed Certificates

Self-signed certificates enable HTTPS for development and testing but will show browser warnings since they're not issued by a trusted Certificate Authority.

### When to Use Self-Signed Certificates

- **Development environments** where external access isn't required
- **Internal testing** before deploying with Let's Encrypt
- **Local deployments** where browser warnings are acceptable

### Setup

To create and configure self-signed certificates:

```bash
./scripts/setup-https.sh -d yourdomain.com
```

**Note**: Browsers will show security warnings that you'll need to manually accept.

## Troubleshooting

### Starting Fresh

If you encounter certificate issues, you can restart the process:

```bash
./scripts/init-letsencrypt.sh -d yourdomain.com -e your.email@example.com
```

This will:

- Clean up existing certificates for your domain
- Reset directory permissions
- Perform fresh domain validation
- Request new certificates from Let's Encrypt

### Common Issues

### Domain validation failure

- Verify DNS: Your domain must point to your server's IP address
- Check firewall: Ensure ports 80 and 443 are accessible from the internet
- Review logs: `docker logs miauflix-certbot` for specific error details

### Rate limiting

- **Testing**: Use `-s` flag for Let's Encrypt staging environment (no rate limits)
- **Production**: Let's Encrypt allows 5 certificates per domain per week

### Nginx configuration errors

- Test configuration: `docker compose exec nginx nginx -t`
- Check nginx logs: `docker compose logs nginx`
- Reload after changes: `docker compose exec nginx nginx -s reload`

### Certificate not trusted

- **Staging certificates**: Will show browser warnings (expected for testing)
- **Self-signed certificates**: Will show browser warnings (expected for development)
- **Production**: Remove `-s` flag to use trusted Let's Encrypt certificates

## Advanced Configuration

### Manual Certificate Renewal

To manually renew certificates:

```bash
docker compose run --rm certbot renew
docker compose restart nginx
```

### Certificate File Locations

Let's Encrypt certificates are stored in:

```plaintext
nginx/certbot/conf/live/yourdomain.com/
├── fullchain.pem  # Server + intermediate certificates
├── privkey.pem    # Private key
├── cert.pem       # Server certificate only
└── chain.pem      # Intermediate certificate only
```

### Security Features

The SSL configuration includes modern security practices:

- **TLS 1.2 and 1.3** only (older versions disabled)
- **Strong cipher suites** for enhanced security
- **HSTS headers** to enforce HTTPS connections
- **Perfect Forward Secrecy** for additional protection

For more detailed SSL configuration, see the generated `nginx/conf.d/default.conf` file.
