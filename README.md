# DevSecOps MEAN Pipeline

Pipeline DevSecOps complet avec **moteur de décision IA** sur une application **MEAN** (MongoDB, Express, Angular, Node.js) volontairement vulnérable.

**V0 → V3 terminé.** Score stable : **217/10** (BLOCK, seuil 10).

---

## Résumé des versions

| Version | Objectif | Outils | Score | Statut |
|---------|----------|--------|-------|--------|
| **V0** | Chaîne minimale (1 module, 1 outil) | SemGrep | 18/10 | ✅ TERMINÉ |
| **V1** | 3 outils en parallèle + scoring | SemGrep + Trivy + Gitleaks | 88/10 | ✅ TERMINÉ |
| **V2** | Dashboard, rapport IA, webhooks, archival | + Express API + report + notify + HMAC | 88/10 | ✅ TERMINÉ |
| **V3** | K8s + DAST + composition + rollback | + kube-score + ZAP + composition | 217/10 | ✅ TERMINÉ |

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
│  2. Provision outils (SemGrep, Gitleaks)                         │
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
│   ├── ai/
│   │   ├── report.js           Rapport exécutif déterministe (231 lignes)
│   │   └── composition.js      Analyse d'architecture / surface d'attaque
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
| VULN-K8s-CONFIG | 15 findings kube-score | `k8s/base/*.yaml` | kube-score | 7 pts |
| VULN-COMP | 6 findings composition | `app/server/src/config.js` | composition.js | 20 pts |

---

## Outils de scan

| Outil | Catégorie | Version | Binaire | Description |
|-------|-----------|---------|---------|-------------|
| **SemGrep** | SAST | 1.172.0 | `~/devsecops-tools/semgrep-venv/bin/semgrep` | Analyse statique avec règles custom |
| **Trivy** | SCA | 0.73.0 | `/usr/bin/trivy` | Scan des dépendances (CVEs) |
| **Gitleaks** | Secrets | 8.30.1 | `~/devsecops-tools/gitleaks` | Détection de secrets exposés |
| **kube-score** | K8s | 1.19.0 | `~/devsecops-tools/kube-score` | Audit de configuration Kubernetes |
| **OWASP ZAP** | DAST | (Docker) | `ghcr.io/zaproxy/zaproxy` | Analyse dynamique (script prêt) |
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

### Score de référence (stable)

| Composant | Findings | Score |
|-----------|----------|-------|
| SemGrep (SAST) | 3 | 14 pts |
| Trivy (SCA) | 4 | 28 pts |
| Gitleaks (Secrets) | 2 | 28 pts |
| kube-score (K8s) | 15 | 7 pts |
| Composition | 6 | 20 pts |
| **Total** | **30** | **217 pts** |

**Historique du score** (avant fix du drift) :
- V0 : 18 → V1 : 88 → V3 : 231 → **Fix drift : 217 (stable)**

---

## Pipeline Jenkins — Détail des stages

```
Stage 1: HMAC verification
  └── Vérifie le secret webhook GitHub ($HOME/.jenkins/secrets/webhook-hmac-secret)

Stage 2: Provision outils
  ├── SemGrep: pip install dans venv
  └── Gitleaks: curl + tar (si absent)

Stage 3: Scans parallèles (3 × retry avec fallback vide)
  ├── 3a. Scan SAST (SemGrep)
  │   └── semgrep --config auto --sarif → semgrep.sarif
  ├── 3b. Scan SCA (Trivy)
  │   └── trivy fs --format json --scanners vuln → trivy.json
  └── 3c. Scan Secrets (Gitleaks)
      └── gitleaks detect --config .gitleaks.toml --no-git → gitleaks.json

Stage 4: Normalisation + Merge
  ├── Chaque outil → format pivot (JSON normalisé)
  ├── kube-score score k8s/base/*.yaml → pivot-kube-score.json
  ├── composition.js → pivot-composition.json
  └── merge → pivot.json (tous les findings fusionnés)

Stage 5: Scoring + porte de décision
  └── engine.js: pivot.json → decision.json (BLOCK/PASS + score)

Stage 6: Rapport exécutif
  └── report.js: pivot.json + decision.json → report.txt (langage naturel)

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

### Docker

- `mean-app:local` : Image app (build via `Dockerfile.local`)
- `mongo:7` : Image MongoDB officielle

### k3d

Cluster `devsecops` (supprimé — Docker DNS intermittent sur `registry-1.docker.io`).

Pour recréer :
```bash
~/devsecops-tools/k3d cluster create devsecops --agents 1
# + importer images via ctr
```

---

## Services fonctionnels

| Service | URL | Status |
|---------|-----|--------|
| **Jenkins** | http://localhost:8080 | ✅ admin/admin |
| **Dashboard** | http://localhost:3200 | ✅ PM2 daemon |
| **App** | http://localhost:3000 | ✅ Docker (mean-app + mongo-dev) |
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
trivy fs --format json --scanners vuln app/server/ > /tmp/trivy.json
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
- Credentials : `github-webhook-secret` (GLOBAL, plaintext)
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

---

## Ce qui reste à faire

### Bloqué

- [ ] **Argo CD** — Docker Hub injoignable depuis cette machine (DNS intermittent `registry-1.docker.io`)
- [ ] **K8s cluster** — k3d supprimé (CoreDNS ImagePullBackOff), à recréer après fix Docker DNS
- [ ] **ZAP DAST** — image Docker non tirée (même problème DNS)

### Pour corriger Docker DNS

```bash
echo '{"dns":["8.8.8.8","8.8.4.4"]}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

### Optionnel

- [ ] Angular dashboard (remplacer vanilla JS)
- [ ] MongoDB persistant (PVC au lieu de emptyDir)
- [ ] NetworkPolicies pour isoler les pods
- [ ] PodDisruptionBudget pour la haute disponibilité
- [ ] TLS/Ingress avec cert-manager
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Log aggregation (EFK stack)
- [ ] Slack webhook en dur dans notify.sh (remplacer par env var)

---

## Architecture Decision Records

- [ADR-0001](docs/ADR/ADR-0001-threshold-v0.md) : Seuil de décision V0 + limitation Gitleaks `--no-git`

---

## Git history (derniers commits)

```
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
