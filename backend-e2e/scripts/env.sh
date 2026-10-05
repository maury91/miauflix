#!/bin/bash

# Unified environment script for both development and testing
# Usage:
#   ./scripts/env.sh dev                                    # Start development environment  
#   ./scripts/env.sh dev -d                                 # Start development environment in detached mode
#   ./scripts/env.sh test                                   # Run all tests
#   ./scripts/env.sh test movie.test.ts                     # Run specific test file
#   ./scripts/env.sh test --testNamePattern="Movie"         # Run tests matching pattern

set -e

MODE="$1"

# Preserve explicit provider-recording requests when the repository .env is loaded below.
record_provider_fixtures_was_set=false
record_provider_fixtures_requested=''
if [[ -n "${RECORD_PROVIDER_FIXTURES+x}" ]]; then
    record_provider_fixtures_was_set=true
    record_provider_fixtures_requested="$RECORD_PROVIDER_FIXTURES"
fi
home_cross_load_was_set=false
home_cross_load_requested=''
if [[ -n "${E2E_HOME_CROSS_LOAD+x}" ]]; then
    home_cross_load_was_set=true
    home_cross_load_requested="$E2E_HOME_CROSS_LOAD"
fi

script_dir=$(dirname $(realpath "$0"))
backend_e2e_dir=$(dirname "$script_dir")
root_dir=$(dirname "$backend_e2e_dir")
log_file="$backend_e2e_dir/logs/$(date +'%Y-%m-%d_%H-%M-%S').log"

mkdir -p "$(dirname "$log_file")"

shift # Remove first argument

# Parse test scope flags
FRONTEND_ONLY=false
BACKEND_ONLY=false
INITIAL_SETUP=false
DETACHED_FLAG=false
DETACHED_MODE=false
UPDATE_SNAPSHOTS=false
VERBOSE=0
filtered_args=()
for arg in "$@"; do
  case "$arg" in
    --frontend-only) FRONTEND_ONLY=true ;;
    --backend-only)  BACKEND_ONLY=true ;;
    --initial-setup) INITIAL_SETUP=true; FRONTEND_ONLY=true ;;
    --update) UPDATE_SNAPSHOTS=true ;;
    -d) DETACHED_FLAG=true ;;
    -v) VERBOSE=1 ;;
    *) filtered_args+=("$arg") ;;
  esac
done
set -- "${filtered_args[@]}"

if  [[ "$MODE" == "dev" && "$DETACHED_FLAG" == "true" ]];  then
    DETACHED_MODE=true
fi

# Validate that only one scope flag is used
if [[ "$FRONTEND_ONLY" == "true" && "$BACKEND_ONLY" == "true" ]]; then
    echo "❌ Error: Cannot use both --frontend-only and --backend-only flags"
    exit 1
fi

if [[ "$INITIAL_SETUP" == "true" && "$MODE" != "test" ]]; then
    echo "❌ Error: --initial-setup is only available in test mode"
    exit 1
fi

# Rest are test arguments
if [[ "$MODE" != "dev" && "$MODE" != "test" ]]; then
    echo "❌ Usage: $0 <dev|test> [options...] [test-args...]"
    echo ""
    echo "Examples:"
    echo "  $0 dev                                    # Start development environment"
    echo "  $0 dev -d                                 # Start development environment in detached mode"
    echo "  $0 test                                   # Run all tests"
    echo "  $0 test --backend-only                    # Run only backend tests"
    echo "  $0 test --frontend-only                   # Run only frontend tests"
    echo "  $0 test --update                          # Run tests and update frontend snapshots"
    echo "  $0 test movie.test.ts                     # Run specific test"
    echo "  $0 test --testNamePattern=\"Movie\"       # Run matching tests"
    echo ""
    echo "To stop detached development environment:"
    echo "  ./scripts/stop.sh"
    exit 1
fi

# Set configuration based on mode
if [[ "$MODE" == "dev" ]]; then
    DOCKER_COMPOSE_FILE="docker/docker-compose.dev.yml"
    PROJECT_NAME="miauflix-dev"
    DESCRIPTION="Development Environment with Hot Reloading"
else
    DOCKER_COMPOSE_FILE="docker/docker-compose.test.yml"
    PROJECT_NAME="miauflix-tests"
    DESCRIPTION="Docker-based Integration Test Environment"
fi

cd "$root_dir"

echo "🚀 Starting $DESCRIPTION..."

