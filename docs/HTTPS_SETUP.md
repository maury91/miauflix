# HTTPS Setup Guide

This document explains how to set up HTTPS for your web application. Two options are available:

1. **Let's Encrypt certificates** - Recommended for production environments
2. **Self-signed certificates** - Suitable for development and testing

## Quick Start

The easiest way to set up HTTPS is to use the setup script:

```bash
./setup-ssl.sh -d yourdomain.com
```

This script will guide you through the process of setting up either Let's Encrypt or self-signed certificates.

## Option 1: Let's Encrypt Certificates

Let's Encrypt provides free, automated SSL certificates that are trusted by web browsers. This is recommended for production environments where your site is publicly accessible.

### Prerequisites

1. You need a domain name (e.g., `yourdomain.com`) pointing to your server's IP address
2. Your server must be accessible from the internet on ports 80 and 443
3. Docker and Docker Compose must be installed

### Setup Process

#### 1. Verify Your Domain

First, verify that your domain is correctly configured:

```bash
./scripts/verify-domain.sh -d yourdomain.com
```

If you also want to include the www subdomain:

```bash
./scripts/verify-domain.sh -d yourdomain.com -w
```

This script checks:
- DNS configuration (domain pointing to your server)
- Port accessibility (ports 80 and 443)
- Let's Encrypt HTTP challenge path

#### 2. Obtain Let's Encrypt Certificates

After successful domain verification, obtain certificates:

```bash
./scripts/init-letsencrypt.sh -d yourdomain.com -e your.email@example.com
```

To include the www subdomain:

```bash
./scripts/init-letsencrypt.sh -d yourdomain.com -e your.email@example.com -w
```

For testing, you can use the staging environment to avoid rate limits:

```bash
./scripts/init-letsencrypt.sh -d yourdomain.com -e your.email@example.com -s
```

### Certificate Renewal

Let's Encrypt certificates are valid for 90 days. Docker container `certbot` is configured to try renewal twice a day and will automatically renew certificates when needed.

## Option 2: Self-Signed Certificates

Self-signed certificates allow HTTPS but will trigger browser warnings. This option is suitable for development and testing environments.

To set up self-signed certificates:

```bash
./scripts/setup-https.sh -d yourdomain.com
```

## Troubleshooting

### Starting Fresh

If you encounter issues with your certificates or need to start the process fresh, you can simply run the Let's Encrypt script again:

```bash
./scripts/init-letsencrypt.sh -d yourdomain.com -e your.email@example.com
```

This script will:
- Stop any running containers
- Clean up existing certificate files for the specified domain
- Reset directory permissions
- Perform new domain validation
- Request fresh certificates from Let's Encrypt

### Common Issues

1. **Domain validation failure**: 
   - Check that your domain's DNS records point to your server's IP
   - Ensure ports 80 and 443 are accessible from the internet
   - Look at certbot logs for specific error messages: `docker logs miauflix-certbot`

2. **Certificate request rate limits**:
   - Use the `-s` flag to use the staging environment for testing
   - Production certificates have strict rate limits (5 per domain per week)

3. **Nginx configuration issues**:
   - Check for syntax errors: `docker exec miauflix-nginx nginx -t`
   - Review the nginx logs: `docker logs miauflix-nginx`

## Advanced Configuration

### Nginx Configuration Template

A template-based approach is used for the Nginx configuration. The template file is located at:

```
nginx/conf.d/default.conf.template
```

To generate a configuration file from the template:

```bash
./scripts/generate_nginx_config.sh -d yourdomain.com -w
```

### Manually Editing Nginx Configuration

If you need to manually modify the Nginx configuration, edit the file:

```
nginx/conf.d/default.conf
```

After editing, reload Nginx:

```bash
docker compose exec nginx nginx -s reload
```

## Troubleshooting

### Certificate Issues

1. **Certificate not trusted**: If using Let's Encrypt staging or self-signed certificates, browsers will show warnings. For production, use Let's Encrypt without the staging flag.

2. **Certificate renewal failures**: Check the certbot logs:

```bash
docker compose logs certbot
```

### Connection Issues

1. **Cannot connect to HTTPS**: Ensure ports 80 and 443 are open in your firewall and/or cloud provider console.

2. **Mixed content warnings**: Ensure all resources (images, scripts, etc.) are loaded over HTTPS.