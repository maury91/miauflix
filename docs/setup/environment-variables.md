# Environment Variables Reference

Miauflix uses environment variables for bootstrap and deployment settings. Application settings can be edited in the browser or CLI configuration wizard and are persisted in the data directory. Saved application values can override environment defaults.

**For Docker installations, start with browser setup.** The CLI wizard is also available from a source checkout. This page covers commonly used settings; the configuration UI reflects each running service's current schema.

## Quick Setup (Recommended)

```bash
# Interactive configuration wizard
npm run config

# Or configuration only (without starting server)
npm run config-only
```

The configuration wizard will:

- ✅ Detect missing required settings
- 🧪 Test API credentials in real-time
- 💾 Persist application configuration, with secrets encrypted at rest
- 🔗 Provide links to obtain API keys

See [Configuration Guide](../../backend/docs/configuration.md) for detailed wizard documentation.

## Manual Configuration

For a source checkout, a root `.env` can provide bootstrap values. For Docker, `.env` also controls Compose substitutions: a variable reaches an application container only if the Compose file passes it through or mounts the file. Use the application configuration editor for saved service settings.

### Required Variables

#### Media Catalog Service (Required)

The media catalog (TMDB today) runs as its own Bun service. Configure its published settings through Miauflix's UI or CLI and retain the application and service data volumes and encryption keys. The backend needs the service address; the default Compose file supplies it automatically:

```bash
# Default Docker Compose deployment (internal network)
CATALOG_SERVICE_URL=http://miauflix-services:3001

# Host-run development only
# CATALOG_SERVICE_URL=http://localhost:3001
```

#### Media load service

The torrent engine runs as its own Bun service (port 3004, in the services container). It downloads, stores and streams sources and answers tracker scrapes. The default Compose files set the address:

```bash
MEDIA_LOAD_SERVICE_URL=http://miauflix-services:3004
# Host-run development only
# MEDIA_LOAD_SERVICE_URL=http://localhost:3004
```

These settings belong to this service's `MEDIA_LOAD` group. The backend keeps the stored or environment value and pushes it to the service, so set them where you set the backend's:

- the download settings: `CONTENT_DOWNLOAD_LIMIT`, `CONTENT_UPLOAD_LIMIT`, `CONTENT_CONNECTION_LIMIT`, `CONTENT_CONNECTION_BUDGET`, `CONTENT_SEED_DURATION_SECONDS` and `DISABLE_DISCOVERY`
- the storage settings: `STORAGE_THRESHOLD`, `STORAGE_PLAYBACK_RESERVE`, `DOWNLOAD_PATH` and `DOWNLOAD_SALT`
- the trackers: `STATIC_TRACKERS`, `BEST_TRACKERS_DOWNLOAD_URL`, `BLACKLISTED_TRACKERS_DOWNLOAD_URL` and `SCRAPE_TRACKERS` (comma-separated UDP or HTTP announce URLs, advanced)

Limits and storage thresholds apply at once. The connection settings, `DISABLE_DISCOVERY` and the tracker lists apply when the service restarts.

`DOWNLOAD_PATH` is a path inside the services container. The Compose files mount the downloads folder (`DOWNLOADS_HOST_PATH`) there at `/usr/src/app/downloads`.

The service keeps its records in `MEDIA_LOAD_DATA_DIR` (`/app/data/media-load` in the services image). They are encrypted with the backend's `SOURCE_SECURITY_KEY`, which the backend sends when it connects, so keep that key and the services data volume together.

TMDB and Trakt settings appear in the setup and administrator configuration UI through the connected services' schemas. Use that UI for later changes; bootstrap environment values may already have been superseded by saved settings.

```bash
# Optional backend bootstrap value for the TMDB API access token
TMDB_API_ACCESS_TOKEN=your-tmdb-token
```

