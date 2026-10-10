#!/bin/bash

# Prepare compiled sanitizer packages consumed by the YTS and TheRARBG mock
# image build contexts. The caller is responsible for building the packages.

set -euo pipefail

script_dir=$(dirname "$(realpath "$0")")
backend_e2e_dir=$(dirname "$script_dir")
root_dir=$(dirname "$backend_e2e_dir")
docker_dist_dir="$backend_e2e_dir/docker/dist"

cd "$root_dir"
rm -rf "$docker_dist_dir"
mkdir -p "$docker_dist_dir"

for package in yts-sanitizer therarbg-sanitizer source-metadata-extractor; do
  cp -r "packages/$package" "$docker_dist_dir/"
done
