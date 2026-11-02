# Getting Started with Miauflix

> **Fastest path:** use the prebuilt images, no clone needed. See [Prebuilt Images](docker-setup.md#prebuilt-images).

> **Build from source:** clone the repository and start the Docker stack:

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
- [Trakt.tv OAuth application](https://trakt.tv/oauth/applications) (optional; required to use Trakt-backed lists and synchronization)
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

The wizard detects missing settings, offers connection tests, and saves application configuration in the persistent data directory. You can skip it and enter settings from the browser after the first start. With the [prebuilt images](docker-setup.md#prebuilt-images), browser setup is the simplest path. Keep the application and services data volumes across container recreation.

The default Compose topology includes the standalone List Service. Configure Trakt credentials to use its lists and synchronization, or dismiss the optional setup prompt to continue browsing without them. The List Service stores its generated encryption key at `data/list-service/.list-service-key`. You can instead provide `LIST_SERVICE_ENCRYPTION_KEY` through deployment secrets; keep the active key stable across restarts. See the [environment variables guide](environment-variables.md) for details.

#### 2. Set up the VPN

The optional VPN Compose file routes the stack through NordVPN with [gluetun](https://github.com/qdm12/gluetun), whose firewall also acts as a kill switch. Get an access token from [my.nordaccount.com/dashboard](https://my.nordaccount.com/dashboard) → **NordVPN** in the left sidebar → **Get Access Token** → **Generate New Token**, then save your private key to `.env`:

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
- 💾 Saves application settings in the persistent config store, with secrets encrypted

### Manual Configuration

Environment variables can supply bootstrap settings. Docker Compose also uses `.env` for deployment choices such as VPN, domain, and image version; only values passed or mounted into a service are visible to that service. Saved application settings can override bootstrap environment values. Prefer the browser configuration editor for later changes.

For a complete reference of all available environment variables, see the [Environment Variables Guide](environment-variables.md).

## Initial User

The supplied base Compose file enables browser setup (`ALLOW_CREATE_ADMIN_ON_FIRST_RUN=true`). On first start, open Miauflix on this computer and choose the first administrator's email and password. Complete this step before opening the server to other devices. The one-time setup closes after an administrator exists.

If you run the backend directly with that option unset or `false`, it instead generates an administrator account on first startup and prints its credentials to the logs. The HTTPS Compose overlay also uses this generated-account mode because it disables unauthenticated setup. Keep those logs private. A profile/password editor is still planned; do not rely on an existing change-password screen.

An administrator can create additional accounts through the authenticated API. The account-creation screen is still planned. See [Accounts](../features/accounts.md) for current account features and [Environment Variables — Initial User](environment-variables.md#initial-user) for the setup modes.

## What to try next

Browse the [feature guide](../features.md) for movies and TV episodes, resume playback, personal watchlists, subtitles, Samsung TV support, and the current limitations. Future work is tracked separately in [ToDo.md](../../ToDo.md).
