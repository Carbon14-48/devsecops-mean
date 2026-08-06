# Démo vidéo V0 — 2 à 3 min

Objectif : montrer la **chaîne complète** push → détection → décision → blocage, en direct.

## Préparation avant la vidéo

- Vérifier que Jenkins tourne : `infra/jenkins-start.sh --bg` puis http://localhost:8080
- Vérifier le relais : `infra/webhook-local.sh` puis `--logs`
- Ouvrir à l'avance (fenêtres prêtes à switcher) :
  1. Terminal (repo)
  2. http://localhost:8080/job/devsecops-v0 (page du job)
  3. GitHub → Settings → Webhooks → Recent Deliveries (optionnel)

## Script — découpage suggéré (~2:30)

### 0:00 — Contexte (voix off, 20 s)
« Pipeline DevSecOps V0 sur une app MEAN volontairement vulnérable :
SemGrep → normalisation pivot → moteur de décision → porte qui bloque le build.
Trois vulnérabilités ont été injectées et documentées dans `app/inject/`. »

### 0:20 — Les vulns injectées (30 s)
Montrer `app/inject/` (3 fichiers) + un extrait :
- `app/server/src/routes/search.js:17` → `$where` (NoSQL injection)
- `app/server/src/config.js:9` → clé AWS en dur
- `app/server/package.json` → `lodash@4.17.15` (CVE)

### 0:50 — La chaîne en local (20 s)
Lancer `pipeline/scripts/v0-local.sh` → montrer la fin :
`DÉCISION : BLOCK (score cumulé non plafonné 18 / seuil 10)`.

### 1:10 — Le push (15 s)
Dans le terminal : `git push origin main` (ou montrer un commit).
« Ce push déclenche le webhook GitHub. »

### 1:25 — Jenkins s'enclenche (50 s)
Switcher sur la page du job :
- Nouveau build lancé « Started by GitHub push »
- Stages qui défilent : `1. Scan SAST (SemGrep)` → `2. Normalisation` → `3. Scoring`
- Le build passe **rouge**
- Ouvrir la console : `DÉCISION : BLOCK (18 / 10)` + le log « Pourquoi BLOCK »
- Montrer les **artefacts** archivés : `semgrep.sarif`, `pivot.json`, `decision.json`, `decision.log`

### 2:15 — Conclusion (15 s)
« La porte est bloquante : les findings pèsent `poids(sévérité) × poids(catégorie)`,
le seuil est configurable (`pipeline/score/config/`). En V1 : 4 outils, base de runs
en MongoDB et recalibrage du seuil. En V2 : dashboard Angular + rapport IA, avec un
LLM jamais décisionnaire — le gate reste déterministe. »

## Points d'attention pour la vidéo

- Si le build est déjà **vert** sur le commit courant, faire un commit bidon puis push
  pour avoir un nouveau build rouge à l'écran.
- Ne pas montrer le secret réel : la clé AWS de `config.js` est un **exemple fictif**
  (`AKIAIOSFODNN7EXAMPLE`), le mentionner à l'oral si on zoome dessus.
- Le relais smee doit tourner ; sinon GitHub affiche les deliveries en échec et rien
  ne se déclenche.
