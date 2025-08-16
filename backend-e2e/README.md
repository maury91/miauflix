# Backend E2E Tests

This directory contains end-to-end integration tests for the Miauflix backend. The tests run against a fully containerized environment with mock services to simulate external APIs.

## Overview

The E2E test suite provides:

- **Integration Testing**: Tests the complete backend functionality including all external API integrations
- **Mock Services**: Simulates TMDB, YTS, and Trakt APIs with realistic test data
- **Isolated Environment**: Runs in Docker containers to ensure consistency and isolation
- **Realistic Data**: Uses cached API responses to provide realistic test scenarios
- **Security Testing**: Validates authentication, authorization, and audit logging functionality

## Architecture

The test environment consists of:

- **Backend Service**: The main Miauflix backend application
- **TMDB Mock**: Mock service for The Movie Database API
- **YTS Mock**: Mock service for YTS torrent API
- **Trakt Mock**: Mock service for Trakt API
- **Test Runner**: Jest-based tests that interact with the backend

## Test Flow

The `scripts/env.sh` script orchestrates the entire process for both development and testing:

1. **Port Discovery**: Finds an available port on the system to avoid conflicts
2. **Environment Setup**: Loads environment variables from the root `.env` file (used by mocks to generate missing data)
3. **Cleanup**: Removes any existing test containers from previous runs
4. **Service Startup**: Starts all services using Docker Compose:
   - Mock services start first and wait for health checks
   - Backend waits for all mocks to be healthy before starting
5. **Health Verification**: Waits for the backend to pass health checks
6. **Credential Extraction**: Automatically extracts admin credentials from backend logs and saves them to `admin-credentials.json`
7. **Test Execution**: Runs the Jest test suite against the live backend using the extracted credentials
8. **Cleanup**: Automatically cleans up all containers when tests complete

## Running Tests

### Prerequisites

- Docker and Docker Compose installed
- Node.js and npm installed
- Environment variables configured in root `.env` file

### Quick Start - Full Test Suite

```bash
# From the backend-e2e directory
./scripts/env.sh test                    # Run all tests (backend + frontend)
./scripts/env.sh test --backend-only     # Run only backend tests
./scripts/env.sh test --frontend-only    # Run only frontend tests
```

This will:

1. Start all services (backend + mocks)
2. Wait for services to be healthy
3. Run tests (all, backend-only, or frontend-only based on flags)
4. Clean up automatically

### Development Workflow

For active development with hot reloading and automatic credential extraction:

```bash
# Start development environment with hot reloading (interactive mode)
npm run dev

# OR start in detached mode (environment runs in background)
./scripts/env.sh dev -d

# OR use the package.json script for detached mode (alternative)
npm run dev:detached

# In another terminal, run tests against the running services
npm run test:only

# Stop development environment
./scripts/stop.sh

# OR use the package.json script to stop (alternative)
npm run dev:stop
```

Both `npm run dev` and the standalone `./scripts/env.sh test` automatically extract admin credentials and save them to `admin-credentials.json` for seamless authentication testing.

### Test-Only Mode

If you have services already running:

```bash
# Run tests against already running services
npm run test:only
```

**Note**: This will fail if no services are running. You must start services first with one of the above methods.

### Other Useful Commands

```bash
# Run tests in watch mode (requires services to be running)
npm run test:watch

# Run tests against running services
npm test

# Run specific test scopes
./scripts/env.sh test --backend-only     # Backend tests only
./scripts/env.sh test --frontend-only    # Frontend tests only

# Clean up all containers and volumes
npm run clean

# View logs from specific services
docker compose -f docker/docker-compose.dev.yml logs backend
docker compose -f docker/docker-compose.dev.yml logs tmdb-mock
```

## Test Structure

Tests are organized into:

- **Health Tests**: Basic connectivity and service status
- **Authentication Tests**: User authentication and authorization flows
- **Media API Tests**: Movie and TV show search, metadata retrieval
- **Integration Tests**: Full user workflows and complex scenarios