# Import shared Docker utilities
source "$script_dir/docker-utils.sh"

# Keep phase markers in the environment log so CI timing includes setup,
# readiness, test lanes, and teardown rather than only Playwright's totals.
phase() {
    local name="$1"
    printf '[E2E_PHASE] %s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$name" | tee -a "$log_file"
}

compose() {
    docker compose -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" "$@"
}

# Function to check if environment is already running (wraps shared function with mode-specific messaging)
check_environment_running() {
    log_verbose "🔍 Checking if $MODE environment is already running..."
    
    # Use shared function to get running backend port, passing our specific project/compose file
    local detected_port
    detected_port=$(get_running_backend_port "$PROJECT_NAME" "$DOCKER_COMPOSE_FILE" "$backend_e2e_dir")
    local exit_code=$?
    
    if [[ $exit_code -eq 0 && -n "$detected_port" ]]; then
        export PORT="$detected_port"
        return 0
    else
        return 1
    fi
}

SKIP_DOCKER_STARTUP=false

# For dev mode, check if containers are already running
if [[ "$MODE" == "dev" ]]; then
    if check_environment_running; then
        echo "✅ Development environment is already running and healthy!"
        echo "  🔌 Backend port: $PORT"
        SKIP_DOCKER_STARTUP=true
    else
        echo "🚀 Starting fresh development environment..."
        # Find available ports only when starting fresh
        echo "🔍 Finding available ports..."
        eval $($script_dir/find-port.sh)
        echo "  🔌 Backend port: $PORT"
    fi
else
    # For test mode, always find available ports
    echo "🔍 Finding available ports..."
    eval $($script_dir/find-port.sh)
    echo "  🔌 Backend port: $PORT"
fi

# Export the ports for docker-compose
export PORT

# Export user ID and group ID for Docker Compose to avoid permission issues
export USER_ID=$(id -u)
export GROUP_ID=$(id -g)

# Load environment variables if .env exists
cd "$root_dir"
if [[ -f ".env" ]]; then
    # Load dotenv assignments without tokenizing comments or quoted values.
    set -a
    source .env
    set +a
    echo "🔧 Loaded environment variables from .env file"
else
    echo "⚠️  No .env file found, using default environment variables"
    export TMDB_API_ACCESS_TOKEN="mock-tmdb-token-for-testing"
    export TRAKT_CLIENT_ID="mock-trakt-client-id"
    export TRAKT_CLIENT_SECRET="mock-trakt-client-secret"
fi

if [[ "$record_provider_fixtures_was_set" == "true" ]]; then
    export RECORD_PROVIDER_FIXTURES="$record_provider_fixtures_requested"
fi
if [[ "$home_cross_load_was_set" == "true" ]]; then
    export E2E_HOME_CROSS_LOAD="$home_cross_load_requested"
fi

# The background-priority E2E lane must be deterministic even when a developer's
# local .env contains the normal disabled-worker setting.
if [[ "${BACKGROUND_TASKS_ENABLED:-false}" == "true" ]]; then
    export DISABLE_BACKGROUND_TASKS=false
    export CATALOG_DISABLE_BACKGROUND_TASKS=false
fi

if [[ "$INITIAL_SETUP" == "true" ]]; then
    export ALLOW_CREATE_ADMIN_ON_FIRST_RUN=true
    # Keep the provider mock usable while forcing the app's Catalog service
    # configuration to be completed through the first-run UI.
    export E2E_CATALOG_TMDB_TOKEN=''
    export TMDB_API_ACCESS_TOKEN='e2e-dummy-token'
    export E2E_TRAKT_CLIENT_ID=''
    export E2E_TRAKT_CLIENT_SECRET=''
    export E2E_TRAKT_REDIRECT_URI=''
fi

# Export VERBOSE for subscripts
export VERBOSE

# Backup .env.test before test run so container writes don't persist
ENV_TEST_FILE="$backend_e2e_dir/.env.test"
ENV_TEST_BACKUP="$backend_e2e_dir/.env.test.bak"
if [[ "$MODE" == "test" && -f "$ENV_TEST_FILE" ]]; then
    cp "$ENV_TEST_FILE" "$ENV_TEST_BACKUP"
fi

# Function to cleanup artifacts
cleanupArtifacts() {
    echo "🧹 Cleaning up previous build artifacts..."
    cd ${backend_e2e_dir}
    rm -rf docker/dist
    
    $script_dir/cleanup-logs.sh
}

