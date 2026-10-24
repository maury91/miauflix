#!/bin/bash
set -Eeuo pipefail

children=()
loggers=()
log_pipes=()

launch() {
  local name=$1
  local pipe="/tmp/${name}.log"
  shift

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

set +e
wait -n "${children[@]}"
exit_code=$?
set -e

if [[ $exit_code -eq 0 ]]; then
  echo 'A managed service exited unexpectedly' >&2
  exit_code=1
fi
exit "$exit_code"
