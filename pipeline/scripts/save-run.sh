#!/usr/bin/env bash
# Save pipeline output as a timestamped run for dashboard history
set -eu

OUT_DIR="${1:-pipeline/out}"
RUNS_DIR="pipeline/runs"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RUN_DIR="$RUNS_DIR/$TIMESTAMP"

mkdir -p "$RUN_DIR"

for f in decision.json decision.log pivot.json pivot-*.json semgrep.sarif trivy.json gitleaks.json gitleaks.log; do
  if [ -f "$OUT_DIR/$f" ]; then
    cp "$OUT_DIR/$f" "$RUN_DIR/"
  fi
done

echo "[run-saved] $RUN_DIR"
