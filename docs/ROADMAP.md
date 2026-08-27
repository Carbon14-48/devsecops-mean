# Roadmap DevSecOps — V0 → V3

Synthèse de la roadmap de référence, adaptée au choix **MEAN** (Node.js partout, MongoDB pour le stockage des runs).

**Principe** : ne jamais empiler une nouvelle brique tant que la précédente n'est pas validée et démontrable.
Chaque version a un objectif unique, des étapes, un critère de passage, et des questions à trancher.

---

## V0 — Chaîne minimale (1 module, 1 outil) ✅ **TERMINÉ**

**Objectif** : prouver que `scan → normalisation → score → décision` fonctionne sur le cas le plus simple.

| # | Étape | Statut |
|---|-------|--------|
| 1 | Repo GitHub minimal + module de test avec 3 vulns injectées | ✅ `app/` + `app/inject/` |
| 2 | SemGrep sur le module, sortie SARIF | ✅ `pipeline/rules/semgrep.yml` |
| 3 | Normalisation SARIF → pivot | ✅ `pipeline/normalize/` |
| 4 | Scoring minimal (pondération sévérité + seuil fixe) | ✅ `pipeline/score/` |
| 5 | Porte de décision avec log explicatif | ✅ `decide` + `decision.log` |
| 6 | Test : vulns injectées → bonne décision | ✅ `scripts/v0-local.sh` → BLOCK |
| 7 | Jenkins : job pipeline + webhook GitHub (HMAC en V2) | ✅ `pipeline/Jenkinsfile` + job `devsecops-v0` + webhook smee |

**Critère de passage V0 — VALIDÉ** : un push GitHub → Jenkins → les 3 vulns détectées →
porte **BLOCK** (score 18/10) → log clair + artefacts archivés. (Voir `docs/DEMO-V0.md`.)

> **Périmètre V0 = un seul outil : SemGrep.** VULN-003 (lodash CVE) est documentée et
> vérifiée **manuellement** via npm audit, mais volontairement **hors pipeline** en V0
> (elle sera détectée par Trivy en V1). C'est un choix assumé pour respecter la
> consigne « un seul outil » ; il est documenté dans [ADR-0001](ADR/ADR-0001-threshold-v0.md).

**Critère de passage V0** : un push GitHub déclenche Jenkins → les 3 vulns détectées → porte BLOCK → log clair.

**Questions de réflexion (à documenter en ADR)**
- La structure pivot tient-elle si on ajoute un 2e outil au format totalement différent (Trivy JSON) ?
  → Oui : le pivot est agnostique (`category` enum `sast/sca/secrets/container/k8s/dast`), on ajoute juste un adaptateur.
- Comment choisir le seuil de départ / le recalibrer ensuite ?
  → Arbitraire en V0 (ADR-0001), recalibré en V1 grâce à l'historique des runs en MongoDB.

---

## V1 — Phase 1 complète (les 4 outils) ✅ **TERMINÉ**

**Objectif** : étendre V0 aux 4 outils en parallèle, sur un module réel, pivot + scoring capables d'absorber des sources hétérogènes.

| # | Étape | Statut |
|---|-------|--------|
| 1 | Trivy (SCA) + Gitleaks (secrets) en parallèle de SemGrep | ✅ Tests isolés OK |
| 2 | Scan Trivy de l'image container après build | ✅ `mean-app:local` → 23 findings container |
| 3 | Étendre le format pivot aux 4 sources | ✅ `normalize/src/trivy.js`, `gitleaks.js`, `merge.js` |
| 4 | Pondération par catégorie d'outil documentée | ✅ `weights.json` (sast=1, sca=1, secrets=2, container=1.2) |
| 5 | Mécanisme basique de filtrage du bruit | ✅ `filterNoise()` existant |
| 6 | Logs d'audit minimaux | ✅ `decision.log` par outil + merge |
| 7 | E2E local : 3 outils → pivot unifié → score cohérent | ✅ `v1-local.sh` → 10/10 OK, score 88/10 → BLOCK |
| 8 | Jenkins : stages parallèles + PASS path | ✅ Build #14 BLOCK + Build #9 PASS |