# Function to cleanup on exit
cleanup() {
    TERM_SIGNAL=$?
    phase "teardown-start"
    if [[ $TERM_SIGNAL -ne 0 ]]; then
        echo "⚠️  Script terminated with signal $TERM_SIGNAL"
        # docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE logs --tail '5000'
        if [[ -f $log_file ]]; then
            tail -n 100 "$log_file"
        fi
    fi
    if [[ -n $logged_pid ]]; then
        kill $logged_pid || true
    fi
    if [[ -f $log_file ]]; then
        echo "📜 Full Logs saved to $log_file"
    else
        compose logs --tail 2000
        echo "⚠️  No logs were generated"
    fi
    
    # Only cleanup Docker containers if not in detached mode
    if [[ "$DETACHED_MODE" == "false" ]]; then
        echo "🧹 Cleaning up $MODE environment..."
        cleanupArtifacts
        compose down -v --remove-orphans
    else
        echo "🚀 Detached mode - leaving containers running"
        cleanupArtifacts
    fi
    
    # Restore .env.test from backup if one was made
    if [[ -f "$ENV_TEST_BACKUP" ]]; then
        cp "$ENV_TEST_BACKUP" "$ENV_TEST_FILE"
        rm -f "$ENV_TEST_BACKUP"
    fi

    phase "teardown-end"
    exit $TERM_SIGNAL
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Only start Docker if not already running or if in test mode
if [[ "$SKIP_DOCKER_STARTUP" == "false" ]]; then
    # Build libraries only when starting fresh - ensure we're in root directory
    cd "$root_dir"
    # Build backend package and dependencies for use outside Docker; frontend is built inside Docker
    if [[ "${E2E_HOST_BUILD_PREPARED:-false}" == "true" ]]; then
        phase "host-prerequisites-reused"
    else
        phase "host-prerequisites-start"
        npm run build:backend
        phase "host-prerequisites-end"
    fi

    # Build frontend only in dev so static assets are available/mounted
    if [[ "$MODE" == "dev" ]]; then
        echo "🧱 Building frontend for development (API_URL=http://localhost:$PORT) ..."
        VITE_API_URL="http://localhost:$PORT" npm run build:frontend
    fi

    # Clean up previous build artifacts
    cleanupArtifacts
    cd ${root_dir}
    bash "$script_dir/prepare-docker-build-context.sh"

    # Navigate to the integration tests directory
    cd "${backend_e2e_dir}"
    rm -rf logs/traces/* 2>/dev/null || true

    # Make sure all previous containers are removed
    echo "🧹 Removing any existing $MODE containers..."
    compose down -v --remove-orphans

    # Start all services
    phase "service-startup-start"
    echo "🚀 Starting the $MODE environment with Docker Compose..."
    export DOCKER_BUILDKIT=1
    compose_args=(up -d)
    if [[ "${E2E_USE_PREBUILT_IMAGES:-false}" == "true" ]]; then
        compose_args+=(--no-build)
    else
        compose_args+=(--build)
    fi
    if [[ "$MODE" == "test" ]]; then
        compose_args+=(--wait --wait-timeout 120)
    fi
    # Start following before startup so failures during `up --wait` are retained.
    # Some Compose versions exit when no container exists yet; the fallback below
    # starts a follower after startup without a time window in that case.
    compose logs --follow >> "$log_file" 2>&1 &
    logged_pid=$!
    compose "${compose_args[@]}"
    if ! kill -0 "$logged_pid" 2>/dev/null; then
        compose logs --follow >> "$log_file" 2>&1 &
        logged_pid=$!
    fi

    # Wait for services to start
    echo "⏳ Waiting for services to start..."
    if [[ "$MODE" == "dev" ]]; then
        sleep 2
    fi
    phase "service-startup-end"

    if [[ "$INITIAL_SETUP" == "true" ]]; then
        echo "🧪 Initial-user setup mode - skipping generated-admin credential extraction"
    else
        # Extract admin credentials using separate script
        echo "🔍 Extracting admin credentials..."
        if ! ./scripts/extract-credentials.sh 60 "$PROJECT_NAME" "$DOCKER_COMPOSE_FILE"; then
            echo "⚠️  Continuing without credentials - some tests may be skipped"
        fi
    fi
else
    echo "🔄 Using existing containers - skipping Docker startup"
    # Still need to set up logging for existing containers, but from the right directory
    cd "$backend_e2e_dir"
    compose logs --follow >> "$log_file" 2>&1 &
    logged_pid=$!
fi

if [[ "$MODE" == "dev" ]]; then
    # Development mode
    echo "🎯 Development environment is running!"
    echo "   To view logs: docker compose -p $PROJECT_NAME -f $DOCKER_COMPOSE_FILE logs -f"
    echo "   To stop: ./scripts/stop.sh"
    echo ""
    
    if [[ "$DETACHED_MODE" == "true" ]]; then
        echo "🚀 Started in detached mode - environment will continue running in background"
        echo "📜 Logs: $log_file"
        exit 0
    else
        echo "📡 Press Ctrl+C to stop the development environment"
        
        # Keep script running until interrupted
        while true; do
            sleep 1
        done
    fi
else
    # Test mode - run tests and exit
    BACKEND_TEST_PASSED=true
    FRONTEND_TEST_PASSED=true
    
    export BACKEND_URL="http://localhost:$PORT"
    cd "$backend_e2e_dir"

    # Run backend tests if not frontend-only
    if [[ "$FRONTEND_ONLY" != "true" ]]; then
        phase "backend-tests-start"
        echo "🧪 Running backend integration tests..."
        
        # Pass any additional arguments to npm test (e.g., test name patterns)
        if [ $# -gt 0 ]; then
            echo "🎯 Running specific tests: $*"
            npm test -- "$@" || BACKEND_TEST_PASSED=false
        else
            echo "🧪 Running all tests..."
            npm test || BACKEND_TEST_PASSED=false
        fi
        phase "backend-tests-end"
    else
        echo "⏭️  Skipping backend tests (--frontend-only flag)"
    fi

    cd "$root_dir"

    # Run frontend tests if not backend-only
    if [[ "$BACKEND_ONLY" != "true" ]]; then
        phase "browser-lane-start"
        if [[ "$INITIAL_SETUP" == "true" ]]; then
            echo "🧪 Running initial-user setup frontend E2E test..."
            if [[ "$UPDATE_SNAPSHOTS" == "true" ]]; then
                npm run test:e2e:initial-setup -w frontend -- --update-snapshots || FRONTEND_TEST_PASSED=false
            else
                npm run test:e2e:initial-setup -w frontend || FRONTEND_TEST_PASSED=false
            fi
        elif [[ "$UPDATE_SNAPSHOTS" == "true" ]]; then
            echo "🧪 Running frontend integration tests with snapshot updates..."
            npm run test:e2e:update -w frontend || FRONTEND_TEST_PASSED=false
        else
            echo "🧪 Running frontend integration tests..."
            if [[ "$FRONTEND_ONLY" == "true" && $# -gt 0 ]]; then
                npm run test:e2e -w frontend -- "$@" || FRONTEND_TEST_PASSED=false
            else
                npm run test:e2e -w frontend || FRONTEND_TEST_PASSED=false
            fi
        fi
        phase "browser-lane-end"

        # Lighthouse owns fixed CDP ports and therefore runs serially after
        # ordinary browser tests, while the Docker stack is still available.
        if [[ "$INITIAL_SETUP" == "false" && "$UPDATE_SNAPSHOTS" == "false" && $# -eq 0 ]]; then
            phase "lighthouse-lane-start"
            npm run test:e2e:lighthouse -w frontend || FRONTEND_TEST_PASSED=false
            phase "lighthouse-lane-end"
        fi
    else
        echo "⏭️  Skipping frontend tests (--backend-only flag)"
    fi

    # Display trace logs for failed requests (backend tests only)
    if [[ "$FRONTEND_ONLY" != "true" ]]; then
        cd "$backend_e2e_dir"
        echo ""
        echo "📋 Displaying trace logs for failed requests..."
        node "$backend_e2e_dir/scripts/display-failed-logs.js" || true  # Don't fail if script has issues
        cd "$root_dir"
    fi

    if [[ "$BACKEND_TEST_PASSED" == "false" || "$FRONTEND_TEST_PASSED" == "false" ]]; then
        if [[ "$BACKEND_TEST_PASSED" == "false" ]]; then
            echo "❌ Backend tests failed"
        fi
        if [[ "$FRONTEND_TEST_PASSED" == "false" ]]; then
            echo "❌ Frontend tests failed"
        fi
        exit 1
    fi

    echo "✅ E2E tests completed"
fi
