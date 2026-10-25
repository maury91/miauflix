# Docker Setup Guide

This guide covers Docker-based deployment and development setup for Miauflix.

## Prebuilt Images

The quickest way to run Miauflix needs no clone and no build. Download [`docker-compose.quickstart.yml`](../../docker-compose.quickstart.yml) and start it:

```bash
curl -fsSLO https://raw.githubusercontent.com/maury91/miauflix/main/docker-compose.quickstart.yml
docker compose -f docker-compose.quickstart.yml up -d
```

Open <http://localhost:3000>, create the admin account, then add your [TMDB access token](https://developer.themoviedb.org/docs) (and optionally Trakt credentials) from the setup screens.

> **Security:** the quick-start file sets `ALLOW_CREATE_ADMIN_ON_FIRST_RUN`, which exposes an unauthenticated setup endpoint until the first admin exists. Create the admin right away, and don't expose port 3000 to the internet before you do.

### Published images

| Image                                    | Contents                                              |
| ---------------------------------------- | ----------------------------------------------------- |
| `ghcr.io/maury91/miauflix`               | Main backend, also serves the web frontend            |
| `ghcr.io/maury91/miauflix-services`      | Bunqueue, media catalog and list service in one image |
| `ghcr.io/maury91/miauflix-media-catalog` | Media catalog service on its own                      |
| `ghcr.io/maury91/miauflix-list-service`  | List (Trakt) service on its own                       |

All images are built for `linux/amd64` and `linux/arm64`. Tags: `latest` and `X.Y.Z` / `X.Y` / `X` for releases, `edge` for the latest `main`, and `sha-<commit>` for a specific commit. Pin a version tag for stable deployments.

### Using a VPN

