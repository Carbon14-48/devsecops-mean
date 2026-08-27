# DevSecOps MEAN Pipeline

Pipeline DevSecOps avec **moteur de décision** sur une application **MEAN** (MongoDB, Express, Angular, Node.js) volontairement vulnérable.

**V0 → V3 terminé.** Score : 18/10 (V0) → 88/10 (V1) → 231/10 (V3).

---

## Résumé des versions

| Version | Objectif | Outils | Score | Statut |
|---------|----------|--------|-------|--------|
| **V0** | Chaîne minimale (1 module, 1 outil) | SemGrep | 18/10 | ✅ TERMINÉ |
| **V1** | 4 outils en parallèle | SemGrep + Trivy + Gitleaks | 88/10 | ✅ TERMINÉ |
| **V2** | Dashboard, rapport IA, sécurité | + Express API + rapport + notifications | 88/10 | ✅ TERMINÉ |
| **V3** | Phase 2 : K8s + DAST + composition | + kube-score + ZAP + composition | 231/10 | ✅ TERMINÉ |

---

## Structure du monorepo

```
devsecops-mean/
├── app/                    ★ Application MEAN cible (volontairement vulnérable)
│   ├── server/             Express + Mongoose (CRUD livres, recherche, login)
│   ├── client/             Angular (squelette)
│   └── inject/             Vulnérabilités injectées & documentées
├── pipeline/               ★ Chaîne de sécurité (100% Node.js)
│   ├── rules/              semgrep.yml (règles custom)
│   ├── normalize/          SARIF / JSON bruts → format pivot
│   │   ├── semgrep.js      Normaliseur SemGrep
│   │   ├── trivy.js        Normaliseur Trivy
│   │   ├── gitleaks.js     Normaliseur Gitleaks
│   │   ├── kube-score.js   Normaliseur kube-score
│   │   ├── zap.js          Normaliseur OWASP ZAP
│   │   ├── composition.js  Analyse de composition
│   │   ├── merge.js        Fusionne N pivots
│   │   └── index.js        Dispatcher CLI
│   ├── score/              Moteur de décision (poids, seuil, log)
│   │   ├── src/engine.js   Logique de scoring
│   │   └── config/weights.json  Pondérations
│   ├── ai/
│   │   ├── report.js       Rapport exécutif déterministe
│   │   └── composition.js  Analyse d'architecture
│   ├── scripts/
│   │   ├── v0-local.sh     Test E2E V0
│   │   ├── v1-local.sh     Test E2E V1
│   │   ├── save-run.sh     Archivage des runs
│   │   ├── notify.sh       Notifications (Slack/email/log)
│   │   ├── rollback.sh     Auto-rollback K8s
│   │   └── zap-scan.sh     Scan DAST OWASP ZAP
│   └── Jenkinsfile         Pipeline Jenkins complète
├── dashboard/              Dashboard web (V2)
│   ├── api/server.js       Express API (port 3200)
│   ├── web/index.html      SPA vanilla JS
│   └── start.sh            Script de démarrage
├── k8s/                    Manifests Kubernetes (V3)
│   ├── base/               Manifests de base (namespace, deployments, services)
│   ├── overlays/dev/       Overlay développement (1 replica)
│   ├── overlays/prod/      Overlay production (3 replicas)
│   └── argocd-app.yaml     Configuration Argo CD
├── infra/                  Jenkins jobs XML
├── docs/                   Roadmap + ADR + documentation
│   ├── ROADMAP.md          Roadmap V0→V3
│   ├── ADR/                Architecture Decision Records
│   ├── V2-HMAC-SETUP.md    Documentation HMAC
│   └── DEMO-V0.md          Guide de démonstration V0
└── test/fixtures/          Fixtures pour tests
    └── clean-app/          Module sain (test PASS)
```

---

## Vulnérabilités injectées

| ID | Vulnérabilité | Fichier | Détection |
|----|---------------|---------|-----------|
| VULN-001 | Injection NoSQL (`$where`, `findOne`) | `app/server/src/routes/search.js`, `auth.js` | SemGrep |
| VULN-002 | Secret AWS en dur | `app/server/src/config.js` | SemGrep + Gitleaks |
| VULN-003 | `lodash@4.17.15` avec CVE | `app/server/package.json` | Trivy SCA |

---

## Outils de scan

| Outil | Catégorie | Phase | Description |
|-------|-----------|-------|-------------|
| **SemGrep** | SAST | V0 | Analyse statique avec règles custom |
| **Trivy** | SCA | V1 | Scan des dépendances (CVEs) |
| **Gitleaks** | Secrets | V1 | Détection de secrets exposés |
| **kube-score** | K8s | V3 | Audit de configuration Kubernetes |
| **OWASP ZAP** | DAST | V3 | Analyse dynamique (script prêt) |
| **Composition** | Architecture | V3 | Analyse de la surface d'attaque |

---

## Scoring

Le moteur de scoring est **déterministe et explicable** :

```
Score = Σ (sévérité × catégorie)
```

**Pondérations** (`pipeline/score/config/weights.json`) :

