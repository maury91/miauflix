## ▶️ Run & Debug

### Essential NPM Scripts

```bash
npm run dev:backend          # nodemon reload
npm run start:backend        # one-shot server
npm run start:backend:e2e &  # dockerised watch server (mock data) in *detached* mode
npm run test:backend         # Jest unit tests
npm run test:backend:e2e     # full e2e matrix
npm run test:backend:e2e:dev <file>  # run one e2e spec
npm run config               # interactive configuration setup
npm run config-only          # configuration only (no server start)
```

### Configuration System

The application features an **interactive configuration system** ([`backend/src/configuration.ts`](../backend/src/configuration.ts)) that handles:

- **Auto-setup workflow** - Automatically detects missing configuration and guides setup
- **Interactive prompts** - User-friendly configuration collection
- **Environment validation** - Ensures all required settings are properly configured
- **Secret generation** - Auto-generates secure keys when missing

#### First-time Setup

```bash
npm run config-only    # Run configuration setup without starting server
npm run config        # Configure and start server
```

The configuration system will guide you through setting up:

- TMDB API access token
- JWT secrets for authentication
- Optional Trakt integration
- Optional NordVPN configuration
- Reverse proxy settings

### Requirements

- **Node 20+**
- `.env` file (auto-created during configuration):

  ```env
  TMDB_API_ACCESS_TOKEN=
  JWT_SECRET=
  REFRESH_TOKEN_SECRET=
  SOURCE_SECURITY_KEY=          # Auto-generated if missing
  # Optional integrations
  TRAKT_CLIENT_ID=
  TRAKT_CLIENT_SECRET=
  NORDVPN_PRIVATE_KEY=
  REVERSE_PROXY_SECRET=
  # Database configuration
  DATA_DIR=data/        # SQLite database directory
  ```

- SQLite DB auto‑creates at `data/database.sqlite` (controlled by `DATA_DIR` environment variable)

### Testing Infrastructure

Comprehensive testing setup with multiple test types:

- **Unit Tests** - Component-level testing with Jest
- **Integration Tests** - Service integration testing
- **E2E Tests** - Full application workflow testing
- **Test Fixtures** - Extensive mock data for consistent testing

For detailed testing information, see **[Testing Infrastructure](testing-infrastructure.md)**.

### Development Workflow

1. **Initial Setup**: Run `npm run config-only` for first-time configuration
2. **Development**: Use `npm run dev:backend` for hot-reload development
3. **Testing**: Run `npm run test:backend` for unit tests
4. **E2E Testing**: Use `npm run test:backend:e2e` for full integration testing
5. **Production**: Build with `npm run build` and run with `npm run start:prod`

### Debugging Tips

- Use VS Code debugger with Node.js configuration
- Check application logs for detailed error information
- Verify environment variables are properly loaded
- Ensure SQLite database permissions and directory structure
- Test external API connectivity (TMDB, Trakt) separately
