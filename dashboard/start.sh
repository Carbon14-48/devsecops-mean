#!/usr/bin/env bash
# Start the DevSecOps dashboard (API + static frontend)
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$SCRIPT_DIR/api"
PORT="${PORT:-3200}"

echo "[dashboard] starting API on port $PORT..."
cd "$API_DIR"
exec node server.js
