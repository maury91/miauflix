#!/usr/bin/env bash
# Fetch your NordLynx (WireGuard) private key from NordVPN and save it as NORDVPN_PRIVATE_KEY in .env.
# Neither the access token nor the key is printed.
#
# Usage: scripts/nordvpn-key.sh [path/to/.env]   (default: ./.env)
# Get an access token at https://my.nordaccount.com/dashboard → NordVPN → Get Access Token
# → Generate New Token. Guide: docs/setup/docker-setup.md#using-a-vpn

set -euo pipefail

env_file="${1:-.env}"

for cmd in curl sed; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: $cmd is required" >&2
    exit 1
  fi
done

read -rsp 'NordVPN access token: ' token
echo
if [ -z "$token" ]; then
  echo "Error: no token entered" >&2
  exit 1
fi

if ! response="$(curl -fsS -u "token:$token" https://api.nordvpn.com/v1/users/services/credentials)"; then
  unset token
  echo "Error: NordVPN rejected the request. Check the token and that your subscription is active." >&2
  exit 1
fi
unset token

key="$(printf '%s' "$response" | sed -n 's/.*"nordlynx_private_key"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
unset response
if [ -z "$key" ]; then
  echo "Error: the response did not contain a NordLynx private key" >&2
  exit 1
fi

umask 077
touch "$env_file"
tmp="$(mktemp "${env_file}.XXXXXX")"
grep -v '^NORDVPN_PRIVATE_KEY=' "$env_file" >"$tmp" || true
printf 'NORDVPN_PRIVATE_KEY=%s\n' "$key" >>"$tmp"
unset key
mv "$tmp" "$env_file"
chmod 600 "$env_file"

echo "Saved NORDVPN_PRIVATE_KEY to $env_file"
