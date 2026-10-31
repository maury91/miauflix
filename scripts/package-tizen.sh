#!/bin/bash

# Build the frontend as a Samsung TV (Tizen) app and zip it into dist/miauflix.wgt.
# The package is unsigned: install it with Apps2Samsung, which signs it with a Samsung
# certificate ("Force Samsung Certificate").
#
# Usage: scripts/package-tizen.sh [server] [--no-pairing | --pairing-url <url>]
#   server         the backend's origin, e.g. https://miauflix.example.com (or set
#                  MIAUFLIX_TV_API_URL). Without it, the TV finds its server on first start:
#                  among the servers announced to the pairing service from its network or
#                  found by scanning it, or by typing the address.
#   --no-pairing   leave the pairing service out: the TV never contacts it
#   --pairing-url  use another pairing service (tv-pairing) than pair.miauflix.cat

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/dist/frontend-tizen"
WGT_PATH="${PROJECT_ROOT}/dist/miauflix.wgt"

API_URL="${MIAUFLIX_TV_API_URL}"
PAIRING_URL="${MIAUFLIX_TV_PAIRING_URL:-https://pair.miauflix.cat}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pairing)
      PAIRING_URL="off"
      shift
      ;;
    --pairing-url)
      PAIRING_URL="${2%/}"
      shift 2
      ;;
    *)
      API_URL="$1"
      shift
      ;;
  esac
done
API_URL="${API_URL%/}"
if [[ -n "${API_URL}" && ! "${API_URL}" =~ ^https?://[^/]+$ ]]; then
  print_error "Pass the backend's origin, e.g. scripts/package-tizen.sh https://miauflix.example.com"
  exit 1
fi
if [[ "${PAIRING_URL}" != "off" && ! "${PAIRING_URL}" =~ ^https?://[^/]+$ ]]; then
  print_error "The pairing service must be an origin, e.g. --pairing-url https://pair.example.com"
  exit 1
fi
if [[ "${API_URL}" == http://* ]]; then
  print_warning "${API_URL} is not HTTPS: the TV app sends its access and refresh tokens unencrypted."
fi

if ! command_exists zip; then
  print_error "zip is not installed or not in PATH"
  exit 1
fi

VERSION="$(node -p "require('${PROJECT_ROOT}/package.json').version")"

print_status "Building the Tizen frontend ${VERSION} for ${API_URL:-the server picked on the TV} (pairing: ${PAIRING_URL})..."
cd "${PROJECT_ROOT}"
# Without a server the build gets "/", which the TV app reads as none (an empty value would fall
# back to the development default)
VITE_TIZEN=true VITE_API_URL="${API_URL:-/}" VITE_TV_PAIRING_URL="${PAIRING_URL}" \
  npx turbo run build:tizen --filter='./frontend'

sed "s/version=\"[^\"]*\" viewmodes/version=\"${VERSION}\" viewmodes/" \
  "${PROJECT_ROOT}/frontend/tizen/config.xml" > "${BUILD_DIR}/config.xml"
# The launcher icon (512x423, from npm run generate:icons)
cp "${PROJECT_ROOT}/frontend/tizen/icon.png" "${BUILD_DIR}/icon.png"

rm -f "${WGT_PATH}"
(cd "${BUILD_DIR}" && zip -qr "${WGT_PATH}" . -x '.*')

print_status "Packaged ${WGT_PATH}"
