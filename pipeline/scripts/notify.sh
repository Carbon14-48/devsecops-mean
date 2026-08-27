#!/usr/bin/env bash
# DevSecOps notification script
# Sends alerts on BLOCK decision via available channels (Slack, email, file log).
#
# Usage: notify.sh <decision> <score> <threshold> <findings> <report_path>
# Env:   SLACK_WEBHOOK_URL  — if set, posts to Slack
#        NOTIFY_EMAIL       — if set, sends email (requires mailx/sendmail)
#        NOTIFY_LOG_DIR     — directory for notification logs (default: ~/devsecops-runs)

set -eu

DECISION="${1:-UNKNOWN}"
SCORE="${2:-0}"
THRESHOLD="${3:-10}"
FINDINGS="${4:-0}"
REPORT_PATH="${5:-}"
LOG_DIR="${NOTIFY_LOG_DIR:-$HOME/devsecops-runs}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/notifications.log"

send_slack() {
  local webhook="${SLACK_WEBHOOK_URL:-}"
  if [ -z "$webhook" ]; then
    echo "[notify] SLACK_WEBHOOK_URL not set, skipping Slack"
    return 0
  fi

  local emoji="✅"
  local color="#36a64f"
  if [ "$DECISION" = "BLOCK" ]; then
    emoji="⛔"
    color="#dc3545"
  fi

  local payload=$(cat <<EOF
{
  "attachments": [{
    "color": "${color}",
    "title": "${emoji} DevSecOps Pipeline — ${DECISION}",
    "text": "Score: ${SCORE} / seuil ${THRESHOLD}\nFindings: ${FINDINGS}\nBuild: ${BUILD_URL:-inconnu}",
    "footer": "DevSecOps Pipeline",
    "ts": $(date +%s)
  }]
}
EOF
)

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST -H "Content-Type: application/json" \
    -d "$payload" "$webhook")

  if [ "$http_code" = "200" ]; then
    echo "[notify] Slack: sent (${DECISION})"
  else
    echo "[notify] Slack: failed (HTTP ${http_code})"
  fi
}

send_email() {
  local email="${NOTIFY_EMAIL:-}"
  if [ -z "$email" ]; then
    echo "[notify] NOTIFY_EMAIL not set, skipping email"
    return 0
  fi

  local subject="[DevSecOps] ${DECISION} — score ${SCORE}/${THRESHOLD}"
  local body="Décision: ${DECISION}\nScore: ${SCORE} / seuil ${THRESHOLD}\nFindings: ${FINDINGS}\n"

  if [ -n "$REPORT_PATH" ] && [ -f "$REPORT_PATH" ]; then
    body="${body}\n$(cat "$REPORT_PATH")"
  fi

  if command -v mailx &>/dev/null; then
    echo -e "$body" | mailx -s "$subject" "$email"
    echo "[notify] Email: sent to ${email} (${DECISION})"
  elif command -v mail &>/dev/null; then
    echo -e "$body" | mail -s "$subject" "$email"
    echo "[notify] Email: sent to ${email} (${DECISION})"
  else
    echo "[notify] mail/mailx not found, skipping email"
  fi
}

log_notification() {
  local entry="{\"timestamp\":\"${TIMESTAMP}\",\"decision\":\"${DECISION}\",\"score\":${SCORE},\"threshold\":${THRESHOLD},\"findings\":${FINDINGS},\"build\":\"${BUILD_URL:-local}\"}"
  echo "$entry" >> "$LOG_FILE"
  echo "[notify] logged to ${LOG_FILE}"
}

echo "=== NOTIFICATION ==="
echo "  Decision: ${DECISION}"
echo "  Score: ${SCORE} / ${THRESHOLD}"
echo "  Findings: ${FINDINGS}"
echo ""

send_slack
send_email
log_notification

echo "=== END NOTIFICATION ==="
