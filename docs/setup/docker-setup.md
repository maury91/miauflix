# Docker Setup Guide

This guide covers Docker-based deployment and development setup for Miauflix.

## Prebuilt Images

The quickest way to run Miauflix needs no clone and no build. Download [`docker-compose.quickstart.yml`](../../docker-compose.quickstart.yml) and start it:

```bash
curl -fsSLO https://raw.githubusercontent.com/maury91/miauflix/main/docker-compose.quickstart.yml
docker compose -f docker-compose.quickstart.yml up -d
```

Open <http://localhost:3000>, create the admin account, then add your [TMDB access token](https://developer.themoviedb.org/docs) (and optionally Trakt credentials) from the setup screens.

On first boot the `miauflix` logs show `Starting in degraded mode`: that's expected until you complete the setup screens.

> **Image tags:** the quick-start file uses `latest`, the newest release. Pin a version such as `0.0.1` to upgrade only when you choose, or use `edge` to follow `main`.

> **Security:** the quick-start file sets `ALLOW_CREATE_ADMIN_ON_FIRST_RUN`, which exposes an unauthenticated setup endpoint until the first admin exists. That's why the file publishes port 3000 on `127.0.0.1` only: nobody else can reach Miauflix until you open it up.

> **VPN:** Miauflix won't search for sources until it detects a VPN, because peers would see your real IP. Set one up as described in [Using a VPN](#using-a-vpn), or [opt out](#running-without-a-vpn) if you accept the risk.

### Open it to your local network

To watch from a TV, phone or another computer at home, open Miauflix to your network **after** you have created the admin account:

1. In `docker-compose.quickstart.yml`, change the port mapping of the `miauflix` service:

   ```yaml
   ports:
     - '3000:3000'
   ```

2. Apply the change:

   ```bash
   docker compose -f docker-compose.quickstart.yml up -d
   ```

3. Find this computer's address on your network (`ipconfig getifaddr en0` on macOS, `hostname -I` on Linux, `ipconfig` on Windows) and open `http://<that address>:3000` on the other device. If it doesn't load, allow port 3000 through the computer's firewall.

The admin setup endpoint closes for good once an admin exists, so this is safe on a home network. Don't forward port 3000 on your router: to reach Miauflix from the internet, put it behind HTTPS with a domain as described in [HTTPS with a domain](#https-with-a-domain).

### HTTPS with a domain

