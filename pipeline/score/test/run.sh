#!/usr/bin/env bash
# Noise filter unit tests — proves dedup, confidence, ignoredRules
set -eu
cd "$(dirname "$0")/.."
echo "=== Noise Filter Tests ==="
node test/noise-filter-test.js
echo "=== Done ==="
