# ADR-0001 — Seuil de blocage arbitraire en V0, recalibré en V1

- **Statut** : Accepté
- **Date** : 2026-08-05
- **Décideurs** : stagiaire + encadrante

## Contexte

En V0, on ne dispose d'aucun historique de runs pour calibrer un seuil. La tutrice
demande explicitement un « seuil fixe même arbitraire » pour démontrer la chaîne.

## Décision

- Poids de sévérité : `critical=10, high=7, medium=4, low=1, info=0.5`
- Poids de catégorie : `sast=1.0, sca=1.0, secrets=2.0, container=1.2, k8s=1.0, dast=1.5`
- Seuil de blocage : **10 points** → tout run cumulant ≥ 10 points est BLOCK.
- Les 3 vulns V0 totalisent 18 points → BLOCK attendu.

## Sémantique du score (cumul non plafonné)

Le score est une **somme pondérée cumulée, sans plafond** : chaque finding ajoute
`poids(sévérité) × poids(catégorie)`, tous les findings s'additionnent. Le
`blockThreshold` est une **ligne de décision** (pass/fail), **pas un maximum**
d'échelle. C'est pourquoi un run peut afficher `score 18 / seuil 10` — c'est voulu,
pas un bug de normalisation.

Ce choix a deux justifications :

1. **Information de cumul** : deux findings HIGH (14 pts) pèsent plus qu'un seul (7).
   Un score plafonné à l'échelle perdrait la notion d'accumulation.
2. **Recalibrage V1** : avec l'historique des runs stocké en MongoDB, on pourra
   observer la distribution des scores cumulés et positionner le seuil sur les
   données (ex : percentile) — plus facile avec un score non plafonné.

Alternatives écartées en V0 : plafonner à `max(sévérité)` (perte du cumul) ou
normaliser en 0-100 (surcharge de logique inutile pour un seuil fixe arbitraire).
À réévaluer en V1 après collecte d'historique.

## Conséquences

- 2 findings HIGH (7×1) + 1 MEDIUM (4×1) = 18 ≥ 10 → le blocage est démontré.
- Le seuil et les poids sont **configurables** (`pipeline/score/config/weights.json`,
  `thresholds.json`) — aucune valeur n'est codée en dur.

## Recalibrage en V1

- Collecter l'historique des runs (stockage MongoDB prévu en V1) : distribution des
  scores, taux de faux positifs par règle.
- Ajuster le seuil pour minimiser les faux BLOCK (builds sains) sans laisser passer
  de vulns de sévérité haute.
- Filtrage du bruit : `weights.noise.minConfidence` + `ignoredRules`.

## Pivot multi-source (V1)

**Question** : la structure pivot tient-elle si on ajoute un 2e outil au format totalement différent ?

**Réponse** : Oui. Le pivot est un format interne agnostique. Chaque outil a un normalisateur dédié :
- `normalize/src/semgrep.js` : SARIF → pivot (`category: "sast"`)
- `normalize/src/trivy.js` : JSON Trivy → pivot (`category: "sca"`)
- `normalize/src/gitleaks.js` : JSON Gitleaks → pivot (`category: "secrets"`)
- `normalize/src/merge.js` : fusionne N pivots en un seul

Les champs clés (`tool`, `category`, `severity`, `ruleId`, `file`, `line`, `message`)
sont communs à tous les formats. Le scoring traite n'importe quel finding tant qu'il
a un `category` et un `severity` dans les poids.

**Score V1** : 11 findings (3 SemGrep + 4 Trivy + 4 Gitleaks) → score cumulé 88/10 → BLOCK.
Les poids `secrets: 2.0` donnent plus de poids aux findings de Gitleaks, ce qui est cohérent
(les secrets en dur sont plus critiques qu'un CVE sur une dépendance).

## Limitation connue : Gitleaks `--no-git` (V1)

**Contexte** : pour permettre un test PASS déterministe sur un module isolé du monorepo,
Gitleaks est lancé avec `--no-git` (scan du working tree uniquement, pas de l'historique git).

**Impact** : un secret commité puis supprimé du code mais présent dans un ancien commit
ne serait pas détecté par le pipeline V1. En production, Gitleaks scanne par défaut
l'historique git complet (`fetch-depth: 0` chez Orbitask) — c'est le vrai risque.

**Justification** : le monorepo contient à la fois le code sain (`test/fixtures/clean-app`)
et le code vulnérable (`app/`). Sans `--no-git`, Gitleaks trouve toujours les secrets
du reste du repo, même sur le fixture sain → le test PASS ne passe jamais → le gate
ne discrimine plus rien.

**Decision** : compromis acceptable pour V1 (module isolé, démo fonctionnelle). Réévaluation
en V2 lorsque le code sera séparé en modules indépendants, ou ajout d'un flag `--git`
conditionnel (production vs test).

## Score V0 → V1 : évolution

| Version | Outils | Score | Seuil | Décision |
|---------|--------|-------|-------|----------|
| V0 | SemGrep (1) | 18/10 | 10 | BLOCK |
| V1 | SemGrep + Trivy + Gitleaks (3) | 88/10 | 10 | BLOCK |

L'évolution de 18 à 88 est attendue : 3 outils supplémentaires = plus de findings = score
plus élevé. Le seuil 10 reste pertinent (score propre = 0, score vulnérable = 88).
Recalibrage possible en V2 avec l'historique des runs MongoDB.

## Alternatives écartées

- **IA générative comme décideur** : risque d'hallucination → le gate reste déterministe.
  L'IA n'intervient qu'en V2 (rapport exécutif), en couche consultative.
- **Pas de seuil (human review)** : incompatible avec l'objectif V0 « porte de décision automatique ».
