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

## V1 — Phase 1 complète (les 4 outils)

**Objectif** : étendre V0 aux 4 outils en parallèle, sur un module réel, pivot + scoring capables d'absorber des sources hétérogènes.

1. Trivy/Snyk (SCA) + Gitleaks (secrets) en parallèle de SemGrep.
2. Scan Trivy de l'image container après build.
3. Étendre le format pivot aux 4 sources (`normalize/src/trivy.js`, `gitleaks.js`).
4. Pondération par catégorie d'outil (SAST/SCA/secrets/image) documentée.
5. Mécanisme basique de filtrage du bruit (déjà amorcé : `weights.noise`).
6. Logs d'audit minimaux.

**Critère de passage** : les 4 outils sur le même repo → pivot unifié → score cohérent, sans doublon.

**Questions**
- Baseline / seuil : calibrer le seuil sur l'historique des runs V0 stockés en Mongo.
- Filtrage du bruit : ignorer les règles connues → taux de faux positifs mesuré.

---

## V2 — Dashboard, rapport IA & sécurisation

**Objectif** : pipeline présentable et robuste.

1. Dashboard minimal (statut par module, historique des runs) — Angular + Express sur la pipeline DB (MongoDB).
2. Rapport exécutif IA à partir des résultats normalisés (`pipeline/ai/report.js`).
3. Vérification HMAC sur le webhook GitHub.
4. Centralisation des secrets dans Jenkins Credentials.
5. Notifications email/Slack en cas de blocage.
6. Stratégie de résilience timeout/plantage d'un job de scan.

**Critère de passage** : un run affiché dans le dashboard, un rapport IA généré, un webhook HMAC validé.

**Questions**
- Prompt exact du rapport IA ? → Contraint : « n'ajoute AUCUN finding absent du JSON », citation des IDs pivot, le gate reste déterministe.
- Résilience : retry avec backoff, badge d'un scanner en échec, code exit ≠ 0 → run « dégradé » mais pas de faux BLOCK.

---

## V3 — Phase 2 : composition & déploiement

**Objectif** : étendre au-delà du module isolé.

1. Argo CD + repo de manifests K8s sur un cluster de test.
2. Contrôle de configuration K8s (kube-score / kube-linter).
3. DAST via OWASP ZAP sur l'application réellement déployée.
4. Analyse de composition (interactions entre modules, surface d'attaque globale).
5. Moteur de scoring combinant Phase 1 + Phase 2 (score global).
6. Dashboard étendu (vue consolidée, cartes de score) + validation finale post-déploiement.
7. Stratégie de rollback si problème critique après déploiement.

**Critère de passage** : déploiement via Argo CD, DAST + score Phase 2 intégrés au score global.

**Questions**
- DAST critique après sync Argo CD : rollback auto ou manuel ? → Décision à trancher en ADR (recommandé : auto pour « critical » en preprod, manuel en prod).
- Agrégation Phase 1 + Phase 2 : somme, pondération différente, ou remplacement ? → À trancher.

---

## Principe directeur (appliqué dès V0)

Le **moteur de décision** est déterministe et explicable (il peut bloquer un build).
L'**IA générative** est consultative (rapport exécutif en V2, suggestions en V3) et ne décide jamais à la place du gate.
