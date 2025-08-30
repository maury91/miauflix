# Environment Variables Reference

Miauflix uses environment variables to configure various services and features.

**The recommended approach is to use the interactive configuration wizard**, which automatically detects missing variables and guides you through setup.

## Quick Setup (Recommended)

```bash
# Interactive configuration wizard
npm run config

# Or configuration only (without starting server)
npm run config-only
```

The configuration wizard will:

- ✅ Detect missing required variables
- 🧪 Test API credentials in real-time
- 💾 Save settings to `.env` file automatically
- 🔗 Provide links to obtain API keys

See [Configuration Guide](../../backend/docs/configuration.md) for detailed wizard documentation.

## Manual Configuration

If you need to configure manually or understand all available variables, create a `.env` file in the project root with the following:

### Required Variables

#### TMDB Integration (Required)

```bash
# The Movie Database API - Required for movie/TV metadata
TMDB_API_ACCESS_TOKEN=eyJhbGciOiJIUzI1NiJ9...
```

- **Description**: Access token for TMDB API v3
- **Get from**: [TMDB API Settings](https://www.themoviedb.org/settings/api)
- **Format**: JWT token starting with `eyJ`

### External API Integration

#### Trakt.tv (Optional)

```bash
# Trakt.tv API - Optional for list synchronization and tracking
TRAKT_CLIENT_ID=your-client-id
TRAKT_CLIENT_SECRET=your-client-secret
```

- **Description**: OAuth application credentials for Trakt.tv integration
- **Get from**: [Trakt.tv OAuth Applications](https://trakt.tv/oauth/applications)
- **Required for**: User list synchronization, watch progress tracking

#### NordVPN (Optional)

```bash
# NordVPN integration - Optional for starting up the VPN docker container
NORDVPN_PRIVATE_KEY=your-wireguard-private-key
```

- **Description**: WireGuard private key for NordVPN integration
- **Get from**: [NordVPN WireGuard Setup](https://github.com/bubuntux/nordlynx#how-to-get-your-private_key)
- **Required for**: Starting up the VPN docker container

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
- **DISABLE_VPN_CHECK**: Skip VPN detection checks

### Content & Streaming

#### Source Configuration (Auto-configured)

```bash
# Content source settings (automatically configured)
SOURCE_SECURITY_KEY=base64-encoded-256-bit-key
CONTENT_CONNECTION_LIMIT=100
DOWNLOAD_ALL_SOURCE_FILES=false
```

- **SOURCE_SECURITY_KEY**: AES-256 encryption key for source metadata (auto-generated)
- **CONTENT_CONNECTION_LIMIT**: Max peer-to-peer connections
- **DOWNLOAD_ALL_SOURCE_FILES**: Download metadata for all sources vs top 2

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
```

- **VITE_API_URL**: Backend API URL relative to frontend
- **VITE_TIZEN**: Enable Samsung Tizen TV specific features
- **NODE_ENV**: Environment mode (development/production)

### Production Deployment

#### SSL & Docker (Production)

```bash
# SSL certificates (production)
SSL_CERTIFICATE=/etc/nginx/ssl/fullchain.pem
SSL_CERTIFICATE_KEY=/etc/nginx/ssl/privkey.pem
SSL_DHPARAM=/etc/nginx/ssl/dhparam.pem

# Docker deployment
GITHUB_REPOSITORY=yourusername/miauflix
MIAUFLIX_VERSION=latest
DOMAIN=yourdomain.com
WWW_DOMAIN=www.yourdomain.com
```

## Configuration by Category

### Essential Setup (Required)

1. **TMDB_API_ACCESS_TOKEN** - Required for all movie/TV data

### Enhanced Features (Optional)

1. **TRAKT_CLIENT_ID + TRAKT_CLIENT_SECRET** - User lists and tracking
2. **NORDVPN_PRIVATE_KEY** - VPN integration and enforcement

### Advanced Configuration (Auto-configured)

- All JWT secrets and encryption keys are automatically generated
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
- Ensure redirect URI matches your domain

**VPN docker container not starting**

- Verify NordVPN private key format (starts with base64-encoded data)
- Check that the key is associated with an active NordVPN subscription

### Getting Help

- Run the configuration wizard: `npm run config`
- Check the [Configuration Guide](../../backend/docs/configuration.md)
- Review [Getting Started](getting-started.md) for setup instructions

## Related Documentation

- [Getting Started Guide](getting-started.md) - Initial setup instructions
- [Configuration Guide](../../backend/docs/configuration.md) - Interactive wizard details
- [Docker Setup](docker-setup.md) - Container deployment configuration