### Test Results

All core functionality tests are currently **passing**:

```
Test Suites: 4 passed, 4 total
Tests:       Multiple test scenarios covered
```

**Note**: Authentication tests now run reliably with automatic credential extraction. All authentication functionality is fully tested and working.

### Authentication Testing

The authentication tests automatically extract user credentials from the backend logs using a modular credential extraction system. The test suite:

1. **Automatic Credential Extraction**: Uses the `extract-credentials.sh` script to monitor backend logs
2. **Credential Storage**: Saves extracted credentials to `admin-credentials.json` for test consumption
3. **Seamless Test Execution**: Tests read credentials from the JSON file and proceed automatically
4. **Rate Limiting Optimization**: Uses `RATE_LIMIT_TEST_MODE=true` environment variable to bypass rate limiting during tests for optimal performance

**Core Authentication Features Tested**:

- ✅ **Protected Endpoints**: Return 401 when accessed without authentication
- ✅ **Valid Login**: Successfully authenticates with extracted admin credentials
- ✅ **Invalid Login**: Returns 401 for incorrect credentials
- ✅ **JWT Token Validation**: Proper token-based authentication flow
- ✅ **Refresh Token Flow**: Token refresh mechanism works correctly
- ✅ **Rate Limiting**: Security rate limiting functionality validated
- ✅ **Error Handling**: Proper JSON error responses with appropriate HTTP status codes
- ✅ **Audit Logging**: Security events are logged for compliance tracking

The credential extraction system works for both development (`npm run dev`) and test (`./scripts/env.sh test`) environments, ensuring consistent and reliable authentication testing.

**Important**: Authentication tests now work reliably with automatic credential extraction:

- **Automatic Extraction**: Credentials are extracted automatically by the unified `env.sh` script
- **No Manual Setup**: No need to manually check logs or configure credentials
- **Fresh Database**: Always uses a fresh database (volumes are cleaned between runs)
- **Modular Design**: The `extract-credentials.sh` script is reusable across different environments
- **Error Handling**: Graceful fallback with warnings if credential extraction fails

## Credential Extraction System

The E2E test suite includes an automated credential extraction system that simplifies authentication testing:

### How It Works

1. **Backend Startup**: When the backend starts with a fresh database, it creates an initial admin user
2. **Log Monitoring**: The `extract-credentials.sh` script monitors Docker logs for the admin user creation message
3. **Credential Parsing**: Extracts email and password using regex pattern matching
4. **JSON Storage**: Saves credentials to `admin-credentials.json` for tests to consume
5. **Test Integration**: Tests automatically read credentials from the JSON file

### Script Usage

The credential extraction script is modular and can be used in different contexts:

```bash
# Used by env.sh dev - monitors miauflix-dev project
./scripts/extract-credentials.sh 60 "miauflix-dev" "docker/docker-compose.dev.yml"

# Used by env.sh test - monitors miauflix-tests project
./scripts/extract-credentials.sh 60 "miauflix-tests" "docker/docker-compose.test.yml"

# Direct usage with custom parameters
./scripts/extract-credentials.sh [timeout] [project-name] [compose-file]
```

### Credential File Format

The extracted credentials are saved in a simple JSON format:

```json
{
  "adminEmail": "admin@example.local",
  "adminPassword": "generated-secure-password"
}
```

This file is automatically created in the `backend-e2e` directory and consumed by the test utilities.

## Mock Services

### TMDB Mock

- Provides realistic movie and TV show metadata
- Uses cached responses from real TMDB API calls
- Supports search, details, and recommendation endpoints

### YTS Mock

- Simulates torrent search functionality
- Returns torrent metadata for testing purposes
- Uses realistic torrent data structure

### Trakt Mock

- Handles user authentication flows
- Provides watchlist and rating functionality
- Simulates OAuth device flow

## Environment Variables

