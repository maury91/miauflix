#!/usr/bin/env bash
set -e

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
