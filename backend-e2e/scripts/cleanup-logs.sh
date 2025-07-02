#!/bin/bash

# Log cleanup script - keeps only the 10 most recent log files
# Usage: ./cleanup-logs.sh

set -e

script_dir=$(dirname $(realpath "$0"))
backend_e2e_dir=$(dirname "$script_dir")

cd "$backend_e2e_dir"

# Cleanup old log files, keeping only the 10 most recent
if [[ -d "logs" ]]; then
    echo "🗂️  Cleaning up old log files (keeping 10 most recent)..."
    # Count log files
    log_count=$(find logs -name "*.log" -type f | wc -l)
    
    if [[ $log_count -gt 10 ]]; then
        # Use ls to sort by modification time (newest first) and remove all but the 10 most recent
        cd logs
        ls -t *.log 2>/dev/null | tail -n +11 | xargs rm -f
        cd ..
        removed_count=$((log_count - 10))
        echo "  📂 Removed $removed_count old log files"
    else
        echo "  📂 Found $log_count log files, no cleanup needed"
    fi
fi