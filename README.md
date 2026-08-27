# DevSecOps MEAN Pipeline

Pipeline DevSecOps avec **moteur de décision** sur une application **MEAN** (MongoDB, Express, Angular, Node.js) volontairement vulnérable.

V0 validé localement : **scan SemGrep → normalisation pivot → scoring → porte de décision** (BLOCK/PASS avec log explicatif).

## Structure du monorepo

```
devsecops-mean/
├── app/                    ★ Application MEAN cible (volontairement vulnérable)
│   ├── server/             Express + Mongoose (CRUD livres, recherche, login)
│   ├── client/             Angular (V0 : squelette, à venir)
│   └── inject/             Vulnérabilités injectées & documentées
├── pipeline/               ★ Chaîne de sécurité (100% Node.js, cohérent MEAN)
│   ├── rules/              semgrep.yml (règles custom ciblant les vulns)
│   ├── normalize/          SARIF / formats bruts → format pivot
│   ├── score/              Moteur de décision : poids, seuil, log explicatif
│   ├── shared/             Schéma JSON du format pivot
│   └── scripts/            v0-local.sh (test E2E local)
├── dashboard/              (V2) Vue Angular + API Express sur la pipeline DB
├── k8s/                    (V3) Manifests + Argo CD
├── infra/                  (V2) docker-compose (jenkins, mongo)
└── docs/                   Roadmap + décisions d'architecture (ADR)
```

## Vulnérabilités injectées (V0)

| ID | Vulnérabilité | Fichier | Détection |
|----|---------------|---------|-----------|
| VULN-001 | Injection NoSQL (`$where`, `findOne`) | `app/server/src/routes/search.js`, `auth.js` | SemGrep |
| VULN-002 | Secret AWS en dur | `app/server/src/config.js` | SemGrep (Gitleaks en V1) |
| VULN-003 | `lodash@4.17.15` avec CVE | `app/server/package.json` | vérifiée manuellement (npm audit), **détection automatisée en V1 (Trivy)** |

> **Périmètre V0** : un seul outil (SemGrep). **V1** : 3 outils (SemGrep + Trivy + Gitleaks)
> → pivot unifié → score agrégé. VULN-003 et VULN-002 sont maintenant détectées automatiquement.

## Reproduire le V0 localement

```bash
# 1. Dépendances de l'app (inclus lodash vulnérable)
cd app/server && npm install

# 2. SemGrep (dans un venv)
cd pipeline && python3 -m venv .venv && .venv/bin/pip install semgrep

# 3. Test de bout en bout (scan → pivot → score → décision)
pipeline/scripts/v0-local.sh
```

Attendu : **7/7 OK** — app vulnérable → **BLOCK** (score 18/10), module sain
(`test/fixtures/clean-app`) → **PASS** (score 0/10) : le moteur discrimine.

En Jenkins, un seul push déclenche les deux jobs (webhook smee) :
`devsecops-v0` (rouge/BLOCK) et `devsecops-v0-pass` (vert/PASS) — voir [docs/SETUP-JENKINS.md](docs/SETUP-JENKINS.md).

## Reproduire le V1 localement

```bash
# 1. Installer Gitleaks (si pas déjà fait)
curl -sSL -o /tmp/gitleaks.tar.gz https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz && tar xzf /tmp/gitleaks.tar.gz -C /tmp && sudo mv /tmp/gitleaks /usr/local/bin/

# 2. Test E2E avec les 3 outils
pipeline/scripts/v1-local.sh
```

Attendu : **12/12 OK** — SemGrep (3) + Trivy (4) + Gitleaks (4) = 11 findings
→ pivot unifié → score **102/10** → **BLOCK**. Le scoring agrège les 3 catégories
(SAST, SCA, secrets) avec les poids documentés dans `pipeline/score/config/weights.json`.

## Principe d'architecture

Le « moteur de décision IA » est un **moteur de règles déterministe** (poids sévérité × catégorie, seuil configurable, dédup, filtrage du bruit). Un LLM ne bloque **jamais** un build ; l'IA générative arrive en V2 pour le rapport exécutif, au-dessus du moteur déterministe.

Plus de détails : [docs/ROADMAP.md](docs/ROADMAP.md)
