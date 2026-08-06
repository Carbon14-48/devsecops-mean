#!/usr/bin/env bash
# Relais webhook GitHub → Jenkins local via smee.io.
#   GitHub envoie le payload sur le channel smee (URL fixe, publique)
#   smee le transfère sur http://localhost:8080/github-webhook/ (Jenkins)
# Usage :
#   infra/webhook-local.sh           # démarre le relais (arrière-plan)
#   infra/webhook-local.sh --logs    # suit les requêtes entrantes
#   infra/webhook-local.sh --stop    # arrête le relais
set -euo pipefail

SMEE_URL="${SMEE_URL:-https://smee.io/Idi3niApFloU03v}"
TARGET="${TARGET:-http://localhost:8080/github-webhook/}"
LOG="$HOME/jenkins/smee.log"
PIDFILE="$HOME/jenkins/smee.pid"

stop() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null && echo "smee-client arrêté" || echo "pas de processus"
    rm -f "$PIDFILE"
  else
    echo "aucun pidfile"
  fi
}

case "${1:-}" in
  --stop) stop; exit 0 ;;
  --logs) exec tail -f "$LOG" ;;
esac

mkdir -p "$HOME/jenkins"
nohup npx -y smee-client --url "$SMEE_URL" --target "$TARGET" > "$LOG" 2>&1 &
echo $! > "$PIDFILE"
echo "smee-client : $SMEE_URL  →  $TARGET"
echo "logs : $LOG (curl -s $SMEE_URL pour voir la page du channel)"
echo "L'URL à configurer dans GitHub est : $SMEE_URL"