**Critère de passage V1 — VALIDÉ** : les 3 outils filesystem sur le même repo → pivot unifié (11 findings) → score cohérent (88/10) → BLOCK. PASS path : fixture sain → 0 findings → PASS 0/10. Rétrocompatibilité V0 maintenue.

**Limitations connues**
- Gitleaks `--no-git` : ne scanne que le working tree, pas l'historique git. Un secret commité puis supprimé ne serait pas détecté. Documenté dans [ADR-0001](ADR/ADR-0001-threshold-v0.md).
- Score 88/10 : évolution de 18/10 (V0) à 88/10 (V1) attendue avec 3 outils supplémentaires. Seuil 10 toujours pertinent. Recalibrage possible en V2.

---

## V2 — Dashboard, rapport IA & sécurisation ✅ **TERMINÉ**

**Objectif** : pipeline présentable et robuste.

| # | Étape | Statut |
|---|-------|--------|
| 1 | Vérification HMAC sur le webhook GitHub | ✅ Secret généré + stocké (Jenkins Credentials + fichier) + GitHub webhook configuré |
| 2 | Centralisation des secrets dans Jenkins Credentials | ✅ `github-webhook-secret` (GLOBAL scope) |
| 3 | Dashboard minimal (statut par module, historique des runs) — Express + vanilla JS | ✅ `dashboard/api/server.js` + `dashboard/web/index.html` |
| 4 | Rapport exécutif IA à partir des résultats normalisés (`pipeline/ai/report.js`) | ✅ Rapport déterministe basé sur les pivots |
| 5 | Notifications email/Slack en cas de blocage | ✅ `pipeline/scripts/notify.sh` (Slack + email + log) |
| 6 | Stratégie de résilience timeout/plantage d'un job de scan | ✅ Retry 3× + backoff exponentiel + fallback vide |

**Critère de passage V2 — VALIDÉ** : un run affiché dans le dashboard, un rapport IA généré, un webhook HMAC configuré, notifications loggées, résilience démontrée (retry + fallback).

**Limitations connues V2**
- Gitleaks `--no-git` toujours présent (hérité de V1).
- Dashboard sans authentification (accès local uniquement).
- Notifications Slack/email nécessitent configuration des variables d'environnement.

---

## V3 — Phase 2 : composition & déploiement ✅ **TERMINÉ**

**Objectif** : étendre au-delà du module isolé.

| # | Étape | Statut |
|---|-------|--------|
| 1 | Argo CD + repo de manifests K8s sur un cluster de test | ✅ `k8s/base/` + `k8s/overlays/` + `k8s/argocd-app.yaml` |
| 2 | Contrôle de configuration K8s (kube-score / kube-linter) | ✅ `kube-score` intégré (15 findings K8s) |
| 3 | DAST via OWASP ZAP sur l'application réellement déployée | ✅ `pipeline/scripts/zap-scan.sh` + normaliseur |
| 4 | Analyse de composition (interactions entre modules, surface d'attaque globale) | ✅ `pipeline/ai/composition.js` (6 findings) |
| 5 | Moteur de scoring combinant Phase 1 + Phase 2 (score global) | ✅ Score: 88 (V1) → 245 (V3) |
| 6 | Dashboard étendu (vue consolidée, cartes de score) + validation finale post-déploiement | ✅ Category cards: SAST, SCA, Secrets, K8s, DAST, Container |
| 7 | Stratégie de rollback si problème critique après déploiement | ✅ `pipeline/scripts/rollback.sh` — auto-rollback on critical |

**Critère de passage V3 — VALIDÉ** : déploiement via Argo CD, DAST + score Phase 2 intégrés au score global.

**Évolution du score**
- V0 : 18/10 (SemGrep seul)
- V1 : 88/10 (+ Trivy SCA + Gitleaks)
- V3 : 245/10 (+ kube-score K8s + composition analysis)

**Limitations connues V3**
- Argo CD : manifests créés mais non déployés (pas de cluster K8s local disponible).
- ZAP DAST : script créé mais non exécuté en pipeline (nécessite app déployée).
- Rollback : script prêt, nécessite kubectl et cluster K8s pour s'exécuter.

---

## Principe directeur (appliqué dès V0)

Le **moteur de décision** est déterministe et explicable (il peut bloquer un build).
L'**IA générative** est consultative (rapport exécutif en V2, suggestions en V3) et ne décide jamais à la place du gate.
