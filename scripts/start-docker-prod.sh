#!/usr/bin/env bash
set -e

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

# Try to read NORDVPN_PRIVATE_KEY from .env if not already set in environment
if [ -z "$NORDVPN_PRIVATE_KEY" ] && [ -f .env ]; then
  NORDVPN_PRIVATE_KEY=$(grep -E '^NORDVPN_PRIVATE_KEY=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

if [ -n "$NORDVPN_PRIVATE_KEY" ]; then
  echo "Starting with VPN..."
  docker compose "$@"
else
  echo "NORDVPN_PRIVATE_KEY not set, starting without VPN..."
  docker compose -f docker-compose.novpn.yml "$@"
fi
