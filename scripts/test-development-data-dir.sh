#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

task_dir=$(mktemp -d)
trap 'rm -rf "$task_dir"' EXIT

# Fresh development setup must work without production ownership changes or sudo.
sudo() { echo "Unexpected sudo invocation" >&2; return 1; }
chown() { echo "Unexpected chown invocation" >&2; return 1; }
chgrp() { echo "Unexpected chgrp invocation" >&2; return 1; }

ensure_development_data_dir "$task_dir/fresh project"
for target_dir in "$task_dir/fresh project/data" "$task_dir/fresh project/data/media-catalog" "$task_dir/fresh project/data/list-service"; do
  [ -d "$target_dir" ]
  [ "$(get_mode "$target_dir")" = "700" ]
  [ "$(get_owner_group "$target_dir")" = "$(id -u):$(id -g)" ]
done

# A repeat startup must not alter existing permissions or files.
printf 'preserve me\n' > "$task_dir/fresh project/data/list-service/existing.txt"
chmod 0750 "$task_dir/fresh project/data/list-service"
ensure_development_data_dir "$task_dir/fresh project"
[ "$(get_mode "$task_dir/fresh project/data/list-service")" = "750" ]
[ "$(cat "$task_dir/fresh project/data/list-service/existing.txt")" = "preserve me" ]

# Report malformed directory paths as errors, rather than attempting sudo.
mkdir -p "$task_dir/invalid"
touch "$task_dir/invalid/data"
if ensure_development_data_dir "$task_dir/invalid" > "$task_dir/error.log" 2>&1; then
  echo "Expected invalid data directory to fail" >&2
  exit 1
fi

echo "Development data directory checks passed."
