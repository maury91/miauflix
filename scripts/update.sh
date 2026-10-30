#!/usr/bin/env bash
# Updates a prebuilt-image deployment to the newest images of the tag in use (MIAUFLIX_VERSION).
# Keep it next to docker-compose.yml and its .env, then run it from anywhere:
#   ./update.sh            pull the images, recreate what changed, wait until healthy
#   ./update.sh --files    also download the newest compose files from GitHub first
# Guide: docs/setup/docker-setup.md#updating-miauflix
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/maury91/miauflix"
FILES_REF="${MIAUFLIX_FILES_REF:-main}"
# Compose files published in the repository; anything else in COMPOSE_FILE is yours and left alone
UPSTREAM_FILES="docker-compose.yml docker-compose.vpn.yml docker-compose.https.yml docker-compose.flaresolverr.yml docker-compose.tracing.yml Caddyfile"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-360}"

update_files=false
for arg in "$@"; do
  case "$arg" in
    --files) update_files=true ;;
    -h | --help)
      sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (see --help)" >&2
      exit 1
      ;;
  esac
done

cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"

if [ ! -f docker-compose.yml ]; then
  echo "No docker-compose.yml in $(pwd): put this script next to your compose files." >&2
  exit 1
fi

if grep -q 'docker-compose.build.yml' .env 2>/dev/null; then
  echo "This deployment builds from source: update it with git pull && npm run start:backend:docker:prod" >&2
  exit 1
fi

if $update_files; then
  echo "==> Downloading compose files from ${FILES_REF}"
  for file in $UPSTREAM_FILES; do
    [ -f "$file" ] || continue
    tmp="$(mktemp)"
    if curl -fsSL "${REPO_RAW}/${FILES_REF}/${file}" -o "$tmp"; then
      if cmp -s "$tmp" "$file"; then
        rm -f "$tmp"
      else
        cp "$file" "${file}.bak"
        mv "$tmp" "$file"
        chmod 644 "$file"
        echo "    updated ${file} (previous one in ${file}.bak)"
      fi
    else
      rm -f "$tmp"
      echo "    could not download ${file}, keeping the current one" >&2
    fi
  done
fi

echo "==> Pulling images"
docker compose pull

echo "==> Recreating changed containers"
docker compose up -d --remove-orphans

echo "==> Removing unused images"
docker image prune -f >/dev/null

echo "==> Waiting for the containers to be healthy (up to ${HEALTH_TIMEOUT}s)"
deadline=$((SECONDS + HEALTH_TIMEOUT))
while true; do
  # Containers with a healthcheck that is not "healthy" yet
  pending="$(docker compose ps --format '{{.Service}} {{.Health}}' | awk '$2 != "" && $2 != "healthy" { print $1 " (" $2 ")" }')"
  [ -z "$pending" ] && break
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Still not healthy: ${pending//$'\n'/, }" >&2
    echo "Check the logs with: docker compose logs --tail 100 <service>" >&2
    docker compose ps
    exit 1
  fi
  sleep 5
done

docker compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
echo "==> Up to date"
