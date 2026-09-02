# DevSecOps MEAN Pipeline

Pipeline DevSecOps complet avec **moteur de décision IA** sur une application **MEAN** (MongoDB, Express, Angular, Node.js) volontairement vulnérable.

**V0-V3 terminé et démontré.** V3 : cluster k3d `devsecops` sain (pods Running), app MEAN déployée via manifests K8s, Argo CD installé et opérationnel (UI + login admin + Application `devsecops-mean` Healthy), scan DAST OWASP ZAP exécuté (0 FAIL). Limite environnementale documentée : pas d'égresse réseau depuis le réseau pod → synchro Git live d'Argo CD indisponible (images importées hors-ligne via containerd), scan ZAP exécuté via le réseau k3d. Score stable de référence : **Phase 1 (V0-V2) = 74 pts + Phase 2 (V3) = +143 pts = 217/10** (BLOCK, seuil 10). E2E final : **v0→BLOCK 217/30** (rouge), **v0-pass→PASS 0/0** (vert).

---

## Résumé des versions

| Version | Objectif | Outils | Score | Statut |
|---------|----------|--------|-------|--------|
| **V0** | Chaîne minimale (1 module, 1 outil) | SemGrep | 18/10 | ✅ TERMINÉ & DÉMONTRÉ |
| **V1** | 3 outils en parallèle + scoring | SemGrep + Trivy + Gitleaks | 88/10 | ✅ TERMINÉ & DÉMONTRÉ |
| **V2** | Dashboard, rapport IA, webhooks, archival | + Express API + Groq LLM + notify + HMAC + Jenkins Credentials | 74/10 | ✅ TERMINÉ & DÉMONTRÉ |
| **V3** | K8s + DAST + composition + rollback | + kube-score + ZAP + composition + Argo CD | 217/10 (dont +143 Phase 2) | ✅ TERMINÉ & DÉMONTRÉ |

> **Note sur le score** : V0/V1 = scores historiques, mesurés avant la séparation Phase 1/Phase 2 ([ADR-0002](docs/ADR/ADR-0002-score-aggregation.md)). Référence stable actuelle : **Phase 1 (V0-V2) = 74 pts** (SemGrep 18 + Trivy 28 + Gitleaks 28), **Phase 2 (V3) = +143 pts** (kube-score 99 + composition 44), total = **217 pts sur un seuil de 10**. La ligne V2 = 74 correspond au cœur V0-V2 seul.

---

## Architecture globale

```
┌─────────────┐    push     ┌──────────┐   webhook    ┌──────────┐
│   GitHub     │ ──────────→ │  Smee.io │ ──────────→  │ Jenkins  │
│  (origin)    │             │ (proxy)  │              │ (CI/CD)  │
└──────┬──────┘             └──────────┘              └────┬─────┘
       │                                                    │
       │  git pull                                         │
       ▼                                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                     PIPELINE Jenkinsfile                         │
│                                                                  │
│  1. HMAC verification                                            │
│  2. Provision outils (SemGrep, Gitleaks) + noise-filter tests        │
│  3. Scans parallèles (3 × resilient retry 3×)                   │
│     ├── SemGrep (SAST)  ─── SARIF → pivot                       │
│     ├── Trivy (SCA)     ─── JSON  → pivot                       │
│     └── Gitleaks (Secrets) ── JSON → pivot                      │
│  4. Normalisation + Merge                                        │
│     ├── kube-score (K8s audit)                                   │
│     └── Composition analysis                                     │
│  5. Scoring déterministe (Σ sévérité × catégorie)               │
│  6. Rapport exécutif IA (langage naturel)                        │
│  7. Post: archive + save-run + notify + rollback check           │
│                                                                  │
│  Gate: score > 10 → BLOCK (build rouge)                          │
│        score ≤ 10 → PASS (build vert)                            │
└──────────────────────────────────────────────────────────────────┘
       │                                      │
       ▼                                      ▼
┌──────────────┐                    ┌──────────────────┐
│  Dashboard   │                    │  K8s / Docker    │
│  (port 3200) │                    │  (app + MongoDB) │
└──────────────┘                    └──────────────────┘
```

---

## Structure du monorepo