The test environment requires the same environment variables as production:

- `TMDB_API_ACCESS_TOKEN`: Used by TMDB mock for data generation
- `TRAKT_CLIENT_ID`: Used by Trakt mock for authentication simulation
- `TRAKT_CLIENT_SECRET`: Used by Trakt mock for token validation
- `JWT_SECRET`: Used by backend for authentication
- `REFRESH_TOKEN_SECRET`: Used by backend for token refresh

## Log Management

The E2E testing system automatically manages log files to prevent disk space issues:

- **Automatic Cleanup**: Keeps only the 10 most recent log files
- **Cleanup Triggers**: Runs during test cleanup and when stopping environments
- **Log Location**: `backend-e2e/logs/` directory
- **Log Format**: `YYYY-MM-DD_HH-MM-SS.log`

### Manual Log Management

```bash
# Manual log cleanup (keeps 10 most recent)
./scripts/cleanup-logs.sh

# View log directory
ls -la logs/

# View specific log file
tail -f logs/2025-07-02_13-06-46.log

# View latest log
tail -f logs/$(ls -t logs/*.log | head -1)
```

## Debugging

### Common Issues

**Port Conflicts**: The script automatically finds available ports, but if you see port-related errors, ensure no other services are using the discovered ports.

**Container Startup**: If services fail to start, check Docker logs:

```bash
docker compose -f docker/docker-compose.test.yml logs [service-name]
```

**Mock Data**: If tests fail due to missing data, ensure the root `.env` file contains valid API tokens for data generation.

**Credential Extraction**: If authentication tests fail due to missing credentials:

```bash
# Check if credentials file was created
ls -la admin-credentials.json

# Manually run credential extraction
./scripts/extract-credentials.sh 60

# Check backend logs for admin user creation
docker compose -f docker/docker-compose.test.yml logs backend | grep "Created initial admin user"
```

### Logs

Each service provides detailed logs:

- Backend logs include API requests, authentication events, and errors
- Mock service logs show which endpoints are being called
- Test logs show individual test results and any assertion failures

### Debugging CI Failures

If E2E tests fail in GitHub Actions:

1. **Check the workflow run logs** in the GitHub Actions tab
2. **Download artifacts** - Failed runs upload `e2e-test-logs` artifacts containing:
   - `admin-credentials.json` - Shows if credential extraction worked
   - `docker-logs.txt` - Container logs for debugging
3. **Local reproduction**:

   ```bash
   # Validate CI setup locally
   ./scripts/validate-e2e-ci.sh

   # Run E2E tests with same environment as CI
   npm run test:backend:e2e
   ```

4. **Common CI issues**:
   - **Port conflicts**: CI runner may have different port availability
   - **Docker resource limits**: Large Docker images may hit CI limits
   - **Timeout issues**: Network-dependent steps may be slower in CI

## Adding New Tests

1. Create test files in the appropriate subdirectory
2. Use the provided test utilities for common operations
3. Follow the existing patterns for authentication and API calls
4. Ensure tests are independent and can run in any order
5. Add cleanup logic if tests create persistent data

## CI/CD Integration

The test suite is designed to run in CI environments and is integrated with GitHub Actions:

### GitHub Actions

The E2E tests run automatically on every push and pull request via the `e2e-tests` job in `.github/workflows/ci.yml`:

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  needs: lint-and-type-check
  steps:
    # ... setup steps ...
    - name: Run E2E tests
      run: npm run test:backend:e2e
```

**Features:**

- Runs in parallel with unit tests for faster CI feedback
- Automatic environment setup with mock API credentials
- Timeout protection (10 minutes max)
- Artifact collection on test failures for debugging
- Full Docker-based isolation

### CI Environment Benefits

- Uses Docker for consistent environments
- Automatically handles port allocation and credential extraction
- Provides detailed exit codes and logs
- Cleans up resources automatically
- No manual credential setup required - fully automated
- Mock API tokens prevent external API dependencies
