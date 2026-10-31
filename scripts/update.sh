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

caddyfile_changed=false
if $update_files; then
  echo "==> Downloading compose files from ${FILES_REF}"
  # Download every file before replacing any, so a failure never mixes revisions
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT
  for file in $UPSTREAM_FILES; do
    [ -f "$file" ] || continue
    if ! curl -fsSL "${REPO_RAW}/${FILES_REF}/${file}" -o "${tmpdir}/${file}"; then
      echo "Could not download ${file} from ${FILES_REF}: nothing was changed" >&2
      exit 1
    fi
  done
  backup_suffix="$(date +%Y%m%d-%H%M%S).bak"
  for file in $UPSTREAM_FILES; do
    [ -f "${tmpdir}/${file}" ] || continue
    cmp -s "${tmpdir}/${file}" "$file" && continue
    # Timestamped, so a later run never overwrites the copy holding your own edits
    cp "$file" "${file}.${backup_suffix}"
    mv "${tmpdir}/${file}" "$file"
    chmod 644 "$file"
    echo "    updated ${file} (previous one in ${file}.${backup_suffix}, carry over any edits of yours)"
    [ "$file" = Caddyfile ] && caddyfile_changed=true
  done
fi

echo "==> Pulling images"
docker compose pull

echo "==> Recreating changed containers"
docker compose up -d --remove-orphans
# shellcheck disable=SC2207 # service names never contain spaces
services=($(docker compose config --services))
# Caddy keeps reading the replaced Caddyfile until its container is recreated
if $caddyfile_changed && printf '%s\n' "${services[@]}" | grep -qx caddy; then
  docker compose up -d --force-recreate --no-deps caddy
fi

echo "==> Removing unused images"
docker image prune -f >/dev/null

echo "==> Waiting for the containers to be healthy (up to ${HEALTH_TIMEOUT}s)"
deadline=$((SECONDS + HEALTH_TIMEOUT))
while true; do
  # Containers of the active services that are not running (-a lists a crashed one too),
  # or whose healthcheck is not "healthy" yet
  pending="$(docker compose ps -a "${services[@]}" --format '{{.Service}} {{.State}} {{.Health}}' | awk '$2 != "running" { print $1 " (" $2 ")"; next } $3 != "" && $3 != "healthy" { print $1 " (" $3 ")" }')"
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