```
devsecops-mean/
├── app/                        ★ Application MEAN cible (vulnérable)
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.js        Entry point (Express + MongoDB connect)
│   │   │   ├── config.js       Config centralisée (VULN-002: secret en dur)
│   │   │   └── routes/
│   │   │       ├── books.js    CRUD livres
│   │   │       ├── search.js   Recherche (VULN-001: injection NoSQL)
│   │   │       └── auth.js     Authentification (VULN-001: injection NoSQL)
│   │   ├── Dockerfile.local    Dockerfile production (copie node_modules)
│   │   ├── package.json
│   │   └── package-lock.json   lodash@4.17.15 (VULN-003: CVEs)
│   ├── client/                 Angular (squelette)
│   └── inject/                 Vulnérabilités injectées & documentées
│
├── pipeline/                   ★ Chaîne de sécurité (100% Node.js)
│   ├── Jenkinsfile             Pipeline Jenkins complète (7 stages)
│   ├── rules/
│   │   └── semgrep.yml         Règles custom SemGrep
│   ├── normalize/
│   │   ├── src/
│   │   │   ├── index.js        Dispatcher CLI (semgrep/trivy/gitleaks/kube-score/zaproxy/merge)
│   │   │   ├── semgrep.js      Normaliseur SemGrep (SARIF → pivot)
│   │   │   ├── trivy.js        Normaliseur Trivy (JSON → pivot)
│   │   │   ├── gitleaks.js     Normaliseur Gitleaks (JSON → pivot)
│   │   │   ├── kube-score.js   Normaliseur kube-score (text → pivot)
│   │   │   └── zap.js          Normaliseur OWASP ZAP (JSON → pivot)
│   ├── score/
│   │   ├── src/
│   │   │   ├── engine.js       Logique de scoring (décision + explication)
│   │   │   └── index.js        CLI wrapper
 │   │   └── config/
│   │       └── weights.json    Pondérations (severity × category)
│   │   └── test/
│   │       ├── run.sh          Lance les tests noise-filter (12 assertions)
│   │       └── noise-filter-test.js  Tests dedup / confidence / ignoredRules
│   ├── ai/
│   │   ├── llm.js             Appel LLM Groq (fetch natif, fallback déterministe)
│   │   ├── report.js          Rapport exécutif (déterministe + section IA)
│   │   └── composition.js     Analyse d'architecture / surface d'attaque
│   ├── scripts/
│   │   ├── v0-local.sh         Test E2E V0 (7/7 OK)
│   │   ├── v1-local.sh         Test E2E V1 (10/10 OK)
│   │   ├── save-run.sh         Archivage des runs (~/devsecops-runs/<timestamp>/)
│   │   ├── notify.sh           Notifications (Slack webhook / email / log file)
│   │   ├── rollback.sh         Auto-rollback K8s sur BLOCK critique
│   │   └── zap-scan.sh         Scan DAST OWASP ZAP (via Docker)
│   └── out/                    Sorties de scan (pivot.json, decision.json, report.txt)
│
├── dashboard/                  Dashboard web (V2)
│   ├── api/
│   │   ├── server.js           Express API (port 3200, lit ~/devsecops-runs/)
│   │   └── package.json
│   ├── web/
│   │   └── index.html          SPA vanilla JS (dark theme, category cards)
│   └── start.sh                Script de démarrage
│
├── k8s/                        Manifests Kubernetes (V3)
│   ├── base/
│   │   ├── namespace.yaml      Namespace devsecops
│   │   ├── mongodb-deployment.yaml  MongoDB (TCP probes, Secret, resources)
│   │   ├── mongodb-service.yaml     Service ClusterIP:27017
│   │   ├── app-deployment.yaml      App Node.js (2 replicas, /health probes)
│   │   ├── app-service.yaml         Service ClusterIP:80 + Ingress
│   │   └── kustomization.yaml       Kustomize base
│   ├── overlays/
│   │   ├── dev/kustomization.yaml   1 replica
│   │   └── prod/kustomization.yaml  3 replicas
│   └── argocd-app.yaml              Argo CD Application manifest
│
├── infra/                      Jenkins jobs XML
├── docs/
│   ├── ROADMAP.md              Roadmap V0 → V3 (tout TERMINÉ)
│   ├── ADR/
│   │   └── ADR-0001-threshold-v0.md  Seuil décision + limitation Gitleaks --no-git
│   ├── V2-HMAC-SETUP.md       Documentation HMAC webhook
│   └── DEMO-V0.md             Guide de démonstration V0
│
├── test/fixtures/
│   └── clean-app/             Module sain (test PASS: 0 vulnérabilité)
│       ├── src/index.js
│       ├── src/routes/hello.js
│       └── package.json
│
├── .gitleaks.toml              Config Gitleaks (allowlist + rules custom)
├── ROADMAP.md                  Roadmap global
└── README.md                   Ce fichier
```

