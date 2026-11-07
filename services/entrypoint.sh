#!/bin/bash
set -Eeuo pipefail

# Started as root: give the service user what it writes, then run everything as that user. The
# downloads volume was the backend's before media-load ran the torrent engine, so files written
# by the backend's user (PUID) change owner once.
if [[ $(id -u) -eq 0 ]]; then
  mkdir -p /app/data/media-load
  chown -R bunqueue:bunqueue /app/data/media-load
  downloads=/usr/src/app/downloads
  if [[ -d "$downloads" ]]; then
    if { ! other_owner=$(find "$downloads" ! -user bunqueue -print -quit) ||
      [[ -n "$other_owner" ]]; } &&
      ! chown -R bunqueue:bunqueue "$downloads"; then
      echo "Could not change ownership of $downloads; checking access as bunqueue" >&2
      su-exec bunqueue:bunqueue /bin/bash -o pipefail -c '
        find "$1" -mindepth 1 -print0 | while IFS= read -r -d "" entry; do
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

launch bunqueue /app/bunqueue
launch media-catalog bun run --cwd /workspace/services/media-catalog src/index.ts
launch list-service bun run --cwd /workspace/services/list-service src/index.ts
launch sources bun run --cwd /workspace/services/sources src/index.ts
launch media-load bun run --cwd /workspace/services/media-load src/index.ts

set +e
wait -n "${children[@]}"
exit_code=$?
set -e

if [[ $exit_code -eq 0 ]]; then
  echo 'A managed service exited unexpectedly' >&2
  exit_code=1
fi
exit "$exit_code"