To reach Miauflix from the internet (for example on a VPS), add [`docker-compose.https.yml`](../../docker-compose.https.yml) and its [`Caddyfile`](../../Caddyfile). [Caddy](https://caddyserver.com/) gets and renews a Let's Encrypt certificate for your domain and forwards traffic to Miauflix.

1. Point your domain's DNS at the server and allow ports 80 and 443 (TCP) through its firewall.
2. Download both files next to `docker-compose.quickstart.yml`:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/maury91/miauflix/main/docker-compose.https.yml
   curl -fsSLO https://raw.githubusercontent.com/maury91/miauflix/main/Caddyfile
   ```

3. Create a `.env` file in the same folder:

   ```bash
   COMPOSE_FILE=docker-compose.quickstart.yml:docker-compose.https.yml
   MIAUFLIX_DOMAIN=miauflix.example.com
   REVERSE_PROXY_SECRET=<output of: openssl rand -hex 32>
   ```

   `COMPOSE_FILE` lets plain `docker compose` commands use both files (on Windows, separate them with `;` instead of `:`). `REVERSE_PROXY_SECRET` is sent by Caddy on every request: Miauflix only trusts the forwarded client IP when it matches. If you also [use the VPN](#using-a-vpn), list all three files and point Caddy at the VPN container, which owns Miauflix's network:

   ```bash
   COMPOSE_FILE=docker-compose.quickstart.yml:docker-compose.vpn.yml:docker-compose.https.yml
   MIAUFLIX_UPSTREAM=vpn:3000
   ```

4. Start it and read the generated admin credentials:

   ```bash
   docker compose up -d
   docker compose logs miauflix --since=15m
   ```

Open `https://<your domain>` and sign in. The HTTPS file turns off `ALLOW_CREATE_ADMIN_ON_FIRST_RUN`, since the setup endpoint would otherwise be open to the internet, so Miauflix prints a generated admin account to the logs instead (see [Initial User](getting-started.md#initial-user)). It also sets `COOKIE_SECURE=true` so session cookies are only sent over HTTPS, and `CORS_ORIGIN=https://<your domain>`: the realtime connection (live playback updates, notifications, search) only accepts that origin, and the default allows only `localhost`. Port 3000 stays bound to `127.0.0.1`: all outside traffic goes through Caddy.

The `Caddyfile` serves HTTP/1.1 and HTTP/2 only. HTTP/3 runs over UDP, and for a viewer whose own connection goes through a VPN it delivered video at about 4 Mbit/s, while HTTP/2 over the same path did about 150 Mbit/s. To turn HTTP/3 back on, remove the `servers` block at the top of the `Caddyfile`, add `- '443:443/udp'` to the `caddy` ports, and on Linux raise the kernel's UDP buffers (`net.core.rmem_max` and `net.core.wmem_max` to `7500000`), or Caddy's HTTP/3 stalls as well.

### Published images

| Image                                    | Contents                                              |
| ---------------------------------------- | ----------------------------------------------------- |
| `ghcr.io/maury91/miauflix`               | Main backend, also serves the web frontend            |
| `ghcr.io/maury91/miauflix-services`      | Bunqueue, media catalog and list service in one image |
| `ghcr.io/maury91/miauflix-media-catalog` | Media catalog service on its own                      |
| `ghcr.io/maury91/miauflix-list-service`  | List (Trakt) service on its own                       |

All images are built for `linux/amd64` and `linux/arm64`. Tags: `latest` and `X.Y.Z` / `X.Y` / `X` for [releases](https://github.com/maury91/miauflix/releases), `edge` for the latest `main`, and `sha-<commit>` for a specific commit. Pin a version tag for stable deployments.

### Using a VPN

Miauflix finds and streams content over BitTorrent, so every peer sees the IP address it connects from. **Use a VPN for anything reachable from the internet**, such as a VPS: without one, torrents go out from the server's real IP. By default Miauflix refuses to search for sources until it detects a NordVPN connection.

[`docker-compose.vpn.yml`](../../docker-compose.vpn.yml) routes the quick start through NordVPN with [gluetun](https://github.com/qdm12/gluetun). Gluetun's firewall blocks all traffic outside the tunnel, so it also works as a kill switch: if the VPN drops, nothing leaks from your real IP.

1. Get a NordVPN access token: sign in at [my.nordaccount.com/dashboard](https://my.nordaccount.com/dashboard), pick **NordVPN** in the left sidebar, then **Get Access Token** → **Generate New Token**. (It is not under "Manual setup".)
2. Download the VPN file and the key helper next to `docker-compose.quickstart.yml`:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/maury91/miauflix/main/docker-compose.vpn.yml
   curl -fsSLO https://raw.githubusercontent.com/maury91/miauflix/main/scripts/nordvpn-key.sh
   ```

3. Turn the token into your NordLynx (WireGuard) private key. The script asks for the token without echoing it, fetches the key from NordVPN, and saves it as `NORDVPN_PRIVATE_KEY` in `.env` (readable only by you) without printing either value:

   ```bash
   bash nordvpn-key.sh
   ```

4. Add these lines to the same `.env` file, so plain `docker compose` commands use both files (on Windows, separate them with `;` instead of `:`):

   ```bash
   COMPOSE_FILE=docker-compose.quickstart.yml:docker-compose.vpn.yml
   NORDVPN_COUNTRIES=Netherlands # optional, comma-separated list of countries to connect to
   ```

   If you [set up HTTPS](#https-with-a-domain), keep all three files and `MIAUFLIX_UPSTREAM=vpn:3000` from that section instead, or Caddy drops out of your `docker compose` commands.

5. Start it:

   ```bash
   docker compose up -d
   ```

The `vpn` service owns the network, so Miauflix's port is published from it. To [open it to your local network](#open-it-to-your-local-network), change the `vpn` service's port mapping in `docker-compose.vpn.yml` instead of the `miauflix` one. Gluetun connects to NordVPN's P2P servers and passes Miauflix's VPN check as soon as the tunnel is up; `http://localhost:3000/api/status` reports it under `vpn`.

To check the connection, compare the address the container uses with your own:

```bash
docker compose exec vpn wget -qO- https://ipinfo.io/ip
```

#### Running without a VPN

If you accept that peers see your real IP (for example while trying Miauflix on a laptop), add `DISABLE_VPN_CHECK=true` to a `.env` file next to `docker-compose.quickstart.yml`. Don't do this on a server.

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
- **nordvpn**: [gluetun](https://github.com/qdm12/gluetun) VPN container connected to NordVPN; the other services share its network
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

The full stack routes every service through the `nordvpn` container, which runs [gluetun](https://github.com/qdm12/gluetun) connected to NordVPN's P2P servers. Gluetun's firewall blocks all traffic outside the tunnel, so it doubles as a kill switch.

#### 1. Get NordVPN Private Key

Get an access token from [my.nordaccount.com/dashboard](https://my.nordaccount.com/dashboard) → **NordVPN** in the left sidebar → **Get Access Token** → **Generate New Token**, then run:

```bash
scripts/nordvpn-key.sh
```

The script asks for the token and saves your NordLynx (WireGuard) private key as `NORDVPN_PRIVATE_KEY` in `.env` without printing it.

#### 2. Choose Server Locations (Optional)

The stack connects to the United States by default. To change it, set a comma-separated list in `.env`:

```bash
NORDVPN_COUNTRIES=Switzerland,Netherlands
```

#### 3. VPN Detection

Miauflix checks with NordVPN that its traffic is protected and refuses to search for sources when it isn't. Any NordVPN connection passes the check.

To disable VPN detection (not recommended, peers see your real IP):

```bash
DISABLE_VPN_CHECK=true
```

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
docker compose exec nordvpn wget -qO- https://ipinfo.io/ip
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
