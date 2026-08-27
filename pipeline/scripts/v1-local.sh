#!/usr/bin/env bash
# Test de bout en bout local V1 : 3 outils (SemGrep + Trivy + Gitleaks).
#   1. Scans parallèles (SemGrep, Trivy, Gitleaks)
#   2. Normalisation → 3 pivots
#   3. Merge → pivot agrégé
#   4. Scoring → décision BLOCK/PASS
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIPE="$REPO_ROOT/pipeline"
OUT="$PIPE/out"
SEMGREP="$PIPE/.venv/bin/semgrep"
GITLEAKS="${GITLEAKS:-$HOME/bin/gitleaks}"

PASSED=0
FAILED=0

step() { echo; echo "==== $1 ===="; }
ok()   { echo "[OK]   $1"; PASSED=$((PASSED + 1)); }
fail() { echo "[FAIL] $1"; FAILED=$((FAILED + 1)); }

mkdir -p "$OUT"
cd "$PIPE"

step "1. Scan SemGrep (règles custom) — app/"
"$SEMGREP" scan --config rules/semgrep.yml --sarif -o "$OUT/semgrep.sarif" "$REPO_ROOT/app" > "$OUT/semgrep.log" 2>&1
node normalize/src/index.js --sarif "$OUT/semgrep.sarif" --tool semgrep --out "$OUT/pivot-semgrep.json" | sed 's/^/   /'
N1=$(node -e "const p=require('$OUT/pivot-semgrep.json'); console.log(p.findings.length)")
if [ "$N1" -eq 3 ]; then ok "SemGrep: 3 findings (attendu)"; else fail "SemGrep: $N1 findings (attendu 3)"; fi

step "2. Scan Trivy SCA — app/server/"
trivy fs --format json --severity HIGH,CRITICAL "$REPO_ROOT/app/server" > "$OUT/trivy.json" 2>/dev/null
node normalize/src/index.js --json "$OUT/trivy.json" --tool trivy --out "$OUT/pivot-trivy.json" | sed 's/^/   /'
N2=$(node -e "const p=require('$OUT/pivot-trivy.json'); console.log(p.findings.length)")
if [ "$N2" -gt 0 ]; then ok "Trivy: $N2 finding(s) (attendu >0)"; else fail "Trivy: 0 findings (attendu >0)"; fi

step "3. Scan Gitleaks secrets — repo entier"
"$GITLEAKS" detect --config "$REPO_ROOT/.gitleaks.toml" --report-format json --report-path "$OUT/gitleaks.json" -v "$REPO_ROOT" > "$OUT/gitleaks.log" 2>&1 || true
node normalize/src/index.js --json "$OUT/gitleaks.json" --tool gitleaks --out "$OUT/pivot-gitleaks.json" | sed 's/^/   /'
N3=$(node -e "const p=require('$OUT/pivot-gitleaks.json'); console.log(p.findings.length)")
if [ "$N3" -gt 0 ]; then ok "Gitleaks: $N3 finding(s) (attendu >0)"; else fail "Gitleaks: 0 findings (attendu >0)"; fi

step "4. Merge des 3 pivots"
node normalize/src/index.js --merge "$OUT/pivot-semgrep.json" "$OUT/pivot-trivy.json" "$OUT/pivot-gitleaks.json" --out "$OUT/pivot.json" | sed 's/^/   /'
NM=$(node -e "const p=require('$OUT/pivot.json'); console.log(p.findings.length)")
if [ "$NM" -eq $((N1 + N2 + N3)) ]; then ok "Merge: $NM findings (somme des 3 outils)"; else fail "Merge: $NM findings (attendu $((N1 + N2 + N3)))"; fi

step "5. Scoring agrégé (seuil 10)"
node score/src/index.js "$OUT/pivot.json" --out "$OUT/decision.json" --fail-on BLOCK | sed 's/^/   /'
D=$(node -e "console.log(require('$OUT/decision.json').decision)")
S=$(node -e "console.log(require('$OUT/decision.json').totalScore)")
if [ "$D" = "BLOCK" ]; then ok "décision = BLOCK (score $S ≥ seuil 10)"; else fail "décision = $D (attendu BLOCK)"; fi

step "6. Vérification par outil (seuils individuels)"
# SemGrep seul → BLOCK (score 18)
node score/src/index.js "$OUT/pivot-semgrep.json" --out "$OUT/decision-semgrep.json" > /dev/null
DS=$(node -e "console.log(require('$OUT/decision-semgrep.json').decision)")
if [ "$DS" = "BLOCK" ]; then ok "SemGrep seul → BLOCK (score 18)"; else fail "SemGrep seul → $DS (attendu BLOCK)"; fi
# Trivy seul → BLOCK (4 HIGH × weight sca)
node score/src/index.js "$OUT/pivot-trivy.json" --out "$OUT/decision-trivy.json" > /dev/null
DT=$(node -e "console.log(require('$OUT/decision-trivy.json').decision)")
if [ "$DT" = "BLOCK" ]; then ok "Trivy seul → BLOCK"; else fail "Trivy seul → $DT (attendu BLOCK)"; fi
# Gitleaks seul → BLOCK (secrets × 2.0)
node score/src/index.js "$OUT/pivot-gitleaks.json" --out "$OUT/decision-gitleaks.json" > /dev/null
DG=$(node -e "console.log(require('$OUT/decision-gitleaks.json').decision)")
if [ "$DG" = "BLOCK" ]; then ok "Gitleaks seul → BLOCK"; else fail "Gitleaks seul → $DG (attendu BLOCK)"; fi

step "Logs"
ls -la "$OUT"/decision*.log | sed 's/^/   /'

echo
echo "======================================="
echo "  V1 local E2E : $PASSED OK / $FAILED FAIL"
echo "======================================="
[ "$FAILED" -eq 0 ]
