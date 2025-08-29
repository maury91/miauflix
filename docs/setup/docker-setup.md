# Docker Setup Guide

This guide covers Docker-based deployment and development setup for Miauflix.

## Quick Docker Setup

The fastest way to get Miauflix running with Docker:

```bash
# 1. Clone repository
git clone <repository-url> && cd miauflix

# 2. Interactive configuration wizard
docker compose run --rm backend npm run config-only

# 3. Start all services in background
docker compose up -d
```

This will run the configuration wizard, then start the complete Miauflix stack with all required services.

## Docker Services

### Main Services

- **backend**: Node.js API server and frontend host
- **nginx**: Reverse proxy with SSL termination and static file serving
- **nordvpn**: VPN container (optional, for privacy protection)
- **certbot**: Automatic SSL certificate management via Let's Encrypt

### Service Configuration

#### Backend Service

```yaml
backend:
  build: .
  ports:
    - '${PORT:-3000}:${PORT:-3000}' # Backend API server port
  environment:
    - NODE_ENV=production
    - PORT=${PORT:-3000} # Server listening port
  volumes:
    - .:/app
    - /app/node_modules
```

#### Nginx Service

```yaml
nginx:
  image: nginx:alpine
  ports:
    - '80:80'
    - '443:443'
  volumes:
    - ./nginx/conf.d:/etc/nginx/conf.d
    - ./nginx/certbot/conf:/etc/letsencrypt
    - ./nginx/certbot/www:/var/www/certbot
```

## Development with Docker

### Hot Reload Development

```bash
# Start with development overrides
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Backend with hot reload
docker compose exec backend npm run dev

# Frontend development (separate terminal)
docker compose exec backend npm run start:frontend
```

### Testing Environment

```bash
# E2E testing environment
docker compose -f docker-compose.test.yml up

# Run specific tests
docker compose exec backend npm run test:e2e
```

## VPN Configuration (Optional)

### NordVPN Setup

Miauflix can integrate with NordVPN for enhanced privacy and content access:

#### 1. Get NordVPN Private Key

Follow [this guide](https://github.com/bubuntux/nordlynx/pkgs/container/nordlynx#how-to-get-your-private_key) to obtain your NordVPN WireGuard private key.

#### 2. Configure VPN in Environment

Add your private key to `.env`:

```bash
NORDVPN_PRIVATE_KEY=your-private-key-here
```

#### 3. Enable VPN Detection

Miauflix can detect if you're connected to NordVPN and automatically adjust functionality. This ensures optimal privacy protection for content discovery.

To disable VPN detection (not recommended):

```bash
DISABLE_VPN_CHECK=true
```

**Note**: Using a VPN is strongly recommended for privacy protection when accessing content sources.

## SSL and HTTPS

### Automatic SSL Setup

Miauflix includes an automated SSL setup script for easy HTTPS configuration:

```bash
chmod +x setup-ssl.sh
./setup-ssl.sh -d yourdomain.com
```

This script automatically handles:

- Domain DNS verification
- Let's Encrypt certificate generation
- Nginx HTTPS configuration
- Automatic certificate renewal setup

The script will guide you through the process and verify that your domain is properly configured before issuing certificates.

### Manual Certificate Configuration

For custom certificates, place them in:

```plaintext
nginx/ssl/
├── cert.pem
├── privkey.pem
└── chain.pem
```

## Environment Variables

Docker deployments use the same environment variables as other installation methods.

**Recommended Setup**: Use the interactive configuration wizard to set up all required variables:

```bash
docker compose run --rm backend npm run config-only
```

This will guide you through configuring:

- **Required**: TMDB API access token
- **Optional**: Trakt.tv integration, NordVPN settings
- **Auto-configured**: JWT secrets, server settings

For a complete reference of all available environment variables, see the [Environment Variables Guide](environment-variables.md).

## Volumes and Data Persistence

### Important Volumes

- **Application data**: `./data` → Persistent storage for database and cache
- **SSL certificates**: `./nginx/certbot/conf` → Let's Encrypt certificates
- **Logs**: `./logs` → Application and nginx logs

### Backup Strategy

```bash
# Backup essential data
tar -czf miauflix-backup.tar.gz data/ nginx/certbot/conf/ .env

# Restore from backup
tar -xzf miauflix-backup.tar.gz
```

## Troubleshooting

### Common Issues

**Container won't start**:

```bash
# Check logs
docker compose logs backend

# Restart specific service
docker compose restart backend
```

**Permission issues**:

```bash
# Fix file permissions
sudo chown -R $USER:$USER .
```

**Network connectivity**:

```bash
# Check container networking
docker compose exec backend ping google.com

# Check VPN status (if using VPN)
docker compose exec nordvpn curl ifconfig.me
```

### Health Checks

**Backend health**:

```bash
curl http://localhost:${PORT:-3000}/health
```

**Frontend access**:

```bash
curl -I http://localhost/
```

**SSL certificate status**:

```bash
docker compose exec certbot certbot certificates
```

## Performance Optimization

### Resource Limits

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
        reservations:
          memory: 512M
          cpus: '0.25'
```

### Caching Configuration

The application includes multi-layer caching that works automatically in Docker deployment.

## Monitoring

### Log Management

```bash
# View logs
docker compose logs -f

# Log rotation (configure in docker-compose.yml)
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Container Stats

```bash
# Monitor resource usage
docker stats

# Specific service stats
docker compose exec backend top
```

## Updates and Maintenance

### Updating Miauflix

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose build --no-cache
docker compose up -d
```

### Certificate Renewal

Let's Encrypt certificates renew automatically. Manual renewal:

```bash
docker compose exec certbot certbot renew
docker compose restart nginx
```
