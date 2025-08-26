# Getting Started with Miauflix

> **Quick Start**: Just want to try it? Run these commands and you're done in 5 minutes!

```bash
git clone <repository-url> && cd miauflix
docker compose run --rm backend npm run start:backend -- --only-config
docker compose up -d
```

The first command runs the configuration wizard, then starts the full stack. No local Node.js installation needed!

## Prerequisites

- [Git](https://git-scm.com/) (for cloning the repository)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) (for local development only)
- [TMDB API Access Token](https://developer.themoviedb.org/docs) (required for media content)
- [Trakt.tv API Client ID](https://trakt.tv/oauth/applications) (optional, for list synchronization)
- VPN subscription (optional)

## Installation Options

### Option 1: Docker Setup (Recommended)

#### 1. Clone and Configure

```bash
git clone <repository-url>
cd miauflix

# Interactive configuration wizard
docker compose run --rm backend npm run start:backend -- --only-config
```

This will run the configuration wizard, which will ask you for the required environment variables, and guide you on how to obtain them.

#### 2. [Optional] Set up VPN

If you want to use VPN integration, add your NordVPN private key to `.env`:

```bash
# Follow the guide at: https://github.com/bubuntux/nordlynx/pkgs/container/nordlynx#how-to-get-your-private_key
NORDVPN_PRIVATE_KEY=your-nordvpn-private-key
```

A couple of notes about VPN:

Miauflix can detect if you are connected to a VPN ( only NordVPN for now ) and if it detects it is not automatically disable some functionality.  
You can disable this behavior by setting `DISABLE_VPN_CHECK=true` in `.env`. This is recommended only in the case you are keen to take the risk of not using a VPN or you are using a VPN and you are always 100% sure it is on ( for example through a docker service or piHole )

#### 3. [Optional] Set up HTTPS and domain name

If you want to use HTTPS, you can set up a SSL certificate.

```bash
chmod +x setup-ssl.sh
./setup-ssl.sh -d yourdomain.com
```

This will generate a SSL certificate and a key, and will set up the relevant nginx configuration.

More details on how to set up HTTPS can be found in the [SSL Certificates](ssl-certificates.md) guide.

#### 4. Start Services

```bash
docker compose up -d
```

This will start the services in the background.

#### 5. Access Application

- Frontend: `https://yourdomain.com/`
- API Health: `https://yourdomain.com/health`

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
# Test with Server-Side Rendering (run from frontend directory)
cd frontend && npm run dev:ssr
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

Miauflix will create an initial user with random credentials.

The credentials are stored encrypted in the database, so that is not the right place to look for them.

The credentials will be printed in the logs during the first run, be sure to check the logs and then clean them up.
