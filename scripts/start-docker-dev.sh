#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

ensure_catalog_data_dir "${SCRIPT_DIR}/.."

# Docker bind mounts require the source to exist as a regular file.
if [ -e .env ] && [ ! -f .env ]; then
  echo "Error: .env must be a regular file, but it is not." >&2
  exit 1
fi

if [ ! -e .env ]; then
  touch .env
fi

docker compose -f docker-compose.dev.yml up -d --build "$@"
