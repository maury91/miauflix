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
UPSTREAM_FILES="docker-compose.yml docker-compose.vpn.yml docker-compose.all-in-one.yml docker-compose.https.yml docker-compose.flaresolverr.yml docker-compose.tracing.yml Caddyfile"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-360}"
# Present while a replaced Caddyfile still waits for Caddy to be recreated, so a failed run retries it
CADDY_PENDING=".update-caddy-recreate-pending"

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
    if [ "$file" = Caddyfile ]; then : >"$CADDY_PENDING"; fi
  done
fi

# The images the containers run now: the ones this update replaces are removed at the end
old_images="$(docker compose images -q | sort -u)"

echo "==> Pulling images"
docker compose pull

# HEALTH_TIMEOUT covers starting the containers too
deadline=$((SECONDS + HEALTH_TIMEOUT))
compose_up() {
  local remaining=$((deadline - SECONDS))
  [ "$remaining" -gt 0 ] || remaining=1
  if command -v timeout >/dev/null; then
    timeout "$remaining" docker compose up -d "$@" || {
      local status=$?
      [ "$status" -eq 124 ] && echo "The containers did not start within ${HEALTH_TIMEOUT}s" >&2
      return "$status"
    }
  else
    docker compose up -d "$@"
  fi
}

echo "==> Recreating changed containers (up to ${HEALTH_TIMEOUT}s until healthy)"
compose_up --remove-orphans
# shellcheck disable=SC2207 # service names never contain spaces
services=($(docker compose config --services))
# Caddy keeps reading the replaced Caddyfile until its container is recreated
if [ -e "$CADDY_PENDING" ]; then
  if printf '%s\n' "${services[@]}" | grep -qx caddy; then
    compose_up --force-recreate --no-deps caddy
  fi
  rm -f "$CADDY_PENDING"
fi

echo "==> Removing the replaced images"
# Only this deployment's: other projects' unused images stay
new_images="$(docker compose images -q | sort -u)"
for image in $(comm -23 <(printf '%s\n' "$old_images") <(printf '%s\n' "$new_images")); do
  docker image rm "$image" >/dev/null 2>&1 || true
done

echo "==> Waiting for the containers to be healthy"
while true; do
  # Containers of the active services that are not running (-a lists a crashed one too),
  # or whose healthcheck is not "healthy" yet. -a lists one-off `docker compose run` containers
  # too: those are skipped.
  pending="$(docker compose ps -a "${services[@]}" --format '{{.Label "com.docker.compose.oneoff"}} {{.Service}} {{.State}} {{.Health}}' | awk '$1 == "True" { next } $3 != "running" { print $2 " (" $3 ")"; next } $4 != "" && $4 != "healthy" { print $2 " (" $4 ")" }')"
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
