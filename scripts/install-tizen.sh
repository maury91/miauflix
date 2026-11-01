#!/bin/bash

# Install dist/miauflix.wgt (from npm run package:tizen) on a Samsung TV in Developer Mode and
# open it, with apps2samsung-cli, which signs it with a Samsung certificate. The first install
# for a TV asks for a Samsung account sign-in in the browser to create that certificate.
#
# Usage: scripts/install-tizen.sh <tv-ip> [apps2samsung-cli install options]
#        (or set MIAUFLIX_TV_IP; `apps2samsung-cli scan` finds the TV)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WGT_PATH="${PROJECT_ROOT}/dist/miauflix.wgt"
CLI="${APPS2SAMSUNG_CLI:-apps2samsung-cli}"

TV_IP="${MIAUFLIX_TV_IP}"
if [[ $# -gt 0 && "$1" != -* ]]; then
  TV_IP="$1"
  shift
fi
if [[ -z "${TV_IP}" ]]; then
  print_error "Pass the TV's IP address, e.g. scripts/install-tizen.sh 192.168.1.50"
  exit 1
fi

if ! command_exists "${CLI}"; then
  print_error "${CLI} is not installed or not in PATH (see docs/setup/samsung-tv.md)"
  exit 1
fi
if [[ ! -f "${WGT_PATH}" ]]; then
  print_error "${WGT_PATH} is missing: build it with npm run package:tizen -- https://your-domain"
  exit 1
fi

print_status "Checking the TV at ${TV_IP}..."
"${CLI}" tv "${TV_IP}"

print_status "Installing ${WGT_PATH}..."
"${CLI}" install "${WGT_PATH}" --tv "${TV_IP}" --launch "$@"

print_status "Miauflix is installed on ${TV_IP}"
