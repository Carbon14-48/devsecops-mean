#!/usr/bin/env bash
# Test de bout en bout local de la chaîne V0 (sans Jenkins).
#   semgrep → SARIF → normalisation pivot → scoring → décision + log
# Vérifie : (1) les 3 vulns injectées → BLOCK, (2) seuil relevé → PASS.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIPE="$REPO_ROOT/pipeline"
OUT="$PIPE/out"
SEMGREP="$PIPE/.venv/bin/semgrep"

PASSED=0
FAILED=0

step() { echo; echo "==== $1 ===="; }
ok()   { echo "[OK]   $1"; PASSED=$((PASSED + 1)); }
fail() { echo "[FAIL] $1"; FAILED=$((FAILED + 1)); }

mkdir -p "$OUT"
cd "$PIPE"

step "1. Scan SemGrep (règles custom) — app/"
"$SEMGREP" scan --config rules/semgrep.yml --sarif -o "$OUT/semgrep.sarif" "$REPO_ROOT/app" > "$OUT/semgrep.log" 2>&1

step "2. Normalisation SARIF → pivot"
node normalize/src/index.js --sarif "$OUT/semgrep.sarif" --out "$OUT/pivot.json" | sed 's/^/   /'

N=$(node -e "const p=require('$OUT/pivot.json'); console.log(p.findings.length)")
if [ "$N" -eq 3 ]; then ok "3 findings pivot (attendu)"; else fail "pivot contient $N findings (attendu 3)"; fi

step "3. Scoring + porte de décision (seuil par défaut 10)"
node score/src/index.js "$OUT/pivot.json" --out "$OUT/decision.json" | sed 's/^/   /'

D=$(node -e "console.log(require('$OUT/decision.json').decision)")
if [ "$D" = "BLOCK" ]; then ok "décision = BLOCK (attendu : vulns présentes)"; else fail "décision = $D (attendu BLOCK)"; fi

step "4. Même pivot, seuil relevé à 100 → PASS"
cat > "$OUT/thresholds-high.json" <<'EOF'
{ "blockThreshold": 100, "maxFindings": 100 }
EOF
node score/src/index.js "$OUT/pivot.json" --thresholds "$OUT/thresholds-high.json" --out "$OUT/decision-high.json" > /dev/null
D2=$(node -e "console.log(require('$OUT/decision-high.json').decision)")
if [ "$D2" = "PASS" ]; then ok "décision = PASS (seuil 100)"; else fail "décision = $D2 (attendu PASS)"; fi

step "Logs d'explication générés"
ls -la "$OUT"/decision*.log | sed 's/^/   /'
if grep -q "Pourquoi BLOCK" "$OUT/decision.log"; then ok "decision.log explique le BLOCK"; else fail "decision.log manquant/incomplet"; fi

step "5. Module sain (fixture) → 0 finding → PASS naturel"
"$SEMGREP" scan --config rules/semgrep.yml --sarif -o "$OUT/semgrep-clean.sarif" "$REPO_ROOT/test/fixtures/clean-app" > "$OUT/semgrep-clean.log" 2>&1
node normalize/src/index.js --sarif "$OUT/semgrep-clean.sarif" --out "$OUT/pivot-clean.json" > /dev/null
N2=$(node -e "const p=require('$OUT/pivot-clean.json'); console.log(p.findings.length)")
if [ "$N2" -eq 0 ]; then ok "pivot fixture sain : 0 finding (attendu)"; else fail "pivot fixture sain : $N2 findings (attendu 0)"; fi

step "6. Scoring fixture sain (seuil par défaut 10) → PASS"
node score/src/index.js "$OUT/pivot-clean.json" --out "$OUT/decision-clean.json" > /dev/null
D3=$(node -e "console.log(require('$OUT/decision-clean.json').decision)")
S3=$(node -e "console.log(require('$OUT/decision-clean.json').totalScore)")
if [ "$D3" = "PASS" ]; then ok "décision = PASS (module sain, score $S3 < seuil)"; else fail "décision = $D3 (attendu PASS)"; fi
if grep -q "Pourquoi PASS" "$OUT/decision-clean.log"; then ok "decision-clean.log explique le PASS"; else fail "decision-clean.log manquant/incomplet"; fi

echo
echo "====================================="
echo "  V0 local E2E : $PASSED OK / $FAILED FAIL"
echo "====================================="
[ "$FAILED" -eq 0 ]
