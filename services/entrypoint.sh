#!/bin/bash
set -Eeuo pipefail

# Runs the services named in the arguments (the image's CMD) side by side, as the bunqueue user:
#   bunqueue media-catalog list-service   miauflix-catalog-services
#   sources media-load                    miauflix-video-services
if (($# == 0)); then
  echo 'Name the services to run: bunqueue, media-catalog, list-service, sources, media-load' >&2
  exit 64
fi
for name in "$@"; do
  case $name in
  bunqueue | media-catalog | list-service | sources | media-load) ;;
  *)
    echo "Unknown service: $name" >&2
    exit 64
    ;;
  esac
done

runs() {
  local name
  for name in "${@:2}"; do
    [[ $name == "$1" ]] && return 0
  done
  return 1
}

# Started as root: give the service user what it writes, then run everything as that user. The
# downloads volume was the backend's before media-load ran the torrent engine, so files written
# by the backend's user (PUID) change owner once.
if [[ $(id -u) -eq 0 ]]; then
  for name in "$@"; do
    case $name in
    bunqueue) dir=/app/data/bunqueue ;;
    media-catalog) dir=/app/data/catalog ;;
    *) dir=/app/data/$name ;;
    esac
    mkdir -p "$dir"
    # Only this container's own directories: the data volume may be shared with the other one.
    if [[ -n $(find "$dir" ! -user bunqueue -print -quit) ]]; then
      chown -R bunqueue:bunqueue "$dir"
    fi
  done
  downloads=/usr/src/app/downloads
  if runs media-load "$@" && [[ -d "$downloads" ]]; then
    if { ! other_owner=$(find "$downloads" ! -user bunqueue -print -quit) ||
      [[ -n "$other_owner" ]]; } &&
      ! chown -R bunqueue:bunqueue "$downloads"; then
      echo "Could not change ownership of $downloads; checking access as bunqueue" >&2
      # Links are skipped, as chown -R skips them: media-load never creates any, and a stray one
      # to something read-only must not stop the services.
      su-exec bunqueue:bunqueue /bin/bash -o pipefail -c '
        find "$1" -mindepth 1 ! -type l -print0 | while IFS= read -r -d "" entry; do
          if [[ -d "$entry" && ! ( -r "$entry" && -w "$entry" && -x "$entry" ) ]] ||
            [[ -f "$entry" && ! ( -r "$entry" && -w "$entry" ) ]]; then
            printf "bunqueue cannot use download: %q\n" "$entry" >&2
            exit 1
          fi
        done
      ' bash "$downloads"
    fi
    if ! su-exec bunqueue:bunqueue /bin/bash -c '[[ -r "$1" && -w "$1" && -x "$1" ]]' bash "$downloads"; then
      echo "bunqueue needs read, write, and search access to $downloads" >&2
      exit 1
    fi
  fi
  exec su-exec bunqueue:bunqueue /bin/bash "$0" "$@"
fi

children=()
loggers=()
log_pipes=()

launch() {
  local name=$1
  local pipe="/tmp/${name}.log"
  shift

  # /tmp survives a container restart, so drop a pipe left by the previous run
  rm -f "$pipe"
  mkfifo "$pipe"
  log_pipes+=("$pipe")
  (
    local line=''
    while IFS= read -r line || [[ -n "$line" ]]; do
      printf '[%s] %s\n' "$name" "$line"
    done <"$pipe"
  ) &
  loggers+=("$!")
  "$@" >"$pipe" 2>&1 &
  children+=("$!")
}

stop_children() {
  local exit_code=$?
  trap - EXIT INT TERM
  for pid in "${children[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in "${children[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  for pid in "${loggers[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  if ((${#log_pipes[@]})); then
    rm -f "${log_pipes[@]}"
  fi
  exit "$exit_code"
}

trap stop_children EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for name in "$@"; do
  case $name in
  bunqueue) launch bunqueue /app/bunqueue ;;
  *) launch "$name" bun run --cwd "/workspace/services/$name" src/index.ts ;;
  esac
done

set +e
wait -n "${children[@]}"
exit_code=$?
set -e

if [[ $exit_code -eq 0 ]]; then
  echo 'A managed service exited unexpectedly' >&2
  exit_code=1
fi
exit "$exit_code"
