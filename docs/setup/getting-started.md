# Getting Started with Miauflix

> **Fastest path:** use the prebuilt images, no clone needed. See [Prebuilt Images](docker-setup.md#prebuilt-images).

> **Build from source**: Just want to try it? Run these commands and you're done in 5 minutes!

```bash
git clone https://github.com/maury91/miauflix.git && cd miauflix
docker compose run --rm miauflix npm run config-only
docker compose up -d
```

The first command clones the repository, the second runs the configuration wizard, and the third starts the full stack. No local Node.js installation needed!

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

# Interactive configuration wizard
docker compose run --rm miauflix npm run config-only
```

This will run the configuration wizard, which will ask you for the required environment variables, and guide you on how to obtain them.

The default Compose topology starts the standalone List Service. Configure the Trakt OAuth credentials during setup, or disable the service if you do not use lists. The List Service stores its generated encryption key at `data/list-service/.list-service-key`. You can instead provide `LIST_SERVICE_ENCRYPTION_KEY` through deployment secrets; keep the active key stable across restarts. See the [environment variables guide](environment-variables.md) for details.

#### 2. Set up the VPN

The stack routes all its traffic through NordVPN with [gluetun](https://github.com/qdm12/gluetun), whose firewall also acts as a kill switch. Get an access token from [my.nordaccount.com/dashboard](https://my.nordaccount.com/dashboard) → **NordVPN** in the left sidebar → **Get Access Token** → **Generate New Token**, then save your private key to `.env`:

```bash
scripts/nordvpn-key.sh
```

Miauflix currently detects only NordVPN and refuses to search for sources when no VPN is detected, because torrents would go out from your real IP. You can override this by setting `DISABLE_VPN_CHECK=true` in `.env`, but only do so if you accept that risk; never on a server reachable from the internet. See [Docker Setup](docker-setup.md#nordvpn-setup) for server locations.

#### 3. [Optional] Set up HTTPS and domain name

If you want to use HTTPS, you can set up an SSL certificate.

```bash
chmod +x setup-ssl.sh
./setup-ssl.sh -d yourdomain.com
```

This will generate an SSL certificate and key, and configure Nginx accordingly.

More details on how to set up HTTPS can be found in the [SSL Certificates](ssl-certificates.md) guide.

#### 4. Start Services

```bash
# Option 1: Start all services
docker compose up -d

# Option 2: Start backend only in production mode
npm run start:backend:docker:prod
```

The first option starts all services (backend, nginx, VPN, etc.) in the background. The second option starts only the backend service in production mode with automatic building.

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
