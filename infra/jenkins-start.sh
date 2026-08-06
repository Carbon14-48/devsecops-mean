#!/usr/bin/env bash
# Démarre Jenkins natif (WAR) en local sur le port 8080.
# Usage :
#   infra/jenkins-start.sh            # lance au premier plan
#   infra/jenkins-start.sh --bg       # lance en arrière-plan (nohup)
#   infra/jenkins-start.sh --stop     # arrête le processus
#   infra/jenkins-start.sh --logs     # suit les logs (mode bg)
set -euo pipefail

JENKINS_HOME_DIR="${JENKINS_HOME:-$HOME/.jenkins}"
WAR="${JENKINS_WAR:-$HOME/jenkins/jenkins.war}"
PORT="${JENKINS_PORT:-8080}"
LOG="$HOME/jenkins/jenkins.log"
PIDFILE="$HOME/jenkins/jenkins.pid"

if [ ! -f "$WAR" ]; then
  echo "WAR introuvable : $WAR — télécharge-le :"
  echo "  mkdir -p ~/jenkins && curl -sL https://get.jenkins.io/war-stable/latest/jenkins.war -o ~/jenkins/jenkins.war"
  exit 1
fi

stop() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null && echo "Jenkins arrêté (pid $(cat "$PIDFILE"))" || echo "Pas de processus actif"
    rm -f "$PIDFILE"
  else
    echo "Aucun pidfile ($PIDFILE)"
  fi
}

case "${1:-}" in
  --stop) stop; exit 0 ;;
  --logs) exec tail -f "$LOG" ;;
esac

mkdir -p "$JENKINS_HOME_DIR" "$HOME/jenkins"

if [ "${1:-}" = "--bg" ]; then
  nohup java ${JENKINS_JAVA_OPTS:-} -jar "$WAR" --httpPort="$PORT" > "$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  echo "Jenkins lancé en arrière-plan sur http://localhost:$PORT (pid $! , logs $LOG)"
  echo "Mot de passe admin initial : $JENKINS_HOME_DIR/secrets/initialAdminPassword"
else
  echo "Jenkins sur http://localhost:$PORT (Ctrl+C pour arrêter)"
  exec java ${JENKINS_JAVA_OPTS:-} -jar "$WAR" --httpPort="$PORT"
fi
