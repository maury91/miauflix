#!/bin/bash

# Build the frontend as a Samsung TV (Tizen) app and zip it into dist/miauflix.wgt.
# The package is unsigned: install it with Apps2Samsung, which signs it with a Samsung
# certificate ("Force Samsung Certificate").
#
# Usage: scripts/package-tizen.sh https://miauflix.example.com
#        (or set MIAUFLIX_TV_API_URL)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/dist/frontend-tizen"
WGT_PATH="${PROJECT_ROOT}/dist/miauflix.wgt"

API_URL="${1:-${MIAUFLIX_TV_API_URL}}"
API_URL="${API_URL%/}"
if [[ ! "${API_URL}" =~ ^https?://[^/]+$ ]]; then
  print_error "Pass the backend's origin, e.g. scripts/package-tizen.sh https://miauflix.example.com"
  exit 1
fi
if [[ "${API_URL}" == http://* ]]; then
  print_warning "${API_URL} is not HTTPS: login cookies need a secure backend to reach the TV app."
fi

if ! command_exists zip; then
  print_error "zip is not installed or not in PATH"
  exit 1
fi

VERSION="$(node -p "require('${PROJECT_ROOT}/package.json').version")"

print_status "Building the Tizen frontend ${VERSION} for ${API_URL}..."
cd "${PROJECT_ROOT}"
VITE_TIZEN=true VITE_API_URL="${API_URL}" npx turbo run build:tizen --filter='./frontend'

sed "s/version=\"[^\"]*\" viewmodes/version=\"${VERSION}\" viewmodes/" \
  "${PROJECT_ROOT}/frontend/tizen/config.xml" > "${BUILD_DIR}/config.xml"

rm -f "${WGT_PATH}"
(cd "${BUILD_DIR}" && zip -qr "${WGT_PATH}" . -x '.*')

print_status "Packaged ${WGT_PATH}"
