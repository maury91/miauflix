#!/bin/bash

# Update the initial-user setup visual baseline in the Linux Playwright image.
# Usage: npm run test:frontend:e2e:initial-setup:update

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
backend_e2e_dir=$(dirname "$script_dir")
root_dir=$(dirname "$backend_e2e_dir")
project_name="miauflix-tests"
compose_file="docker/docker-compose.test.yml"
playwright_image="mcr.microsoft.com/playwright:v1.56.1-jammy"

cd "$root_dir"

port_assignment=$("$script_dir/find-port.sh")
eval "$port_assignment"
export PORT
export ALLOW_CREATE_ADMIN_ON_FIRST_RUN=true
export USER_ID=$(id -u)
export GROUP_ID=$(id -g)

snapshot_report_dir="$root_dir/frontend/playwright-report-initial-setup"
snapshot_results_dir="$root_dir/frontend/test-results-initial-setup"
docker_dist_dir="$backend_e2e_dir/docker/dist"
env_test_file="$backend_e2e_dir/.env.test"
env_test_backup="$backend_e2e_dir/.env.test.initial-setup-backup"

if [[ -f "$env_test_file" ]]; then
  cp "$env_test_file" "$env_test_backup"
fi

cleanup() {
  status=$?

  docker compose -p "$project_name" -f "$backend_e2e_dir/$compose_file" down -v --remove-orphans || true
rm -rf "$docker_dist_dir"

  if [[ -f "$env_test_backup" ]]; then
    mv "$env_test_backup" "$env_test_file"
  fi

  if [[ "$status" -eq 0 ]]; then
    rm -rf "$snapshot_report_dir" "$snapshot_results_dir"
  fi

  exit "$status"
}

trap cleanup EXIT INT TERM

npm run build:backend

rm -rf "$docker_dist_dir"
mkdir -p "$docker_dist_dir"
cp -r packages/yts-sanitizer "$docker_dist_dir/yts-sanitizer"
cp -r packages/therarbg-sanitizer "$docker_dist_dir/therarbg-sanitizer"
cp -r packages/source-metadata-extractor "$docker_dist_dir/source-metadata-extractor"

docker compose -p "$project_name" -f "$backend_e2e_dir/$compose_file" up --build -d

echo "Waiting for the setup-enabled backend on port $PORT..."
for attempt in {1..60}; do
  if curl --fail --silent "http://127.0.0.1:$PORT/api/health" >/dev/null; then
    break
  fi

  if [[ "$attempt" -eq 60 ]]; then
    echo "Backend did not become healthy in time" >&2
    exit 1
  fi

  sleep 2
done

docker run --rm \
  --ipc=host \
  --network=host \
  -v "$root_dir:/workspace" \
  -w /workspace/frontend \
  -e CI=true \
  -e BACKEND_URL="http://127.0.0.1:$PORT" \
  "$playwright_image" \
  npx playwright test \
    --config=playwright.config.initial-setup.ts \
    --update-snapshots