| Sévérité | Poids | Catégorie | Poids |
|----------|-------|-----------|-------|
| Critical | 10 | SAST | 1.0 |
| High | 7 | SCA | 1.0 |
| Medium | 4 | Secrets | 2.0 |
| Low | 1 | Container | 1.2 |
| Info | 0.5 | K8s | 1.0 |
| | | DAST | 1.5 |

**Seuil de blocage** : 10 (configurable)

**Évolution du score** :
- V0 : 18/10 (SemGrep seul : 3 findings)
- V1 : 88/10 (+ Trivy 4 + Gitleaks 4 = 11 findings)
- V3 : 231/10 (+ kube-score 15 + composition 6 = 31 findings)

---

## Reproduire localement

### V0 — Test minimal

```bash
cd app/server && npm install
cd ../../pipeline && python3 -m venv .venv && .venv/bin/pip install semgrep
cd .. && pipeline/scripts/v0-local.sh
```

Attendu : **7/7 OK** — BLOCK (18/10) + PASS (0/10)

### V1 — 3 outils

```bash
# Installer Gitleaks
curl -sSL -o /tmp/gitleaks.tar.gz https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz && tar xzf /tmp/gitleaks.tar.gz -C /tmp && sudo mv /tmp/gitleaks /usr/local/bin/

# Test E2E
pipeline/scripts/v1-local.sh
```

Attendu : **12/12 OK** — BLOCK (88/10) + PASS (0/10)

### V2 — Dashboard

```bash
cd dashboard/api && npm install && node server.js
# Ouvrir http://localhost:3200
```

### V3 — K8s audit

```bash
# Installer kube-score
curl -sSL -o /tmp/kube-score.tar.gz https://github.com/zegl/kube-score/releases/download/v1.19.0/kube-score_1.19.0_linux_amd64.tar.gz && tar xzf /tmp/kube-score.tar.gz -C /tmp && sudo mv /tmp/kube-score /usr/local/bin/

# Audit des manifests
kube-score score k8s/base/*.yaml
```

---

## Jenkins

**URL** : `http://localhost:8080` (admin/admin)

**Jobs** :
- `devsecops-v0` : pipeline BLOCK (app vulnérable, SCAN_ROOT=app)
- `devsecops-v0-pass` : pipeline PASS (module sain, SCAN_ROOT=test/fixtures/clean-app)

**Déclencheur** : push GitHub via smee (`https://smee.io/Idi3niApFloU03v`)

**Pipeline Jenkinsfile** :
1. HMAC verification
2. Provision outils (SemGrep, Gitleaks)
3. Scans parallèles (SemGrep, Trivy, Gitleaks) — resilience retry 3×
4. Normalisation + Merge (+ kube-score + composition)
5. Scoring + porte de décision
6. Rapport exécutif
7. Post : archival + run save + notifications + rollback check

---

## Dashboard

**API** : `http://localhost:3200`

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Dernier run (décision, score, findings) |
| `GET /api/runs` | Historique des runs |
| `GET /api/runs/:id` | Détail d'un run |
| `GET /api/findings` | Findings du dernier run |
| `GET /api/weights` | Pondérations actives |
| `GET /api/health` | Santé de l'API |

**Frontend** : SPA vanilla JS avec cartes de catégorie (SAST, SCA, Secrets, K8s, DAST, Container)

---

## K8s Manifests

```
k8s/
├── base/
│   ├── namespace.yaml          Namespace devsecops
│   ├── mongodb-deployment.yaml MongoDB (Secret, probes, resources)
│   ├── mongodb-service.yaml    Service ClusterIP
│   ├── app-deployment.yaml     App Node.js (2 replicas, probes, secrets)
│   ├── app-service.yaml        Service + Ingress
│   └── kustomization.yaml      Kustomize base
├── overlays/
│   ├── dev/kustomization.yaml  1 replica
│   └── prod/kustomization.yaml 3 replicas
└── argocd-app.yaml             Argo CD Application
```

---

## Ce qui reste à faire

### Immédiat
- [ ] **Configurer les notifications** (Slack webhook, email)
- [x] ~~**Installer un cluster K8s** (k3d)~~ ✅ k3d cluster `devsecops` running
- [ ] **Installer Argo CD** — bloqué : Docker Hub injoignable depuis cette machine
- [ ] **Déployer l'app** via Argo CD quand réseau disponible
- [ ] **Exécuter ZAP DAST** contre l'app déployée

### Optionnel
- [ ] Angular dashboard (remplacer vanilla JS)
- [ ] MongoDB persistant (PVC au lieu de emptyDir)
- [ ] NetworkPolicies pour isoler les pods
- [ ] PodDisruptionBudget pour la haute disponibilité
- [ ] Image pull secrets pour registry privé
- [ ] TLS/Ingress avec cert-manager
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Log aggregation (EFK stack)

---

## Architecture Decision Records

- [ADR-0001](docs/ADR/ADR-0001-threshold-v0.md) : Seuil de décision V0 + limitation Gitleaks `--no-git`

---

## Auteurs

Projet de stage : **Pipeline DevSecOps avec moteur de décision IA**
