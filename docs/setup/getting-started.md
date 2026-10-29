# Getting Started with Miauflix

> **Fastest path:** use the prebuilt images, no clone needed. See [Prebuilt Images](docker-setup.md#prebuilt-images).

> **Build from source**: Just want to try it? Run these commands and you're done in 5 minutes!

```bash
git clone https://github.com/maury91/miauflix.git && cd miauflix
./scripts/start-docker-prod.sh up -d --build
```

The first command clones the repository, the second builds and starts the full stack. Then open <http://localhost:3000>, create the admin account and add your TMDB access token from the setup screens. No local Node.js installation needed!

## Prerequisites

- [Git](https://git-scm.com/) (for cloning the repository)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) (for local development only)
- [TMDB API Access Token](https://developer.themoviedb.org/docs) (required for media content)
- [Trakt.tv OAuth application](https://trakt.tv/oauth/applications) (required when the standalone List Service is enabled)
- [NordVPN](https://nordvpn.com/) subscription (strongly recommended, required to search sources unless you disable the VPN check)

## Installation Options

### Option 1: Docker Setup (Recommended)

#### 1. Clone and Configure

```bash
git clone https://github.com/maury91/miauflix.git
cd miauflix

# Optional: interactive configuration wizard (builds the image from this checkout)
npm run config-only:docker
```

The wizard asks for the required environment variables and guides you on how to obtain them. You can skip it and enter the same settings from the browser setup screens after the first start. With the [prebuilt images](docker-setup.md#prebuilt-images) (`docker-compose.yml` alone), use the browser setup: that file doesn't mount `.env`, so the wizard's settings would not reach Miauflix.

The default Compose topology starts the standalone List Service. Configure the Trakt OAuth credentials during setup, or disable the service if you do not use lists. The List Service stores its generated encryption key at `data/list-service/.list-service-key`. You can instead provide `LIST_SERVICE_ENCRYPTION_KEY` through deployment secrets; keep the active key stable across restarts. See the [environment variables guide](environment-variables.md) for details.

#### 2. Set up the VPN

The stack routes all its traffic through NordVPN with [gluetun](https://github.com/qdm12/gluetun), whose firewall also acts as a kill switch. Get an access token from [my.nordaccount.com/dashboard](https://my.nordaccount.com/dashboard) → **NordVPN** in the left sidebar → **Get Access Token** → **Generate New Token**, then save your private key to `.env`:

```bash
scripts/nordvpn-key.sh
```

Miauflix currently detects only NordVPN and refuses to search for sources when no VPN is detected, because torrents would go out from your real IP. You can override this by setting `DISABLE_VPN_CHECK=true` in `.env`, but only do so if you accept that risk; never on a server reachable from the internet. See [Using a VPN](docker-setup.md#using-a-vpn) for server locations.

#### 3. [Optional] Set up HTTPS and domain name

Add `docker-compose.https.yml` and the `Caddyfile`: [Caddy](https://caddyserver.com/) gets and renews a Let's Encrypt certificate for your domain on its own. Follow [HTTPS with a domain](docker-setup.md#https-with-a-domain).

#### 4. Start Services

```bash
npm run start:backend:docker:prod
```

This builds the images from the checkout and starts the backend with its services (and the VPN once `NORDVPN_PRIVATE_KEY` is set) in the background, using the `COMPOSE_FILE` from `.env` when it's set. See [Building from source](docker-setup.md#building-from-source).

#### 5. Access Application

- Frontend: `https://yourdomain.com/`
- API base: `https://yourdomain.com/api`
- Health check: `https://yourdomain.com/api/health`

### Option 2: Local Development

#### Frontend Development

```bash
# Install dependencies
npm install

# Start with hot reload (recommended for development)
npm run start:frontend
```

The development server provides instant hot reload and fast feedback for UI work.

#### SSR Testing

```bash
# Test with Server-Side Rendering
npm run start:frontend:ssr
```

Use this only when testing SSR-specific functionality or debugging SSR issues.

#### Backend Development

```bash
# Interactive configuration and start
npm run start:backend

# Development with mock data
npm run start:backend:e2e
```

## Configuration System

<p align="center">
  <img src="../assets/miauflix%20env%20wizard.gif" alt="Miauflix Environment Setup Wizard" width="800">
</p>

Miauflix includes an intelligent configuration wizard that:

- ✅ Automatically detects missing environment variables
- 🧙‍♂️ Guides you through an interactive setup process
- 🔄 Tests API credentials in real-time as you enter them
- 📝 Provides helpful guidance on obtaining required tokens
- 💾 Saves all settings to a `.env` file when completed

### Manual Configuration

If running in a non-interactive environment, create a `.env` file with the required variables.

For a complete reference of all available environment variables, see the [Environment Variables Guide](environment-variables.md).

## Initial User

There are two ways to create the first admin account.

### Default: auto-generated credentials

By default, Miauflix generates an admin account on first startup and prints the credentials to the logs:

```bash
# Retrieve credentials from the startup logs
docker compose logs miauflix --since=15m
```

Until you finish the setup screens, the logs also show `Starting in degraded mode`; that's expected on first boot.

Change the password after first login. Avoid storing the printed credentials in tickets or log archives.

### Alternative: setup endpoint

Set `ALLOW_CREATE_ADMIN_ON_FIRST_RUN=true` in `.env` to skip auto-generation. Instead, a one-time unauthenticated endpoint is exposed:

```bash
curl -X POST http://localhost:3000/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}'
```

The endpoint returns `201` on success and becomes permanently unavailable once any admin account exists. Use this mode when you want to keep credentials out of the logs — for example in automated or shared deployments.

For full details see [Environment Variables — Initial User](environment-variables.md#initial-user).