Route Miauflix through a VPN container by merging the services below into `docker-compose.quickstart.yml`, and add your key as `NORDVPN_PRIVATE_KEY` in a `.env` file next to it ([how to get it](https://github.com/bubuntux/nordlynx/pkgs/container/nordlynx#how-to-get-your-private_key)). The VPN container owns the network, so the published port moves to it and the other services use `network_mode`:

```yaml
services:
  vpn:
    image: ghcr.io/bubuntux/nordlynx
    cap_add: [NET_ADMIN]
    environment:
      PRIVATE_KEY: ${NORDVPN_PRIVATE_KEY}
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
    ports:
      - '3000:3000'
    restart: unless-stopped

  miauflix:
    network_mode: service:vpn
    environment:
      BUNQUEUE_HOST: 127.0.0.1
      CATALOG_SERVICE_URL: http://127.0.0.1:3001
      LIST_SERVICE_URL: http://127.0.0.1:3002
    depends_on:
      - vpn
      - miauflix-services

  miauflix-services:
    network_mode: service:vpn
    depends_on:
      - vpn
```

Remove the `ports` and `DISABLE_VPN_CHECK` entries from the `miauflix` service in this layout.

## Building From Source

To build the images yourself from a clone of the repository:

```bash
# 1. Clone repository
git clone https://github.com/maury91/miauflix.git && cd miauflix

# 2. Interactive configuration wizard
docker compose run --rm miauflix npm run config-only

# 3. Start all services in background
docker compose up -d
```

This will run the configuration wizard, then start the complete Miauflix stack with all required services.

### Alternative: Backend-Only Production Deployment

For backend-only deployment with Docker:

```bash
# Start backend in production mode (builds automatically)
npm run start:backend:docker:prod
```

This command starts only the backend service using Docker Compose in production mode with automatic building. Use this when you only need the API server without nginx, VPN, or other services.

## Docker Services

### Main Services

- **miauflix**: Node.js API server and static-asset frontend host
- **nginx**: Reverse proxy with SSL termination and static file serving
- **nordvpn**: VPN container (optional, for privacy protection)
- **flaresolverr**: Cloudflare bypass proxy (optional, for accessing protected content sources)
- **certbot**: Automatic SSL certificate management via Let's Encrypt

### Service Configuration

#### Backend Service

```yaml
miauflix:
  build: .
  ports:
    - '${PORT:-3000}:${PORT:-3000}' # App port (API under /api and static frontend)
  environment:
    - NODE_ENV=production
    - PORT=${PORT:-3000} # Server listening port
  restart: unless-stopped
  healthcheck:
    test: ['CMD-SHELL', 'curl -fsS http://localhost:${PORT:-3000}/api/health || exit 1']
    interval: 10s
    timeout: 3s
    retries: 5
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

#### FlareSolverr Service

```yaml
flaresolverr:
  image: ghcr.io/flaresolverr/flaresolverr:latest
  container_name: miauflix-flaresolverr
  depends_on:
    vpn:
      condition: service_healthy
  environment:
    - LOG_LEVEL=info
    - LOG_HTML=false
    - CAPTCHA_SOLVER=none
    - TZ=${TZ:-UTC}
  network_mode: service:vpn # Route traffic through NordVPN
  volumes:
    - /var/lib/flaresolver:/config
  restart: unless-stopped
```

**Key Features:**

- **VPN Integration**: Traffic is routed through the NordVPN service for privacy (`network_mode: service:vpn`)
- **Persistent Storage**: Configuration stored in `/var/lib/flaresolver` volume
- **Auto-restart**: Automatically restarts if the container stops
- **Cloudflare Bypass**: Automatically solves Cloudflare challenges for protected content sources

**Configuration:**

FlareSolverr is configured via environment variables in the `miauflix` service:

```yaml
environment:
  - FLARESOLVERR_URL=${FLARESOLVERR_URL:-http://localhost:8191}
  - ENABLE_FLARESOLVERR=${ENABLE_FLARESOLVERR:-true}
```

For detailed FlareSolverr setup and troubleshooting, see the [FlareSolverr Configuration Guide](flaresolverr.md).

## Development with Docker

### Hot Reload Development

```bash
# Start with development overrides
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Backend with hot reload
docker compose exec miauflix npm run dev

# Frontend development (separate terminal)
docker compose exec miauflix npm run start:frontend
```

### Trusted Local HTTPS

The development startup creates private, host-owned data directories without sudo. Development images do not require the production service UID/GID ownership. If existing data directories are inaccessible, restore access for your host user before starting; the script reports the affected path and preserves existing data and permissions.

Run `bash scripts/test-development-data-dir.sh` to check fresh and repeat directory preparation without Docker or sudo.

On macOS, create and trust the local development certificate before starting the Docker development stack:

```bash
./scripts/setup-dev-certificate.sh
npm run start:backend:docker:dev
```

To store certificates outside the default `.certs` directory, set `MIAUFLIX_DEV_CERT_DIR` for both commands. Relative paths are resolved from the repository root; absolute paths are used as provided.

```bash
MIAUFLIX_DEV_CERT_DIR=./dev-certs ./scripts/setup-dev-certificate.sh
MIAUFLIX_DEV_CERT_DIR=./dev-certs npm run start:backend:docker:dev
```

### Testing Environment

```bash
# E2E testing environment
npm run start:backend:e2e

# Run specific tests
npm run test:backend:e2e:dev
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
docker compose run --rm miauflix npm run config-only
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
docker compose logs miauflix

# Restart specific service
docker compose restart miauflix
```

**Permission issues**:

```bash
# Fix file permissions
sudo chown -R $USER:$USER .
```

**Network connectivity**:

```bash
# Check container networking
docker compose exec miauflix curl -I https://www.google.com

# Check VPN status (if using VPN)
docker compose exec nordvpn curl ifconfig.me
```

### Health Checks

**Backend health**:

```bash
curl http://localhost:${PORT:-3000}/api/health
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
  miauflix:
    mem_limit: 1g
    cpus: '0.50'
```

### Caching Configuration

The application includes multi-layer caching that works automatically in Docker deployment.

#### BuildKit Cache Mounts

Docker builds use BuildKit cache mounts to significantly speed up rebuilds:

- **npm cache**: Persists `~/.npm` between builds for faster dependency installation
- **Turborepo cache**: Persists `.turbo/` directories to reuse build outputs
- **Vite cache**: Persists Vite's dependency pre-bundling cache
- **TypeScript build info**: Automatically cached via `.tsbuildinfo` files

**Requirements:**

- Docker 20.10+ with BuildKit enabled
- Set `DOCKER_BUILDKIT=1` or use `docker buildx build`

**Usage:**

```bash
# Build with BuildKit (automatic in Docker Compose v2+)
DOCKER_BUILDKIT=1 docker build -t miauflix .

# Or use buildx
docker buildx build -t miauflix .

# Using docker-compose (BuildKit enabled by default in v2+)
docker compose build
```

**Expected Performance:**

- First build: Same as before (no cache)
- Subsequent builds (no changes): **50-70% faster**
- Subsequent builds (dependency changes only): **30-50% faster**
- Subsequent builds (source changes only): **60-80% faster** (with Turborepo cache)

Cache mounts persist on the same machine. For CI/CD, use GitHub Actions cache (already configured in `.github/workflows/ci.yml`).

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
docker compose top miauflix
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
