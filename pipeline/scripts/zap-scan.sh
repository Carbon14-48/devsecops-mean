#!/usr/bin/env bash
# Run OWASP ZAP DAST scan against the MEAN app
# Usage: zap-scan.sh <target-url> [output-dir]
set -eu

TARGET="${1:-http://localhost:3000}"
OUTPUT_DIR="${2:-pipeline/out}"

echo "[zap] starting DAST scan against $TARGET"

# Ensure Docker is available
if ! command -v docker &>/dev/null; then
  echo "[zap] ERROR: docker not found"
  exit 1
fi

# Pull ZAP image if not present
if ! docker image inspect ghcr.io/zaproxy/zaproxy:stable &>/dev/null 2>&1; then
  echo "[zap] pulling zaproxy image..."
  docker pull ghcr.io/zaproxy/zaproxy:stable
fi

# Run ZAP baseline scan (quick scan)
echo "[zap] running baseline scan..."
docker run --rm \
  -v "$OUTPUT_DIR:/zap/wrk/:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
  -t "$TARGET" \
  -r zap-report.html \
  -J zap-report.json \
  -x zap-report.xml \
  -I 2>&1 | tail -20

echo "[zap] scan complete"
ls -la "$OUTPUT_DIR"/zap-report.* 2>/dev/null || echo "[zap] no report files found"