---

## Vulnérabilités injectées

| ID | Vulnérabilité | Fichier | Détection | Score |
|----|---------------|---------|-----------|-------|
| VULN-001 | Injection NoSQL (`$where`, `findOne`) | `app/server/src/routes/search.js`, `auth.js` | SemGrep (SAST) | 7 pts |
| VULN-002 | Secret AWS en dur (`AKIAIOSFODNN7EXAMPLE`) | `app/server/src/config.js:9` | SemGrep + Gitleaks | 14 pts |
| VULN-002b | Mot de passe en dur (`admin123`) | `app/server/src/config.js:15` | Gitleaks | 14 pts |
| VULN-003 | `lodash@4.17.15` avec 5 CVEs | `app/server/package-lock.json` | Trivy SCA | 28 pts |
| VULN-K8s | Secret Kubernetes en dur | `k8s/base/app-deployment.yaml:62` | Gitleaks | 14 pts |
| VULN-K8s-CONFIG | 15 findings kube-score | `k8s/base/*.yaml` | kube-score | 99 pts |
| VULN-COMP | 6 findings composition | `app/server/src/config.js` | composition.js | 44 pts |

---

## Outils de scan

| Outil | Catégorie | Version | Binaire | Description |
|-------|-----------|---------|---------|-------------|
| **SemGrep** | SAST | 1.172.0 | `~/devsecops-tools/semgrep-venv/bin/semgrep` | Analyse statique avec règles custom |
| **Trivy** | SCA | 0.73.0 | `/usr/bin/trivy` | Scan des dépendances (CVEs) |
| **Gitleaks** | Secrets | 8.30.1 | `~/devsecops-tools/gitleaks` | Détection de secrets exposés |
| **kube-score** | K8s | 1.19.0 | `~/devsecops-tools/kube-score` | Audit de configuration Kubernetes |
| **OWASP ZAP** | DAST | stable | `ghcr.io/zaproxy/zaproxy` | Analyse dynamique — **exécuté** (0 FAIL / 58 PASS / 3 WARN) |
| **Composition** | Architecture | - | `node pipeline/ai/composition.js` | Analyse de la surface d'attaque |

### Config Gitleaks (`.gitleaks.toml`)

L'allowlist exclut les chemins bruités pour un score **stable** :
- `pipeline/out/` — sorties de scan
- `pipeline/runs/` — archivage des runs (source principale de drift)
- `docs/` — documentation avec secrets démo
- `app/inject/` — fichiers d'injection
- `app/server/node_modules/`

---

## Scoring

Le moteur de scoring est **déterministe et explicable** :

```
Score = Σ (sévérité × catégorie)
```

### Pondérations (`pipeline/score/config/weights.json`)

| Sévérité | Poids | Catégorie | Poids |
|----------|-------|-----------|-------|
| Critical | 10 | SAST | 1.0 |
| High | 7 | SCA | 1.0 |
| Medium | 4 | Secrets | 2.0 |
| Low | 1 | Container | 1.2 |
| Info | 0.5 | K8s | 1.0 |
| | | DAST | 1.5 |

### Seuil de blocage : 10 (configurable)

### Score de référence (stable) — séparé Phase 1 / Phase 2

**Phase 1 — V0-V2 (cœur du pipeline) :**

| Composant | Findings | Score |
|-----------|----------|-------|
| SemGrep (SAST) | 3 | 18 pts |
| Trivy (SCA) | 4 | 28 pts |
| Gitleaks (Secrets) | 2 | 28 pts |
| **Phase 1 total** | **9** | **74 pts** |

**Phase 2 — V3 (ajouts K8s + composition) :**

| Composant | Findings | Score |
|-----------|----------|-------|
| kube-score (K8s) | 15 | 99 pts |
| Composition | 6 | 44 pts |
| **Phase 2 total** | **21** | **+143 pts** |

**Total (Phase 1 + Phase 2) : 30 findings → 217 pts**

> Voir [ADR-0002](docs/ADR/ADR-0002-score-aggregation.md) pour la justification de la séparation Phase 1/Phase 2.

 **Historique du score** :
- V0 : 18 → V1 : 88 → V3 : 231 → **Fix drift : 217 (stable)**

---

## Filtrage du bruit / déduplication

Le scoring inclut un filtre de bruit (`pipeline/score/src/engine.js` → `filterNoise()`) qui supprime les **doublons** (même `id`) et les findings à **confiance faible** ou **règles ignorées**.

