#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cert_root="${MIAUFLIX_DEV_CERT_DIR:-$repo_root/.certs}"
if [[ "$cert_root" != /* ]]; then
  cert_root="$repo_root/$cert_root"
fi
ca_dir="$cert_root/ca"
server_dir="$cert_root/server"
ca_key="$ca_dir/miauflix-local-ca.key"
ca_cert="$ca_dir/miauflix-local-ca.pem"
server_key="$server_dir/localhost-key.pem"
server_csr="$server_dir/localhost.csr"
server_cert="$server_dir/localhost.pem"
serial_file="$server_dir/miauflix-local-ca.srl"

mkdir -p "$ca_dir" "$server_dir"

ca_was_regenerated=false
if [[ ! -f "$ca_key" || ! -f "$ca_cert" ]]; then
  openssl genrsa -out "$ca_key" 4096
  openssl req -x509 -new -nodes -key "$ca_key" -sha256 -days 825 \
    -out "$ca_cert" -subj '/CN=Miauflix Local Development CA'
  ca_was_regenerated=true
fi

if [[ "$ca_was_regenerated" == true || ! -f "$server_key" || ! -f "$server_cert" ]]; then
  openssl genrsa -out "$server_key" 2048
  openssl req -new -key "$server_key" -out "$server_csr" -subj '/CN=localhost'
  openssl x509 -req -in "$server_csr" -CA "$ca_cert" -CAkey "$ca_key" \
    -CAcreateserial -CAserial "$serial_file" -out "$server_cert" -days 825 -sha256 \
    -extfile <(printf '%s\n' \
      'basicConstraints=critical,CA:FALSE' \
      'keyUsage=critical,digitalSignature,keyEncipherment' \
      'extendedKeyUsage=serverAuth' \
      'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1')
fi

login_keychain="$(security default-keychain -d user | tr -d '\"')"
security add-trusted-cert -d -r trustRoot -k "$login_keychain" "$ca_cert"

rm -f "$server_csr" "$serial_file"
chmod 600 "$ca_key" "$server_key"

printf 'Trusted Miauflix development CA installed in %s\n' "$login_keychain"
printf 'Vite will use %s and %s\n' "$server_cert" "$server_key"
