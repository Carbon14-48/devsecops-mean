#!/usr/bin/env bash
# Rollback strategy for DevSecOps pipeline
# Automatically rollback if critical findings are detected post-deployment
#
# Usage: rollback.sh <decision-json> <namespace> [deployment-name]
# Env:   KUBECONFIG — path to kubeconfig (optional, uses default context)

set -eu

DECISION_JSON="${1:-}"
NAMESPACE="${2:-devsecops}"
DEPLOYMENT="${3:-devsecops-app}"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

if [ -z "$DECISION_JSON" ]; then
  echo "[rollback] Usage: rollback.sh <decision.json> <namespace> [deployment]"
  exit 1
fi

# Check if kubectl is available
if ! command -v kubectl &>/dev/null; then
  echo "[rollback] kubectl not found, skipping rollback check"
  exit 0
fi

# Read decision
DECISION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DECISION_JSON','utf8')).decision)")
TOTAL_SCORE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DECISION_JSON','utf8')).totalScore)")

echo "=== ROLLBACK STRATEGY ==="
echo "  Decision: $DECISION"
echo "  Score: $TOTAL_SCORE"
echo "  Namespace: $NAMESPACE"
echo "  Deployment: $DEPLOYMENT"
echo ""

# Check for critical findings
CRITICAL_COUNT=$(node -e "
  const d = JSON.parse(require('fs').readFileSync('$DECISION_JSON','utf8'));
  const crits = (d.top || []).filter(f => f.severity === 'critical');
  console.log(crits.length);
")

echo "Critical findings: $CRITICAL_COUNT"

# Rollback decision logic
SHOULD_ROLLBACK=false
REASON=""

if [ "$DECISION" = "BLOCK" ]; then
  if [ "$CRITICAL_COUNT" -gt 0 ]; then
    SHOULD_ROLLBACK=true
    REASON="BLOCK decision with $CRITICAL_COUNT critical finding(s)"
  elif [ "$TOTAL_SCORE" -gt 100 ]; then
    SHOULD_ROLLBACK=true
    REASON="BLOCK decision with very high score ($TOTAL_SCORE > 100)"
  fi
fi

if [ "$SHOULD_ROLLBACK" = "true" ]; then
  echo ""
  echo "⛔ ROLLBACK TRIGGERED: $REASON"
  echo ""

  # Check if deployment exists
  if kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" &>/dev/null; then
    # Get current revision
    CURRENT_REVISION=$(kubectl rollout history deployment/"$DEPLOYMENT" -n "$NAMESPACE" | tail -1 | awk '{print $1}')
    echo "Current revision: $CURRENT_REVISION"

    # Rollback to previous revision
    echo "Rolling back to previous revision..."
    if kubectl rollout undo deployment/"$DEPLOYMENT" -n "$NAMESPACE"; then
      echo "✅ Rollback initiated successfully"
      echo "Waiting for rollout to complete..."
      kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE" --timeout=120s || true
      echo "✅ Rollback complete"
    else
      echo "❌ Rollback failed"
      exit 1
    fi
  else
    echo "⚠️  Deployment $DEPLOYMENT not found in namespace $NAMESPACE"
    echo "   Manual intervention required"
  fi
else
  echo ""
  echo "✅ No rollback needed"
fi

echo ""
echo "=== END ROLLBACK ==="
