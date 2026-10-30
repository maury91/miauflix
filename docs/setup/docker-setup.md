# Docker Setup Guide

This guide covers Docker-based deployment and development setup for Miauflix.

## Prebuilt Images

The quickest way to run Miauflix needs no clone and no build. Download [`docker-compose.yml`](../../docker-compose.yml) into an empty folder and start it:

```bash
curl -fsSLO https://raw.githubusercontent.com/maury91/miauflix/main/docker-compose.yml
docker compose up -d
```

Open <http://localhost:3000>, create the admin account, then add your [TMDB access token](https://developer.themoviedb.org/docs) (and optionally Trakt credentials) from the setup screens.

On first boot the `miauflix` logs show `Starting in degraded mode`: that's expected until you complete the setup screens.

> **Image tags:** `docker-compose.yml` uses `latest`, the newest release. Set `MIAUFLIX_VERSION` in `.env` to a version such as `0.0.1` to upgrade only when you choose, or to `edge` to follow `main`.

> **Automatic updates:** `docker-compose.yml` runs [Watchtower](https://watchtower.nickfedor.com/), which pulls the image tag you chose every day at 4:00 (UTC unless you set `TZ`) and recreates the Miauflix containers when it changed. Set `WATCHTOWER_SCHEDULE` in `.env` to change the time (a cron expression with seconds first, e.g. `0 30 3 * * *`), or remove the `watchtower` service to update by hand with `docker compose pull && docker compose up -d`. With a pinned version tag it only picks up rebuilds of that tag.

> **Security:** `docker-compose.yml` sets `ALLOW_CREATE_ADMIN_ON_FIRST_RUN`, which exposes an unauthenticated setup endpoint until the first admin exists. That's why the file publishes port 3000 on `127.0.0.1` only: nobody else can reach Miauflix until you open it up.

> **VPN:** Miauflix won't search for sources until it detects a VPN, because peers would see your real IP. Set one up as described in [Using a VPN](#using-a-vpn), or [opt out](#running-without-a-vpn) if you accept the risk.

### Combining compose files

Every deployment starts from `docker-compose.yml`, and each feature is one more file on top of it. Download the ones you want next to `docker-compose.yml` and list them all in `COMPOSE_FILE` in a `.env` file in the same folder, so plain `docker compose` commands use them together (on Windows, separate them with `;` instead of `:`). `docker-compose.yml` must come first, because later files override earlier ones (listed after `docker-compose.https.yml`, it would turn the unauthenticated admin setup back on); the feature files can follow in any order.

| File                                                                       | Adds                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`docker-compose.vpn.yml`](../../docker-compose.vpn.yml)                   | NordVPN for all traffic, see [Using a VPN](#using-a-vpn)                          |
| [`docker-compose.https.yml`](../../docker-compose.https.yml)               | HTTPS for your domain with Caddy, see [HTTPS with a domain](#https-with-a-domain) |
| [`docker-compose.flaresolverr.yml`](../../docker-compose.flaresolverr.yml) | [FlareSolverr](flaresolverr.md) for sources behind Cloudflare                     |
| [`docker-compose.tracing.yml`](../../docker-compose.tracing.yml)           | [Tracing](../development/tracing.md) to Jaeger, UI on `localhost:16686`           |
| [`docker-compose.build.yml`](../../docker-compose.build.yml)               | Builds the images from a clone, see [Building from source](#building-from-source) |

For example, a VPS behind HTTPS and the VPN, with FlareSolverr:

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.vpn.yml:docker-compose.https.yml:docker-compose.flaresolverr.yml
MIAUFLIX_UPSTREAM=vpn:3000 # with the VPN, Caddy reaches Miauflix through the VPN container
```

`docker compose config --services` lists the services the combination runs. FlareSolverr and Jaeger are defined, switched off, in `docker-compose.yml`: that way the VPN file can move them into the VPN's network whichever files you list.

### Open it to your local network

To watch from a TV, phone or another computer at home, open Miauflix to your network **after** you have created the admin account:

1. In `docker-compose.yml`, change the port mapping of the `miauflix` service:

   ```yaml
   ports:
     - '3000:3000'
   ```

2. Apply the change:

   ```bash
   docker compose up -d
   ```

3. Find this computer's address on your network (`ipconfig getifaddr en0` on macOS, `hostname -I` on Linux, `ipconfig` on Windows) and open `http://<that address>:3000` on the other device. If it doesn't load, allow port 3000 through the computer's firewall.

The admin setup endpoint closes for good once an admin exists, so this is safe on a home network. Don't forward port 3000 on your router: to reach Miauflix from the internet, put it behind HTTPS with a domain as described in [HTTPS with a domain](#https-with-a-domain).

### HTTPS with a domain

To reach Miauflix from the internet (for example on a VPS), add [`docker-compose.https.yml`](../../docker-compose.https.yml) and its [`Caddyfile`](../../Caddyfile). [Caddy](https://caddyserver.com/) gets and renews a Let's Encrypt certificate for your domain and forwards traffic to Miauflix.

1. Point your domain's DNS at the server and allow ports 80 and 443 (TCP) through its firewall.
2. Download both files next to `docker-compose.yml`:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/maury91/miauflix/main/docker-compose.https.yml
   curl -fsSLO https://raw.githubusercontent.com/maury91/miauflix/main/Caddyfile
   ```

3. Create a `.env` file in the same folder:

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml
   MIAUFLIX_DOMAIN=miauflix.example.com
   REVERSE_PROXY_SECRET=<output of: openssl rand -hex 32>
   ```

   `COMPOSE_FILE` lets plain `docker compose` commands use both files (see [Combining compose files](#combining-compose-files)). `REVERSE_PROXY_SECRET` is sent by Caddy on every request: Miauflix only trusts the forwarded client IP when it matches. If you also [use the VPN](#using-a-vpn), list all three files and point Caddy at the VPN container, which owns Miauflix's network:

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.vpn.yml:docker-compose.https.yml
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

To test a branch before merging, open **Actions → CI Pipeline → Run workflow**, pick the branch and run it. After the tests pass it publishes every image tagged with the branch name (`/` becomes `-`, so `fix/buffer` is `fix-buffer`) and `sha-<commit>`; `latest` and `edge` are left alone. Only collaborators with write access to the repository can start a run.

### Using a VPN

Miauflix finds and streams content over BitTorrent, so every peer sees the IP address it connects from. **Use a VPN for anything reachable from the internet**, such as a VPS: without one, torrents go out from the server's real IP. By default Miauflix refuses to search for sources until it detects a NordVPN connection.

[`docker-compose.vpn.yml`](../../docker-compose.vpn.yml) routes Miauflix and its services through NordVPN with [gluetun](https://github.com/qdm12/gluetun). Gluetun's firewall blocks all traffic outside the tunnel, so it also works as a kill switch: if the VPN drops, nothing leaks from your real IP.

1. Get a NordVPN access token: sign in at [my.nordaccount.com/dashboard](https://my.nordaccount.com/dashboard), pick **NordVPN** in the left sidebar, then **Get Access Token** → **Generate New Token**. (It is not under "Manual setup".)
2. Download the VPN file and the key helper next to `docker-compose.yml`:

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
   COMPOSE_FILE=docker-compose.yml:docker-compose.vpn.yml
   NORDVPN_COUNTRIES=Netherlands # optional, comma-separated list of countries to connect to (default: any)
   ```

   If you [set up HTTPS](#https-with-a-domain) or use other files, keep them in the list too, and with HTTPS and `MIAUFLIX_UPSTREAM=vpn:3000` from that section instead, or Caddy drops out of your `docker compose` commands.

5. Start it:

   ```bash
   docker compose up -d
   ```

The `vpn` service owns the network, so Miauflix's port is published from it. To [open it to your local network](#open-it-to-your-local-network), change the `vpn` service's port mapping in `docker-compose.vpn.yml` instead of the `miauflix` one. FlareSolverr and Jaeger, when their files are listed, share the VPN's network too. Gluetun connects to NordVPN's P2P servers and passes Miauflix's VPN check as soon as the tunnel is up; `http://localhost:3000/api/status` reports it under `vpn`.

To check the connection, compare the address the container uses with your own:

```bash
docker compose exec vpn wget -qO- https://ipinfo.io/ip
```

#### Running without a VPN

If you accept that peers see your real IP (for example while trying Miauflix on a laptop), add `DISABLE_VPN_CHECK=true` to a `.env` file next to `docker-compose.yml`. Don't do this on a server.

## Building From Source

`docker-compose.build.yml` builds the `miauflix` and `miauflix-services` images from a clone of the repository instead of pulling them. Everything else works as with the prebuilt images, including the other files in [Combining compose files](#combining-compose-files).

```bash
git clone https://github.com/maury91/miauflix.git && cd miauflix
npm run start:backend:docker:prod
```

`npm run start:backend:docker:prod` (and `stop:` / `restart:`) use the `COMPOSE_FILE` from `.env` when it's set. Otherwise they pick `docker-compose.yml`, `docker-compose.build.yml`, `docker-compose.flaresolverr.yml` and `docker-compose.tracing.yml`, plus `docker-compose.vpn.yml` once `NORDVPN_PRIVATE_KEY` is in `.env`. With your own `COMPOSE_FILE`, run `docker compose up -d --build` after a `git pull` to rebuild.

The build file also mounts `.env` into the `miauflix` container, so settings from the configuration wizard (`npm run config-only:docker`) apply. It runs Miauflix as `USER_ID` / `GROUP_ID`, which the scripts set to your user so the container can read a `.env` only you can read; set them in `.env` when you run `docker compose` directly. You can also skip the wizard and set Miauflix up from the browser like with the prebuilt images. Watchtower stays off: there's no published image to update from.

### Moving from the old source-built stack

The `docker-compose.yml` that built from source before (and `docker-compose.novpn.yml` / `docker-compose.prod.yml`) ran the catalog, list service and Bunqueue as separate containers, put an nginx container with certbot in front, and kept data in `./data`. The stack now keeps data in Docker volumes, uses one `miauflix-services` container, and replaces nginx with [Caddy](#https-with-a-domain). Copy the data over once, with everything stopped (`-f docker-compose.yml` leaves out the VPN, which isn't needed for this):

```bash
docker compose down --remove-orphans
# Backend database and settings
docker compose -f docker-compose.yml run --rm --no-deps --entrypoint sh -v ./data:/old:ro miauflix \
  -c 'cp -a /old/. /usr/src/app/data/'
# List service (Trakt) and media catalog. The VPN variant kept the catalog in ./data itself.
docker compose -f docker-compose.yml run --rm --no-deps --user root --entrypoint sh -v ./data:/old:ro miauflix-services \
  -c 'set -e; mkdir -p /app/data/list-service /app/data/catalog
      cp -a /old/list-service/. /app/data/list-service/
      if [ -d /old/media-catalog ]; then cp -a /old/media-catalog/. /app/data/catalog/; else cp -a /old/catalog.db* /app/data/catalog/; fi
      chown -R bunqueue:bunqueue /app/data'
```

Keep `LIST_SERVICE_ENCRYPTION_KEY` in `.env` if you had set it: the list service needs it to read its data. The backend now listens on `localhost:3000` instead of `5000`. Leave `./data` in place until you've checked everything works.

### Secrets set in `.env`

Miauflix generates `JWT_SECRET`, `STREAM_TOKEN_SECRET`, `STREAM_KEY_SALT` and `SOURCE_SECURITY_KEY` on first start and saves them in its `config.json`. When one is set as an environment variable instead, Miauflix uses it and deliberately doesn't save it, so it's only known for as long as the variable is passed in.

The compose files don't pass these variables, except `docker-compose.build.yml`, which mounts `.env`. If an older setup passed them (the old `docker-compose.https.yml` did, so did the source-built stack through `.env`), check whether they are in `config.json`:

```bash
docker compose exec miauflix node -e 'console.log(Object.keys(require("/usr/src/app/data/config.json")))'
```

If they are missing, pass them in before you recreate the containers. Otherwise Miauflix generates new ones: data encrypted with the old `SOURCE_SECURITY_KEY` can no longer be read, and every user is signed out. Keep the values in `.env` and add a file such as `docker-compose.secrets.yml` at the end of `COMPOSE_FILE`:

```yaml
services:
  miauflix:
    environment:
      JWT_SECRET: ${JWT_SECRET:?}
      STREAM_TOKEN_SECRET: ${STREAM_TOKEN_SECRET:?}
      STREAM_KEY_SALT: ${STREAM_KEY_SALT:?}
      SOURCE_SECURITY_KEY: ${SOURCE_SECURITY_KEY:?}
```

## Docker Services

### Main Services

- **miauflix**: Node.js API server and static-asset frontend host
- **miauflix-services**: Bunqueue, media catalog and list service in one container
- **autoheal**: Restarts the backend when its healthcheck fails (see [Health checks and automatic restarts](#health-checks-and-automatic-restarts))
- **watchtower**: Updates the Miauflix containers when a new image is published (not with `docker-compose.build.yml`)
- **vpn** (`docker-compose.vpn.yml`): [gluetun](https://github.com/qdm12/gluetun) connected to NordVPN; the other services share its network
- **caddy** (`docker-compose.https.yml`): HTTPS reverse proxy with automatic Let's Encrypt certificates
- **flaresolverr** (`docker-compose.flaresolverr.yml`): Cloudflare bypass proxy for protected content sources, see the [FlareSolverr Configuration Guide](flaresolverr.md)
- **jaeger** (`docker-compose.tracing.yml`): Collects OpenTelemetry traces, see [Tracing](../development/tracing.md)

### Health checks and automatic restarts

The image's healthcheck calls `GET /api/health` every 30 s and marks the container unhealthy after 3 failures in a row (each request may take up to 8 s). Failures in the first 5 minutes don't count, so data migrations after an upgrade can finish.

Docker only marks a container unhealthy: `restart: unless-stopped` restarts it when the process exits, not when it hangs. `docker-compose.yml` therefore runs [autoheal](https://github.com/willfarrell/docker-autoheal), which restarts the containers labelled `autoheal=true` (the backend) once they turn unhealthy. It needs the Docker socket, mounted at `/var/run/docker.sock`, and has no network. Check the state with:

```bash
docker compose ps miauflix
docker compose logs autoheal
```

## Development with Docker

### Hot Reload Development

```bash
# Backend and frontend with hot reload (docker-compose.dev.yml, separate from the files above)
npm run start:backend:docker:dev
npm run stop:backend:docker:dev
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

## VPN and HTTPS

Both are files you add to the stack: see [Using a VPN](#using-a-vpn) and [HTTPS with a domain](#https-with-a-domain). Caddy renews its certificates on its own. To disable VPN detection instead (not recommended, peers see your real IP), set `DISABLE_VPN_CHECK=true` in `.env`.

## Environment Variables

Docker deployments use the same environment variables as other installation methods.

**Recommended Setup**: Use the interactive configuration wizard to set up all required variables:

```bash
npm run config-only:docker
```

This will guide you through configuring:

- **Required**: TMDB API access token
- **Optional**: Trakt.tv integration, NordVPN settings
- **Auto-configured**: JWT secrets, server settings

For a complete reference of all available environment variables, see the [Environment Variables Guide](environment-variables.md).

## Volumes and Data Persistence

### Important Volumes

- **`miauflix_data`**: Backend database and settings
- **`miauflix_services_data`**: Media catalog, list service (Trakt) and Bunqueue data
- **`./downloads`** (or `DOWNLOADS_HOST_PATH`): Downloaded content
- **`caddy_data`** (`docker-compose.https.yml`): Certificates

Docker prefixes volume names with the project name, by default the folder name: `docker volume ls` shows them.

### Backup Strategy

```bash
# Backup essential data (with Miauflix stopped)
docker compose stop miauflix miauflix-services
docker compose run --rm --no-deps --entrypoint tar -v "$PWD":/backup miauflix \
  -czf /backup/miauflix-data.tar.gz -C /usr/src/app/data .
docker compose run --rm --no-deps --user root --entrypoint tar -v "$PWD":/backup miauflix-services \
  -czf /backup/miauflix-services-data.tar.gz -C /app/data .
docker compose start miauflix-services miauflix
```

Keep `.env` with the backups: it holds your secrets and `COMPOSE_FILE`. This leaves out `./downloads` (copy it like any folder if you want to keep downloaded content; Miauflix can download it again) and `caddy_data` (Caddy requests new certificates when it starts without them).

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
docker compose exec vpn wget -qO- https://ipinfo.io/ip
```

### Health Checks

**Backend health**:

```bash
curl http://localhost:${PORT:-3000}/api/health
```

**Frontend access**:

```bash
curl -I http://localhost:3000/
```

**HTTPS certificate status** (`docker-compose.https.yml`):

```bash
docker compose logs caddy
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

With the prebuilt images, Watchtower updates them every night. To update right away:

```bash
docker compose pull
docker compose up -d
```

To get newer compose files, download them again. When building from source, rebuild with the same files the stack was started with (`npm run start:backend:docker:prod` picks them as described in [Building from source](#building-from-source)):

```bash
git pull
npm run start:backend:docker:prod
```