**Contrat d'id** : `hashId([tool, ruleId, file, line])`. Deux findings d'outils différents sur la même ligne ont des ids **distincts** → chacun est compté (c'est un choix de conception, pas un bug). Un doublon *vrai* partage exactement le même id.

### Tests unitaires — preuve directe

`pipeline/score/test/run.sh` → **12/12 assertions passantes** :

```
Test 1: Dedup by id         → bruts: 3 → filtrés: 2  (même id, gardé le plus sévère)
Test 2: Confidence          → bruts: 3 → filtrés: 1  (confidence < 0.5 supprimé)
Test 3: ignoredRules        → bruts: 3 → filtrés: 1  (règle ignorée supprimée)
Test 4: Combined scenario   → bruts: 5 → filtrés: 2  (déduction + confiance + ignoredRules)
Test 5: decide() full run   → raw: 3 → filtered: 1   (bruit complet)
```

Ces tests tournnent à chaque build Jenkins (Stage 2 "Provision outils").

### Preuve E2E — pivot réel + doublon injecté

On prend le pivot du run de référence (`20260901-165026`, 30 findings, 217 pts), on injecte un **doublon** (même id, sévérité inférieure), et on relance le scoring :

```
Findings bruts : 31  →  après filtrage bruit/dédup : 30
DÉCISION : BLOCK (score inchangé = 217 / seuil 10)
```

→ le doublon est **supprimé**, le score original **217** est préservé. Artefacts : `~/devsecops-runs/dedup-proof-20260902-120826/` (decision.log + decision.json + pivot-injected.json).

---

## Pipeline Jenkins — Détail des stages

```
Stage 1: HMAC verification
  ├── Secret chargé depuis Jenkins Credentials (github-webhook-secret)
  ├── Preuve HMAC-SHA256 calculée sur payload test
  └── Limitation smee documentée (relay strip signature)

 Stage 2: Provision outils
  ├── SemGrep: pip install dans venv
  ├── Gitleaks: curl + tar (si absent)
  └── Noise filter tests: pipeline/score/test/run.sh (12 assertions: dedup + confidence + ignoredRules)

Stage 3: Scans parallèles (3 × retry avec fallback vide)
  ├── 3a. Scan SAST (SemGrep)
  │   └── semgrep --config auto --sarif → semgrep.sarif
  ├── 3b. Scan SCA (Trivy)
  │   └── trivy fs --skip-db-update --format json --severity HIGH,CRITICAL → trivy.json
  └── 3c. Scan Secrets (Gitleaks)
      └── gitleaks detect --config .gitleaks.toml --no-git → gitleaks.json

Secrets chargés depuis Jenkins Credentials (stage global "environment") :
  ├── GROQ_API_KEY   = credentials('groq-api-key')       → rapport IA (Groq)
  ├── SLACK_WEBHOOK_URL = credentials('slack-webhook-url') → notify.sh
  └── HMAC_SECRET    = credentials('github-webhook-secret') → vérification HMAC

Stage 4: Normalisation + Merge
  ├── Chaque outil → format pivot (JSON normalisé)
  ├── Phase 1 pivot: semgrep+trivy+gitleaks → pivot-phase1.json
  ├── Phase 2: + kube-score + composition → pivot.json

Stage 5: Scoring + porte de décision
  ├── Phase 1: pivot-phase1.json → decision-phase1.json (V0-V2 score)
  ├── Total: pivot.json → decision.json (Phase 1 + Phase 2 = total score)
  └── decision.json inclut phase1.score + phase2Contribution

Stage 6: Rapport exécutif
  ├── Affiche Phase 1 (V0-V2) + Phase 2 (V3) séparément
  ├── Appel LLM (Groq) → section RÉSUMÉ EXÉCUTIF en langage naturel
  └── report.txt = rapport déterministe + section IA

Stage 7: Post
  ├── Archivage artifacts (14 fichiers)
  ├── save-run.sh → ~/devsecops-runs/<timestamp>/
  ├── notify.sh → Slack / email / log file
  └── rollback.sh → auto-rollback si BLOCK critique
```

---

## Application MEAN

### Endpoints

| Route | Méthode | Description |
|-------|---------|-------------|
| `/` | GET | Info API (name, version, endpoints) |
| `/health` | GET | Health check (`{"status":"ok"}`) |
| `/api/books` | GET | Liste des livres |
| `/api/books` | POST | Créer un livre |
| `/api/search` | GET | Recherche (VULN-001: injection NoSQL) |
| `/api/auth` | POST | Login (VULN-001: injection NoSQL) |

### Config

- Port : 3000
- MongoDB : `MONGODB_URI` env var (défaut: `mongodb://localhost:27017/devsecops`)
- Retry DB : 10 tentatives, 3s de délai (pour K8s DNS transient)

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `MONGODB_URI` | URI MongoDB | `mongodb://localhost:27017/devsecops` |
| `NODE_ENV` | Environnement | `development` |
| `API_KEY` | Clé API (intentional vuln) | (en dur dans config.js) |

---

## Dashboard (port 3200)

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Dernier run (décision, score, findings) |
| `GET /api/runs` | Historique des runs |
| `GET /api/runs/:id` | Détail d'un run |
| `GET /api/findings` | Findings du dernier run |
| `GET /api/weights` | Pondérations actives |
| `GET /api/health` | Santé de l'API |

### Frontend

SPA vanilla JS avec :
- Dark theme
- Cards par catégorie (SAST, SCA, Secrets, K8s, DAST, Container)
- Score cumulé + décision en temps réel
- Historique des runs

### Démarrage

```bash
cd dashboard/api && npm install && node server.js
# ou
pm2 start dashboard/api/server.js --name dashboard
```

---

## Kubernetes

### Manifests (`k8s/base/`)

| Fichier | Ressource |
|---------|-----------|
| `namespace.yaml` | Namespace `devsecops` |
| `mongodb-deployment.yaml` | MongoDB (TCP probes, Secret, emptyDir) |
| `mongodb-service.yaml` | Service ClusterIP:27017 |
| `app-deployment.yaml` | App Node.js (2 replicas, liveness/readiness /health) |
| `app-service.yaml` | Service ClusterIP:80 + Ingress |
| `kustomization.yaml` | Kustomize base |

### Overlays

- **dev** : 1 replica
- **prod** : 3 replicas

### Argo CD

`k8s/argocd-app.yaml` — Application manifest pour GitOps.

Installé sur le cluster `devsecops` (namespace `argocd`, 7 pods Running/Ready). UI : `kubectl -n argocd port-forward svc/argocd-server 9090:80` puis `https://localhost:9090` (HTTPS auto-signé — accepter le certificat une fois). Identifiants : **`admin` / `4OKpXWRDqaW2oyH8`**. Application `devsecops-mean` appliquée et **Healthy**. Synchronisation Git live désactivée faute d'égrèsse réseau (voir "Ce qui reste à faire").

### Docker

- `mean-app:local` : Image app (build via `Dockerfile.local`)
- `mongo:7` : Image MongoDB officielle
- `ghcr.io/zaproxy/zaproxy:stable` : ZAP DAST

### k3d

Cluster `devsecops` opérationnel (3 pods kube-system + app + MongoDB Running).

```bash
~/devsecops-tools/k3d cluster create devsecops \
  --port 80:80@loadbalancer --port 443:443@loadbalancer --port 8081:30081@loadbalancer
# + importer les images hors-ligne : docker save → ctr -n k8s.io images import
kubectl apply -k k8s/overlays/dev
```

---

## Scan DAST — OWASP ZAP (V3)

Scan baseline ZAP exécuté contre l'application **déployée** sur le cluster (via le réseau k3d pour joindre la nodePort Traefik).

| Métrique | Valeur |
|----------|--------|
| FAIL-NEW | **0** |
| PASS | **58** |
| WARN-NEW | 3 (mineurs) |
| Cibles | `/` + routes API (ingress catch-all ajouté pour le scan) |

Avertissements (mineurs) :
- `10021` X-Content-Type-Options manquant
- `10037` X-Powered-By exposé (fuite de version)
- `10055` CSP : directive sans fallback

Rapports : `pipeline/out/zap-report.html` (idéal pour capture), `.json`, `.xml`.

```bash
docker run --rm --network k3d-devsecops \
  -v "$PWD/pipeline/out:/zap/wrk/:rw" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t "http://172.18.0.3:32614/" -r zap-report.html -J zap-report.json -x zap-report.xml -I
```

---

## Services fonctionnels

| Service | URL | Status |
|---------|-----|--------|
| **Jenkins** | http://localhost:8080 | ✅ admin/admin |
| **Dashboard** | http://localhost:3200 | ✅ PM2 daemon |
| **App (K8s)** | http://localhost/ (Host: `devsecops.local`) | ✅ Ingress Traefik → 200 `{"status":"ok"}` |
| **Argo CD** | port-forward `kubectl -n argocd port-forward svc/argocd-server 9090:80` | ✅ HTTPS auto-signé — `admin` / `4OKpXWRDqaW2oyH8` |
| **Smee** | https://smee.io/Idi3niApFloU03v | ✅ → Jenkins |

### Commands de démarrage

```bash
# Jenkins
cd ~/jenkins && java -jar jenkins.war --httpPort=8080 &

# MongoDB
docker run -d --name mongo-dev -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=admin123 -p 27017:27017 mongo:7

# App
docker run -d --name mean-app \
  -e MONGODB_URI="mongodb://admin:admin123@host.docker.internal:27017/devsecops?authSource=admin" \
  --add-host=host.docker.internal:host-gateway -p 3000:3000 mean-app:local

# Dashboard
pm2 start dashboard/api/server.js --name dashboard

# Smee
smee --url https://smee.io/Idi3niApFloU03v --target http://localhost:8080/github-webhook/
```

---

## Reproduire localement

### Test complet (E2E)

```bash
# 1. Builder l'image Docker
cd app/server && docker build -f Dockerfile.local -t mean-app:local .

# 2. Lancer MongoDB + App
docker run -d --name mongo-dev -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=admin123 -p 27017:27017 mongo:7
docker run -d --name mean-app \
  -e MONGODB_URI="mongodb://admin:admin123@host.docker.internal:27017/devsecops?authSource=admin" \
  --add-host=host.docker.internal:host-gateway -p 3000:3000 mean-app:local

# 3. Scanner
cd /home/carbon14/devsecops-mean
~/devsecops-tools/semgrep-venv/bin/semgrep --config auto --sarif app/server/src/ > /tmp/semgrep.sarif
trivy fs --skip-db-update --format json --severity HIGH,CRITICAL app/server/ > /tmp/trivy.json
~/devsecops-tools/gitleaks detect --config .gitleaks.toml --no-git -s . --report-format json --report-path - > /tmp/gl.json

# 4. Normaliser + Merge + Score
node pipeline/normalize/src/index.js --sarif /tmp/semgrep.sarif --tool semgrep --out pipeline/out/semgrep.pivot.json
node pipeline/normalize/src/index.js --json /tmp/trivy.json --tool trivy --out pipeline/out/trivy.pivot.json
node pipeline/normalize/src/index.js --json /tmp/gl.json --tool gitleaks --out pipeline/out/gitleaks.pivot.json
node pipeline/normalize/src/index.js --merge pipeline/out/semgrep.pivot.json pipeline/out/trivy.pivot.json pipeline/out/gitleaks.pivot.json --out pipeline/out/pivot.json
node pipeline/score/src/index.js pipeline/out/pivot.json --out pipeline/out/decision.json

# 5. Rapport
node pipeline/ai/report.js pipeline/out/pivot.json pipeline/out/decision.json > pipeline/out/report.txt
```

Attendu : **BLOCK** (score 217, 30 findings)

### Test PASS (clean-app)

```bash
SCAN_ROOT=test/fixtures/clean-app
# Même pipeline, mais score = 0 → PASS
```

---

## Outillage machine

| Outil | Version | Emplacement |
|-------|---------|-------------|
| Node.js | 20.20.0 | `/usr/bin/node` |
| Java | 21 | `/usr/bin/java` |
| Trivy | 0.73.0 | `/usr/bin/trivy` |
| Docker | 29.7.2 | `/usr/bin/docker` |
| Gitleaks | 8.30.1 | `~/devsecops-tools/gitleaks` |
| SemGrep | 1.172.0 | `~/devsecops-tools/semgrep-venv/bin/semgrep` |
| k3d | 5.7.5 | `~/devsecops-tools/k3d` |
| kubectl | 1.30.6 | `~/devsecops-tools/kubectl` |
| kube-score | 1.19.0 | `~/devsecops-tools/kube-score` |
| pm2 | - | `~/.nvm/versions/node/v20.20.0/bin/pm2` |
| smee | - | `~/.nvm/versions/node/v20.20.0/bin/smee` |

### Infra Jenkins

- WAR : `~/jenkins/jenkins.war`
- HOME : `~/.jenkins/`
- Credentials (Jenkins Credentials Binding, tous en "Secret text", stock système) :
  - `groq-api-key` → clé API Groq (rapport IA)
  - `github-webhook-secret` → secret HMAC webhook GitHub (GLOBAL, plaintext)
  - `slack-webhook-url` → webhook Slack (notifications)
- Chargés dans le pipeline : `environment { GROQ_API_KEY = credentials('groq-api-key'); SLACK_WEBHOOK_URL = credentials('slack-webhook-url'); HMAC_SECRET = credentials('github-webhook-secret') }`
- Webhook HMAC : `$HOME/.jenkins/secrets/webhook-hmac-secret`

---

## Score stable — Fix du drift

### Problème

Le score dérivait à chaque run (88→231→...) à cause de :
- `pipeline/runs/` — fichiers pivot archivés contenant le secret de test (12 findings en croissance)
- `docs/` — markdown démo avec secrets (1 finding)
- `app/inject/` — fichiers d'injection (1 finding)

### Fix

1. **`.gitleaks.toml`** — ajouté `pipeline/runs/`, `docs/`, `app/inject/` à l'allowlist
2. **`pipeline/Jenkinsfile`** — kube-score + composition skip quand `SCAN_ROOT != app`

### Résultat

Score **217** stable sur 3 builds consécutifs (#27, #28, #29, #30).

### Fix complémentaire (sept. 2026) — Trivy devenu réel

- Ajout de `--skip-db-update` dans le Jenkinsfile (stage SCA) : avant ce fix, Trivy tentait de télécharger sa DB et **pendait** (fallback vide → fausse note PASS 0/0). Désormais Trivy scanne avec la DB locale et le verdict est **honnête**.
- E2E final (jobs avec leur SCAN_ROOT par défaut) :
  - `devsecops-v0` (#36, target `app/`) → **FAILURE / BLOCK / 217 pts / 30 findings** (rouge) ✅ attendu
  - `devsecops-v0-pass` (#26, target `test/fixtures/clean-app`) → **SUCCESS / PASS / 0 pts / 0 finding** (vert) ✅ attendu

---

## Ce qui reste à faire

### Bloqué (contraintes réseau/environnement)

- [ ] **Argo CD — synchro Git live** — le réseau pod n'a aucune égrèsse (ni DNS ni TCP sortant) : `ls-remote`/clone GitHub impossible depuis les pods. L'enregistrement de repo et la synchro live sont indisponibles. Compensation : images importées hors-ligne (containerd), Application CR appliquée, UI + login admin opérationnels.
- [ ] **Pull d'images K8s** — containerd dans k3s ne peut pas tirer d'images (pas d'égrèsse) : toute image doit être importée manuellement (`docker save` → `ctr -n k8s.io images import`).

### Résolu depuis la dernière section "bloqués" (sept. 2026)

- [x] **Argo CD** — installé et opérationnel sur le cluster `devsecops` (7 pods Running/Ready), UI accessible (port-forward), login admin vérifié, Application `devsecops-mean` Healthy. Images `argocd`, `dex`, `redis` importées hors-ligne.
- [x] **K8s cluster** — k3d `devsecops` recréé (ports 80/443/8081), CoreDNS + traefik + metrics-server + local-path-provisioner Running, app MEAN + MongoDB pod Running.
- [x] **ZAP DAST** — image `ghcr.io/zaproxy/zaproxy:stable` disponible, scan baseline exécuté contre l'app via le réseau k3d : **FAIL-NEW: 0 / PASS: 58 / WARN-NEW: 3** → `pipeline/out/zap-report.html/json/xml`.

```bash
# Redeployer le cluster (si besoin)
k3d cluster create devsecops \
  --port 80:80@loadbalancer --port 443:443@loadbalancer --port 8081:30081@loadbalancer
kubectl apply -k k8s/overlays/dev

# Scan DAST (ZAP baseline) — via le réseau k3d pour joindre la nodePort Traefik
docker run --rm --network k3d-devsecops \
  -v "$PWD/pipeline/out:/zap/wrk/:rw" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t "http://172.18.0.3:32614/" -r zap-report.html -J zap-report.json -x zap-report.xml -I
```

### Optionnel

- [ ] Angular dashboard (remplacer vanilla JS)
- [ ] MongoDB persistant (PVC au lieu de emptyDir)
- [ ] NetworkPolicies pour isoler les pods
- [ ] PodDisruptionBudget pour la haute disponibilité
- [ ] TLS/Ingress avec cert-manager
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Log aggregation (EFK stack)

---

## Démo en direct — ordre recommandé

### Prérequis (tout doit tourner)

```bash
export PATH="$HOME/devsecops-tools:$PATH"

# 1. Cluster (déjà up normalement)
kubectl get nodes
kubectl get pods -A

# 2. Jenkins (port 8080)
bash infra/jenkins-start.sh --bg

# 3. Argo CD (UI sur https://localhost:9090)
kubectl -n argocd port-forward svc/argocd-server 9090:80 &

# 4. Dashboard (port 3200)
pm2 start dashboard/api/server.js --name dashboard 2>/dev/null || pm2 restart dashboard

# 5. Smee (webhook GitHub → Jenkins)
smee --url https://smee.io/Idi3niApFloU03v --target http://localhost:8080/github-webhook/ &
```

### Ordre de la démo (avec les captures)

1. **Cluster K8s sain** — `kubectl get pods -A` → montrer tous les namespaces Running (kube-system, devsecops, argocd).
2. **App live** — `curl -H "Host: devsecops.local" http://localhost/health` → `{"status":"ok"}` ; ouvrir `http://localhost/` (Host) dans le navigateur.
3. **Argo CD** — `https://localhost:9090` → accepter le certificat, login `admin` / `4OKpXWRDqaW2oyH8` → page Applications → `devsecops-mean` **Healthy**.
4. **Jenkins E2E** — job `devsecops-v0` → **BLOCK 217 (rouge)** ; job `devsecops-v0-pass` → **PASS 0 (vert)**. Montrer la porte de décision dans la console d'un build.
5. **Dashboard** — `http://localhost:3200` → cards par catégorie (SAST, SCA, Secrets, K8s, DAST) + score cumulé + décision.
6. **Rapport exécutif** — ouvrir `pipeline/out/report-*.txt` (déterministe + section LLM Groq) d'un run archivé dans `~/devsecops-runs/`.
7. **ZAP DAST** — ouvrir `pipeline/out/zap-report.html` dans le navigateur → montrer 0 FAIL / 58 PASS / 3 WARN.
8. **Docs/ADR** — README, ROADMAP, ADR-0001, ADR-0002, V2-HMAC-SETUP.

### Checklist des captures d'écran (pour le rapport)

1. `kubectl get pods -A` (3 colonnes : kube-system, devsecops, argocd — tout Running) ✅
2. `curl /health` + réponse `{"status":"ok"}` (terminal) ✅
3. Argo CD : écran de login / page Applications (`devsecops-mean` Healthy) ✅
4. Jenkins : build `devsecops-v0` rouge (BLOCK 217) avec la "PORTE DE DÉCISION" dans la console ✅
5. Jenkins : build `devsecops-v0-pass` vert (PASS 0/0) ✅
6. Dashboard : vue générale avec cards de catégories ✅
7. Rapport exécutif : `report.txt` (section IA Groq visible) ✅
8. ZAP : `zap-report.html` (résumé 0 FAIL / 58 PASS / 3 WARN) ✅
9. `git log --oneline` (les derniers commits V0→V3) ✅

---

## Architecture Decision Records

- [ADR-0001](docs/ADR/ADR-0001-threshold-v0.md) : Seuil de décision V0 + limitation Gitleaks `--no-git`
- [ADR-0002](docs/ADR/ADR-0002-score-aggregation.md) : Agrégation score Phase 1 (V0-V2) + Phase 2 (V3)

---

## Git history (derniers commits)

```
5c0f93b docs: V3 démontré (k3d + Argo CD + ZAP DAST), E2E final v0 BLOCK 217 / v0-pass PASS 0, limites réseau documentées
14935b0 fix: trivy --skip-db-update in Jenkinsfile to avoid hanging on DB download
4fc5e2a docs: Phase1/Phase2 score separation + ADR-0002 + update V2 status
dac2034 feat: V2 hardening — credentials, Phase1/Phase2 separation, noise-filter tests, HMAC proof, Slack notification
5ee251b feat(app): add root route with API info
4122c26 fix(pipeline): skip K8s audit and composition when SCAN_ROOT != app
fc9971a fix(score): stabilize score by excluding docs/, app/inject/, pipeline/runs/
d8eeeaf fix(K8s): liveness/readiness probe path / → /health
c3a8183 docs: update README with k3d status + Argo CD blocker
010c4b7 docs: comprehensive README with full project summary
11fd635 docs: V3 TERMINÉ — all 7 steps complete
15e861a feat(V3.7): rollback strategy
d3581cd feat(V3.6): extended dashboard with Phase 2 categories
7b231ed feat(V3.5): combined scoring Phase 1+2
66c3289 feat(V3.4): composition analysis
2e97b63 feat(V3.3): DAST via OWASP ZAP
f8fc1e4 feat(V3.2): K8s config audit with kube-score
33f7657 feat(V3.1): K8s manifests + Argo CD config
ca51bf3 docs: V2 TERMINÉ — all 6 steps complete
```

---

## Auteurs

Projet de stage : **Pipeline DevSecOps avec moteur de décision IA**
