#!/bin/bash

# Regenerate every committed UI screenshot baseline. They are Linux renders, so each lane runs in
# the Playwright image CI uses.
#
# Usage: scripts/update-ui-snapshots.sh [lane...]
#   storybook      Storybook visual tests (home, QR, Trakt dialog, logo animation)
#   details        Offline details-page lanes (preparation and voting)
#   e2e            Docker E2E lane (home hero, login); starts and stops the test stack
#   initial-setup  Initial-user setup flow; starts and stops its own test stack
# With no lane, all of them run in this order.

set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
playwright_image="mcr.microsoft.com/playwright:v1.56.1-jammy"

lanes=("$@")
if [[ ${#lanes[@]} -eq 0 ]]; then
  lanes=(storybook details e2e initial-setup)
fi

for lane in "${lanes[@]}"; do
  case "$lane" in
    storybook | details | e2e | initial-setup) ;;
    *)
      echo "Unknown lane: $lane (expected storybook, details, e2e or initial-setup)" >&2
      exit 2
      ;;
  esac
done

has_lane() {
  local wanted="$1" lane
  for lane in "${lanes[@]}"; do
    [[ "$lane" == "$wanted" ]] && return 0
  done
  return 1
}

cd "$root_dir"

# Storybook and the details lanes need Linux builds of native packages (esbuild, rollup), so they
# share one container with its own node_modules, as `npm run test:frontend:visual` does.
container_steps=()
if has_lane storybook; then
  container_steps+=("npx playwright test --project=storybook-chromium --update-snapshots")
fi
if has_lane details; then
  container_steps+=("npx playwright test --config=playwright.config.details.ts --update-snapshots")
  container_steps+=("npx playwright test --config=playwright.config.details-voting.ts --update-snapshots")
fi

if [[ ${#container_steps[@]} -gt 0 ]]; then
  steps=$(printf ' && %s' "${container_steps[@]}")
  echo "📸 Updating ${lanes[*]} baselines in $playwright_image..."
  docker run --rm --ipc=host --network=host \
    -v "$root_dir:/workspace" \
    -v /workspace/node_modules \
    -v /workspace/frontend/node_modules \
    -w /workspace \
    "$playwright_image" \
    bash -lc "npm ci --no-audit --no-fund && npm run build:backend && cd frontend${steps}"
fi

if has_lane e2e; then
  echo "📸 Updating Docker E2E baselines..."
  E2E_PLAYWRIGHT_IMAGE="$playwright_image" backend-e2e/scripts/env.sh test --frontend-only --update
fi

if has_lane initial-setup; then
  echo "📸 Updating initial-user setup baselines..."
  backend-e2e/scripts/update-initial-user-snapshots.sh --update-snapshots
fi

echo "✅ Done. Changed baselines:"
git status --short -- '*.png'
