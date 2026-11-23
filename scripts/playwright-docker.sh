#!/bin/bash

# Run a command in the Playwright image CI uses, with the repository at /workspace and Linux
# dependencies installed inside the container (host-built native packages never reach Linux).
#
# Usage: scripts/playwright-docker.sh [docker run options...] -- '<bash command>' [args...]
#   The command runs from /workspace after `bun install`; the args are its "$@".
#
# node_modules lives in named volumes kept between runs, so after the first run the install only
# checks the lockfile. The volumes are keyed by bun.lock's hash: checkouts with different
# dependencies never share one. Installs take a lock in the shared bun cache volume, so runs
# started together (two worktrees, the same lockfile) never install over each other.
# Remove old volumes with: docker volume ls -q --filter name=miauwatch-playwright | xargs docker volume rm

set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
image="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.56.1-jammy}"

if command -v sha1sum >/dev/null; then
  lock_hash=$(sha1sum <"$root_dir/bun.lock" | cut -c1-12)
else
  lock_hash=$(shasum <"$root_dir/bun.lock" | cut -c1-12)
fi
volume="miauwatch-playwright-$lock_hash"

docker_options=()
while [[ $# -gt 0 && "$1" != "--" ]]; do
  docker_options+=("$1")
  shift
done
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 [docker run options...] -- '<bash command>' [args...]" >&2
  exit 2
fi
shift
command="$1"
shift

exec docker run --rm --ipc=host --network=host \
  -v "$root_dir:/workspace" \
  -v "$volume-node-modules:/workspace/node_modules" \
  -v "$volume-frontend-node-modules:/workspace/frontend/node_modules" \
  -v miauwatch-playwright-bun-cache:/root/.bun/install/cache \
  -w /workspace \
  ${docker_options[@]+"${docker_options[@]}"} \
  "$image" \
  bash -lc "npm install -g bun@1.4.0 >/dev/null \
    && flock /root/.bun/install/cache/.miauwatch-install.lock bash -euo pipefail -c '
      current_lock_hash=\$(sha1sum < bun.lock | cut -c1-12)
      if [[ \"\$current_lock_hash\" != \"\$1\" ]]; then
        echo \"bun.lock changed before dependency installation. Rerun the command.\" >&2
        exit 1
      fi
      bun install --frozen-lockfile
    ' bash '$lock_hash' \
    && $command" bash "$@"