- **Description**: Access token for the catalog provider API (TMDB v3 today)
- **Get from**: [TMDB API Settings](https://www.themoviedb.org/settings/api)
- **Format**: JWT token starting with `eyJ`
- **Configuration**: Prefer the app UI; the backend reads this environment variable as an initial value.

### External API Integration

#### Trakt.tv list service

```bash
# Optional backend bootstrap values; normally configure these once in the `TRAKT` group
TRAKT_CLIENT_ID=your-client-id
TRAKT_CLIENT_SECRET=your-client-secret
TRAKT_REDIRECT_URI=https://your.example.com/trakt/callback
LIST_SERVICE_ENCRYPTION_KEY=replace-with-a-long-random-secret
```

- **Description**: OAuth application credentials and the exact redirect URI configured for the Trakt.tv integration
- **Get from**: [Trakt.tv OAuth Applications](https://trakt.tv/oauth/applications)
- **Required for**: Trakt features that consume the shared Trakt application credentials
- **Configuration**: Use the `TRAKT` group in Miauflix's configuration UI. Retain the List Service data directory and active key across restarts.
- **Encryption key**: `LIST_SERVICE_ENCRYPTION_KEY` is optional. If set, keep it stable and store it in deployment secrets; the service uses it directly and does not create a key file. Otherwise, it generates a key in its data directory. Losing or changing the active key makes encrypted associations, pending authorizations, and cached pages unreadable.

#### NordVPN (Optional)

```bash
# NordVPN integration - used by the gluetun VPN container
NORDVPN_PRIVATE_KEY=your-nordlynx-private-key
NORDVPN_COUNTRIES=Switzerland,Netherlands
```

- **NORDVPN_PRIVATE_KEY**: NordLynx (WireGuard) private key, passed to [gluetun](https://github.com/qdm12/gluetun) as `WIREGUARD_PRIVATE_KEY`
- **Get from**: create an access token at [my.nordaccount.com/dashboard](https://my.nordaccount.com/dashboard) → **NordVPN** in the left sidebar → **Get Access Token** → **Generate New Token**, then run `scripts/nordvpn-key.sh`, which saves the key to `.env` without printing it
- **Required for**: Starting the VPN container (`docker-compose.vpn.yml`)
- **NORDVPN_COUNTRIES**: Optional comma-separated list of server countries. Unset, gluetun picks any P2P server

#### FlareSolverr (Optional)

Configure `FLARESOLVERR_URL` in the Sources configuration group. Its source-service default is empty (disabled). Use the address reachable from that service: typically `http://flaresolverr:8191` in Docker, `http://127.0.0.1:8191` with the shared VPN network, or `http://localhost:8191` when running both locally.

The current source HTTP client uses this URL for definitions that require FlareSolverr and detected Cloudflare-style challenges. Configure the helper through this URL; the Compose overlay starts its container. See [FlareSolverr setup](flaresolverr.md).

### Authentication & Security

#### JWT Authentication (Auto-configured)

```bash
# JWT secrets (automatically generated if not provided)
JWT_SECRET=64-character-hex-string
STREAM_TOKEN_SECRET=64-character-hex-string
STREAM_KEY_SALT=64-character-hex-string
```

- **Description**: Cryptographic keys for JWT token signing and streaming authentication
- **Default**: Automatically generated 256-bit random keys
- **Note**: These are auto-configured by the system if not provided

Browsers receive session-scoped HttpOnly access and refresh cookies. The Samsung TV app uses token transport instead: access and refresh tokens are returned to the app and sent in headers. See [TV sign-in](samsung-tv.md#how-the-tv-app-signs-in).

#### Session Configuration

```bash
# Cookie and session settings
REFRESH_TOKEN_COOKIE_NAME=__miauflix_rt
COOKIE_DOMAIN=yourdomain.com
COOKIE_SECURE=true
REFRESH_TOKEN_EXPIRATION=7d
REFRESH_TOKEN_MAX_REFRESH_DAYS=30
MAX_DEVICE_SLOTS_PER_USER=5
```

- **COOKIE_DOMAIN**: Domain for session cookies (leave empty for same-origin)
- **COOKIE_SECURE**: Set to `true` for HTTPS deployments
- **REFRESH_TOKEN_EXPIRATION**: How long refresh tokens remain valid
- **MAX_DEVICE_SLOTS_PER_USER**: Maximum concurrent devices per user

### Server Configuration

#### Core Server Settings

```bash
# Server configuration
PORT=3000
CORS_ORIGIN=http://localhost:3000,https://yourdomain.com
DATA_DIR=./data
FRONTEND_DIR=/usr/src/app/public
ENABLE_FRONTEND=true
```

- **PORT**: Server listening port (default: 3000)
- **CORS_ORIGIN**: Comma-separated list of allowed origins (or `*` for all)
- **ALLOW_TV_APP**: Accept the [Samsung TV app](samsung-tv.md), which runs from local files (origin `file://`, which web pages cannot send) and signs in with bearer tokens instead of cookies (default: `true`). Its origin is allowed without credentials. Set `false` if you don't use the TV app
- **ALLOW_TV_APP_NULL_ORIGIN**: Also accept the TV app from the opaque origin `null`, for a TV that reports local files that way (default: `false`, needs `ALLOW_TV_APP`). Any web page can send `null` (from a sandboxed iframe or a `data:` URL), so with this on, a page you visit can read Miauflix's unauthenticated responses and, while first-run setup is open (`ALLOW_CREATE_ADMIN_ON_FIRST_RUN` with no admin yet), create the admin account. Turn it on only if the TV app can't connect otherwise
- **TV_PAIRING_ENABLED**: Announce this server to the pairing service every two minutes, so the [Samsung TV app](samsung-tv.md#how-the-tv-finds-your-server) on the same network (behind the same public IP) finds it (default: `true`). Off, the TV finds the server by scanning the local network or by typing its address
- **TV_PAIRING_URL**: The pairing service (default: `https://pair.miauflix.cat`). Point it at your own [`tv-pairing`](../../tv-pairing/README.md) instance, and package the TV app with the same one (`--pairing-url`)
- **TV_PAIRING_ADDRESSES**: The addresses a TV on your network reaches the server at, announced instead of the detected ones (comma-separated origins, e.g. `http://192.168.1.10:3000`). By default the server announces its private IPv4 addresses (outside Docker) and the private IPv4 addresses a browser on your network opened it at
- **DATA_DIR**: Directory for storing application data
- **FRONTEND_DIR**: Path to static frontend files (for production)
- **ENABLE_FRONTEND**: Whether to serve the frontend interface

#### Security & Performance

```bash
# Security and performance settings
REVERSE_PROXY_SECRET=your-secure-random-string
MAXIMUM_CACHE_EMPTY_SPACE=10MB
DISABLE_BACKGROUND_TASKS=false
DISABLE_VPN_CHECK=false
```

- **REVERSE_PROXY_SECRET**: Shared secret between reverse proxy and backend
- **MAXIMUM_CACHE_EMPTY_SPACE**: Maximum SQLite empty space before cleanup
- **DISABLE_BACKGROUND_TASKS**: Disable background processing for testing
- **DISABLE_VPN_CHECK**: Skip VPN detection. When `false` (the default), Miauflix refuses to search for sources unless NordVPN reports its traffic as protected. Setting it to `true` lets torrents go out from your real IP; don't do this on a server reachable from the internet
- **ALLOW_CREATE_ADMIN_ON_FIRST_RUN**: When `true`, skips automatic admin creation at startup and exposes an unauthenticated `POST /api/auth/setup` endpoint to create the first admin user. The endpoint accepts `{ email, password }` and is permanently disabled once any admin account exists. See [Initial User](#initial-user) for details.

### Content & Streaming

#### Source Configuration (Auto-configured)

```bash
# Content source settings (automatically configured)
SOURCE_SECURITY_KEY=base64-encoded-256-bit-key
CONTENT_CONNECTION_LIMIT=100
CONTENT_CONNECTION_BUDGET=200
DOWNLOAD_ALL_SOURCE_FILES=false
```

- **SOURCE_SECURITY_KEY**: AES-256 encryption key for source metadata, downloaded media and media-load's records (auto-generated)
- **CONTENT_CONNECTION_LIMIT** (media-load): Max peer-to-peer connections per torrent
- **CONTENT_CONNECTION_BUDGET** (media-load): Peer connections shared by all torrents (default 200). Each torrent's share follows its priority, so a stream gets most of it. Once the budget is used up, a torrent at its share takes no new peers, and no torrent loses the peers it has
- **DOWNLOAD_ALL_SOURCE_FILES**: Reserved setting; currently has no effect

#### Playback compatibility and subtitles

- **CONVERT_H265_TO_H264**: Download setting, disabled by default. Allows server-side H.265-to-H.264 conversion when required, limited to 1080p/30 fps. Compatible clients retain the original video.
- **OPENSUBTITLES_API_KEY**: Optional server-side key for movie subtitle searches. Embedded text subtitles and matching torrent subtitle files do not need this integration.
- **CONTENT_DOWNLOAD_LIMIT / CONTENT_UPLOAD_LIMIT** (media-load): Download settings for peer-transfer bandwidth, expressed as sizes such as `20MB`.
- **CONTENT_SEED_DURATION_SECONDS** (media-load): Time to keep seeding after the main video finishes downloading; `0` stops seeding immediately. Retained encrypted files can still be reused until cleanup.

See [Audio and subtitles](../features/audio-subtitles.md) and [Storage](../features/storage-privacy.md) for behavior and limitations.

#### Streaming Tokens

```bash
# Streaming configuration
STREAM_TOKEN_EXPIRATION=6h
```

- **STREAM_TOKEN_EXPIRATION**: How long streaming tokens remain valid

### External API URLs (Optional)

```bash
# API endpoints (use defaults unless customizing)
TMDB_API_URL=https://api.themoviedb.org/3
TRAKT_API_URL=https://api.trakt.tv
```

- **Description**: Base URLs for external APIs
- **Default**: Standard API endpoints
- **When to change**: Custom proxy or testing environments only

### Frontend Configuration

#### Frontend Environment (.env.development, .env.production)

```bash
# Frontend-specific variables (in frontend/ directory)
VITE_API_URL=/
VITE_TIZEN=false
NODE_ENV=development

# Optional: backend URL for Vite dev server proxy (project root .env)
BACKEND_URL=http://localhost:5000
```

- **VITE_API_URL**: Backend API URL relative to frontend
- **VITE_TIZEN**: Enable Samsung Tizen TV specific features
- **NODE_ENV**: Environment mode (development/production)
- **BACKEND_URL**: (Optional) Target for the Vite dev server `/api` proxy. Default is `http://localhost:5000`. Set this when using the frontend with the Docker backend (miauflix container) or a backend on another host/port. See [Development Workflow](../development/workflow.md#using-the-frontend-with-the-docker-backend-miauflix-container).

### Production Deployment

#### Docker and HTTPS

The supplied production HTTPS setup uses Caddy, rather than manually configured nginx certificate paths:

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml
MIAUFLIX_DOMAIN=miauflix.example.com
REVERSE_PROXY_SECRET=your-secure-random-string
MIAUFLIX_VERSION=latest
```

With the VPN overlay, include `docker-compose.vpn.yml` and set `MIAUFLIX_UPSTREAM=vpn:3000`. See [HTTPS with a domain](docker-setup.md#https-with-a-domain) for the complete setup and first-account behavior.

## Configuration by Category

### Essential Setup (Required)

1. **TMDB API access token** - Required for movie/TV metadata; configure it in the app

### Enhanced Features (Optional)

1. **Trakt client ID + client secret + redirect URI** - Configure once in `TRAKT` for all consumers
2. **NORDVPN_PRIVATE_KEY** - VPN integration and enforcement
3. **FLARESOLVERR_URL** - Optional challenge handling for supported source providers

### Advanced Configuration (Auto-configured)

- JWT, backend, and List Service data-encryption keys are generated automatically and persisted in their data directories
- Server settings use sensible defaults
- Content source settings are optimized automatically

## Troubleshooting

### Common Issues

**Configuration wizard won't start**

- Ensure you're running from the project root directory
- Check that all dependencies are installed (`npm install`)

**TMDB API errors**

- Verify your access token at [TMDB API Settings](https://www.themoviedb.org/settings/api)
- Ensure the token has read permissions

**Trakt.tv connection fails**

- Double-check client ID and secret from your [Trakt.tv application](https://trakt.tv/oauth/applications)
- Configure a valid Trakt client ID, client secret, and redirect URI in `TRAKT`

**VPN docker container not starting**

- Check the logs with `docker compose logs vpn`
- Make sure `NORDVPN_PRIVATE_KEY` is set: re-run `scripts/nordvpn-key.sh` if in doubt
- Check that your NordVPN subscription is active
- The host must provide `/dev/net/tun` (most VPS do; on some container-based VPS it must be enabled in the provider's panel)

### Getting Help

- Run the configuration wizard: `npm run config`
- Check the [Configuration Guide](../../backend/docs/configuration.md)
- Review [Getting Started](getting-started.md) for setup instructions

## Initial User

There are two modes for creating the first admin account.

### Default mode (auto-creation)

By default (`ALLOW_CREATE_ADMIN_ON_FIRST_RUN` unset or `false`), Miauflix generates an admin account on first startup if no admin exists:

- Email: `admin@<hostname>.local`
- Password: randomly generated, printed to the startup logs

Keep these logs private. The profile/password editor is still planned, so do not rely on an existing password-change screen. The supplied base Compose file instead sets this option to `true` for browser setup; the HTTPS overlay sets it to `false`.

### Setup endpoint mode

Set `ALLOW_CREATE_ADMIN_ON_FIRST_RUN=true` to skip auto-creation and instead expose a one-time setup endpoint:

```bash
POST /api/auth/setup
Content-Type: application/json

{ "email": "admin@example.com", "password": "yourpassword" }
```

Responses:

| Status          | Meaning                                           |
| --------------- | ------------------------------------------------- |
| `201 Created`   | Admin created successfully                        |
| `404 Not Found` | Setup disabled or an administrator already exists |

The endpoint closes once an administrator exists. The browser uses the same endpoint for initial setup and signs the new administrator in. Keep the server reachable only by you until this step is complete.

## Related Documentation

- [Getting Started Guide](getting-started.md) - Initial setup instructions
- [Configuration Guide](../../backend/docs/configuration.md) - Interactive wizard details
- [Docker Setup](docker-setup.md) - Container deployment configuration
