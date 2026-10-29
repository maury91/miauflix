#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

cd "${SCRIPT_DIR}/.."

# Ensure .env exists on the host so Docker can bind-mount it as a file.
# The config wizard will populate it interactively.
if [ -e .env ] && [ ! -f .env ]; then
  echo "Error: .env must be a regular file, but it is not." >&2
  echo "Move or remove the existing path, then rerun this command." >&2
  exit 1
fi

if [ ! -e .env ]; then
  touch .env
fi

use_source_compose_files .env
docker compose run --rm --build miauflix node --env-file-if-exists .env ./backend/app.js --only-config
