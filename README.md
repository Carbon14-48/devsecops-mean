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

> **Périmètre V0 = un seul outil : SemGrep** (consigne de la roadmap). VULN-003 est
> documentée et sa CVE vérifiée manuellement via `npm audit` (hors pipeline) — elle
> n'est **pas** branchée au scoring V0. Sa détection automatisée arrive en V1 avec
> Trivy (SCA), au même titre que les secrets (Gitleaks).

## Reproduire le V0 localement

```bash
# 1. Dépendances de l'app (inclus lodash vulnérable)
cd app/server && npm install

# 2. SemGrep (dans un venv)
cd pipeline && python3 -m venv .venv && .venv/bin/pip install semgrep

# 3. Test de bout en bout (scan → pivot → score → décision)
pipeline/scripts/v0-local.sh
```

Attendu : **BLOCK** (score 18/10) + log expliquant pourquoi.

## Principe d'architecture

Le « moteur de décision IA » est un **moteur de règles déterministe** (poids sévérité × catégorie, seuil configurable, dédup, filtrage du bruit). Un LLM ne bloque **jamais** un build ; l'IA générative arrive en V2 pour le rapport exécutif, au-dessus du moteur déterministe.

Plus de détails : [docs/ROADMAP.md](docs/ROADMAP.md)
