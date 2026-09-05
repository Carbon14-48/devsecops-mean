# Briefing IA — Rédaction du rapport de soutenance

> **Usage** : donne ce fichier en entier à un assistant IA (avec, si possible, `README.md`, `docs/ROADMAP.md`, `docs/ADR/*.md`, `docs/SETUP-JENKINS.md`) et demande : *« Rédige un rapport de soutenance de stage complet, structuré selon le plan de la section "Plan demandé", en français, avec toutes les preuves fournies. »*
>
> Tous les faits, nombres et preuves ci-dessous ont été **vérifiés sur l'état réel du projet** (commit `7c34595`).

---

## 1. Présentation du projet

- **Nom** : Pipeline DevSecOps avec moteur de décision IA sur une application MEAN volontairement vulnérable.
- **Repo** : `github.com/Carbon14-48/devsecops-mean` (monorepo : `app/`, `pipeline/`, `dashboard/`, `k8s/`, `infra/`, `docs/`, `test/`).
- **App cible** : **MEAN** (MongoDB, Express, Angular skeleton, Node.js) — API Express port 3000.
  - Endpoints : `/` (info), `/health`, `/api/books` (GET/POST), `/api/search`, `/api/auth`.
  - Vulnérabilités **injectées volontairement** : injection NoSQL (`$where`, `findOne`), secrets en dur (clé AWS `AKIAIOSFODNN7EXAMPLE`, mot de passe `admin123`), dépendance `lodash@4.17.15` avec CVEs.
- **Pipeline** : 100% Node.js, 7 stages Jenkins (voir §6), sorties normalisées en "pivot", scoring déterministe + rapport IA.
- **Objectif du stage** : construire une chaîne DevSecOps complète et *démontrée*, du scan au déploiement K8s avec GitOps (Argo CD) et DAST (OWASP ZAP).

## 2. Versions V0 → V3 (toutes démontrées)

| Version | Objectif | Outils ajoutés | Score | Statut |
|---------|----------|----------------|-------|--------|
| **V0** | Chaîne minimale (1 module, 1 outil) | SemGrep | 18/10 | ✅ TERMINÉ & DÉMONTRÉ |
| **V1** | 3 outils en parallèle + scoring | + Trivy, Gitleaks | 88/10 *(historique)* | ✅ TERMINÉ & DÉMONTRÉ |
| **V2** | Dashboard, rapport IA, webhooks, archival | + Express API, Groq LLM, notify, HMAC, Jenkins Credentials | **74/10 (Phase 1)** | ✅ TERMINÉ & DÉMONTRÉ |
| **V3** | K8s + DAST + composition + rollback | + kube-score, ZAP, composition, Argo CD | **217/10 (dont +143 Phase 2)** | ✅ TERMINÉ & DÉMONTRÉ |

> V0/V1 = scores historiques mesurés avant séparation Phase 1/Phase 2 (ADR-0002). Référence stable actuelle : **Phase 1 (V0-V2) = 74 pts + Phase 2 (V3) = +143 pts = 217 pts**, seuil de blocage = **10**.

## 3. Score de référence — découpage vérifié (run `20260901-165026`)

**Formule** : `Score = Σ (sévérité × poids_catégorie)` — déterministe, pondérations dans `pipeline/score/config/weights.json`.

| Sévérité | Poids | Catégorie | Poids |
|----------|-------|-----------|-------|
| Critical | 10 | SAST | 1.0 |
| High | 7 | SCA | 1.0 |
| Medium | 4 | Secrets | 2.0 |
| Low | 1 | Container | 1.2 |
| Info | 0.5 | K8s | 1.0 |
| – | – | DAST | 1.5 |

**Phase 1 — V0-V2 (cœur) : 9 findings → 74 pts**
| Composant | Findings | Score |
|-----------|----------|-------|
| SemGrep (SAST) | 3 | 18 pts |
| Trivy (SCA) | 4 | 28 pts |
| Gitleaks (Secrets) | 2 | 28 pts |

**Phase 2 — V3 : 21 findings → +143 pts**
| Composant | Findings | Score |
|-----------|----------|-------|
| kube-score (K8s) | 15 | 99 pts |
| Composition | 6 | 44 pts |

**Total : 30 findings → `totalScore: 217` ≥ `blockThreshold: 10` → `decision: BLOCK`.**

> **Vérification contre le JSON réel** (`~/devsecops-runs/20260901-165026/decision.json`) : les clés sont `decision`, `totalScore`, `blockThreshold`, `phase1` (objet : `score: 74`, `findings: 9`), `phase2Contribution: 143`, `top` (classement), `filteredFindings`, `rawFindings`, `weights`. Le champ `score` est `null` — ne pas le confondre avec `totalScore`.
>
> Point bonus défendable : c'est **kube-score** (15 findings, 99 pts) qui pèse le plus en Phase 2, pas la composition (6 findings, 44 pts). Chaque finding = sévérité × catégorie (ex. composition top item = CRITICAL × secrets 2.0 = 20 pts). La séparation Phase 1/Phase 2 répond à la question du tutor : *« Comment la Phase 2 s'agrège à la Phase 1 ? »* (ADR-0002).

## 4. Vulnérabilités injectées / détectées

| ID | Vulnérabilité | Fichier | Détection | Points |
|----|---------------|---------|-----------|--------|
| VULN-001 | Injection NoSQL ($where, findOne) | `app/server/src/routes/search.js`, `auth.js` | SemGrep | 7 |
| VULN-002 | Clé AWS en dur | `app/server/src/config.js:9` | SemGrep + Gitleaks | 14 |
| VULN-002b | Mot de passe en dur (`admin123`) | `app/server/src/config.js:15` | Gitleaks | 14 |
| VULN-003 | `lodash@4.17.15` (5 CVEs) | `app/server/package-lock.json` | Trivy | 28 |
| VULN-K8s | Secret Kubernetes en dur | `k8s/base/app-deployment.yaml:62` | Gitleaks | 14 |
| VULN-K8s-CONFIG | 15 findings kube-score | `k8s/base/*.yaml` | kube-score | 99 |
| VULN-COMP | 6 findings composition | `app/server/src/config.js` | composition.js | 44 |

## 5. Outils & versions (machine)

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
| OWASP ZAP | stable | `ghcr.io/zaproxy/zaproxy` (Docker) |
| Jenkins | 2.568.2 | WAR natif `~/jenkins/jenkins.war`, port 8080 |

## 6. Pipeline Jenkins — structure et preuves

**Fichier** : `pipeline/Jenkinsfile` — charge 3 secrets via **Jenkins Credentials Binding** :
```groovy
environment {
  GROQ_API_KEY      = credentials('groq-api-key')      // rapport IA
  SLACK_WEBHOOK_URL = credentials('slack-webhook-url') // notify.sh
  HMAC_SECRET       = credentials('github-webhook-secret') // HMAC webhook
}
```

**7 stages** :
1. **HMAC verification** — signature HMAC-SHA256, preuve calculée sur payload test ; limitation smee documentée (le relay strip la signature).
2. **Provision outils** — SemGrep (venv pip), Gitleaks (curl+tar) si absents, **noise-filter tests** (`pipeline/score/test/run.sh` → 12 assertions dedup/confidence/ignoredRules).
3. **Scans parallèles** (retry 3×, fallback vide) :
   - SAST : `semgrep --config auto --sarif`
   - SCA : `trivy fs --skip-db-update --format json --severity HIGH,CRITICAL` *(ajouté pour éviter le pendu sur téléchargement de DB — avant ce fix, Trivy échouait silencieusement et la note "PASS 0/0" était FAUSSE)*
   - Secrets : `gitleaks detect --config .gitleaks.toml --no-git`
4. **Normalisation + merge** — chaque outil → format pivot ; `pivot-phase1.json` (Phase 1) puis `pivot.json` (Phase 1 + kube-score + composition).
5. **Scoring + porte de décision** — `decision-phase1.json` (V0-V2) et `decision.json` (total, avec `phase1.score` + `phase2Contribution`). Seuil = 10 → **BLOCK** (rouge) / **PASS** (vert).
6. **Rapport exécutif** — déterministe + **section IA Groq** (modèle OpenAI-compatible via `api.groq.com`), fallback déterministe si pas de clé.
7. **Post** — archivage 14 artifacts dans `~/devsecops-runs/<timestamp>/`, `notify.sh` (Slack), `rollback.sh` (auto-rollback K8s si BLOCK critique).

**2 jobs** :
- `devsecops-v0` — `SCAN_ROOT` par défaut `app` → **BLOCK** (rouge).
- `devsecops-v0-pass` — `SCAN_ROOT` par défaut `test/fixtures/clean-app` → **PASS** (vert).

**E2E final (preuves) :**
- `devsecops-v0` **#36** → `FAILURE` — `Decision: BLOCK | Score: 217 | Findings: 30`, ligne console `PORTE DE DÉCISION : BLOCK — build rouge`, Slack notifié.
- `devsecops-v0-pass` **#27/#28** → `SUCCESS` — `Decision: PASS | Score: 0 | Findings: 0`, ligne `PORTE DE DÉCISION : PASS — build vert`, noise-filter tests `Results: 12 passed, 0 failed`.

**Credentials Jenkins (vérifiés via API, store système, "Secret text")** : `groq-api-key`, `github-webhook-secret`, `slack-webhook-url`. (Groq : la console montre `[report] calling LLM (Groq)… [report] LLM summary appended`.)

## 6bis. Filtrage du bruit / déduplication

Le scoring inclut un filtre de bruit (`pipeline/score/src/engine.js` → `filterNoise()`) qui supprime les **doublons** (même `id`), les findings à **confiance faible** (< 0.5) et les **règles ignorées** (`ignoredRules`).

**Contrat d'id** : `hashId([tool, ruleId, file, line])`. Deux findings d'outils différents sur la même ligne ont des ids distincts (chaque occurrence est scored séparément, c'est un choix de conception). Un doublon *vrai* partage exactement le même id.

### Tests unitaires (12/12 passants, tournent à chaque build Jenkins)

`pipeline/score/test/run.sh` → prouve la dédup, la confiance, les règles ignorées :

```
Test 1: Dedup by id         → bruts: 3 → filtrés: 2  (même id, gardé le plus sévère)
Test 2: Confidence          → bruts: 3 → filtrés: 1  (confidence < 0.5 supprimé)
Test 3: ignoredRules        → bruts: 3 → filtrés: 1  (règle ignorée supprimée)
Test 4: Combined scenario   → bruts: 5 → filtrés: 2  (déduction + confiance + ignoredRules)
Test 5: decide() full run   → raw: 3 → filtered: 1   (bruit complet)
```

### Preuve E2E — pivot réel + doublon injecté

On prend le pivot du run de référence (30 findings, 217 pts), injecte un doublon (même id, sévérité inférieure), et relance le scoring :

```
Findings bruts : 31  →  après filtrage bruit/dédup : 30
DÉCISION : BLOCK (score inchangé = 217 / seuil 10)
```

Le doublon est supprimé, le score original 217 est préservé. Artefacts : `~/devsecops-runs/dedup-proof-20260902-120826/`.

## 7. Infrastructure V3 — K8s / Argo CD / ZAP

### Cluster k3d `devsecops`
- Créé : `k3d cluster create devsecops --port 80:80@loadbalancer --port 443:443@loadbalancer --port 8081:30081@loadbalancer`
- Node `k3d-devsecops-server-0` (172.18.0.3), Traefik comme ingress controller, nodePort Traefik **80:32614**.
- Apps déployées via Kustomize : `kubectl apply -k k8s/overlays/dev`.
- Pods vérifiés **Running** : kube-system (coredns, traefik, svclb-traefik, metrics-server, local-path-provisioner), `devsecops` (app `devsecops-app-…-xjdn2`, `mongodb-…-vp9c5`), `argocd` (7 pods).
- App jointe : `curl -H "Host: devsecops.local" http://localhost/health` → `{"status":"ok"}`.

> **Contrainte d'environnement (TRANSPARENCE, à expliquer en soutenance)** : le réseau pod n'a **aucune égrèsse** (ni DNS ni TCP sortant). Conséquences, et compensations :
> - **Argo CD** : installation + UI + login admin + CRD Application OK, mais **synchro Git live impossible** (repo non enregistrable via `ls-remote`). Compensé : images importées hors-ligne dans containerd (`docker save` → `ctr -n k8s.io images import`), Application CR appliquée (Healthy).
> - **ZAP** : exécuté sur le **réseau k3d** (`--network k3d-devsecops`) en ciblant la nodePort Traefik (pas de Host-header requis : règle ingress catch-all ajoutée).

### Argo CD
- Namespace `argocd`, **7/7 pods Running/Ready** : server, repo-server, application-controller, applicationset-controller, dex-server, redis, notifications-controller.
- UI : `kubectl -n argocd port-forward svc/argocd-server 9090:80` → `https://localhost:9090` (HTTPS auto-signé). Login **`admin` / `4OKpXWRDqaW2oyH8`** (vérifié via API).
- Application **`devsecops-mean`** : health **Healthy** (sync "Unknown" = blocage réseau documenté).
- Pré-requis réseau contournés : images `argocd:v3.5.2`, `dex:v2.45.1`, `redis:7-alpine` importées hors-ligne ; `imagePullPolicy: IfNotPresent` appliqué.

### ZAP DAST
- Image `ghcr.io/zaproxy/zaproxy:stable`.
- Scan baseline contre l'app live :
  - **FAIL-NEW : 0** | **PASS : 58** | **WARN-NEW : 3**
  - Avertissements mineurs : `10021` X-Content-Type-Options manquant ; `10037` X-Powered-By exposé (fuite version) ; `10055` CSP sans fallback.
- Rapports : `pipeline/out/zap-report.{html,json,xml}` (ouvrir le HTML pour capture).
- Commande : `docker run --rm --network k3d-devsecops -v "$PWD/pipeline/out:/zap/wrk/:rw" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t "http://172.18.0.3:32614/" -r zap-report.html -J zap-report.json -x zap-report.xml -I`

## 8. Services fonctionnels (pour la démo)

| Service | URL | Accès |
|---------|-----|-------|
| Jenkins | http://localhost:8080 | admin/admin |
| Dashboard | http://localhost:3200 | PM2 daemon |
| App (K8s) | http://localhost/ (Host: `devsecops.local`) | Ingress Traefik |
| Argo CD | https://localhost:9090 | admin / `4OKpXWRDqaW2oyH8` |
| Smee | https://smee.io/Idi3niApFloU03v | → webhook Jenkins |

## 9. Les 5 points du tuteur — réponses argumentées (gaps corrigés)

1. **Séparation des scores** → Phase 1/Phase 2 (ADR-0002) : `decision-phase1.json` vs `decision.json` avec `phase1.score` + `phase2Contribution`. V2 = 74 (`phase1.score`), V3 = `totalScore` 217 (dont +143 `phase2Contribution`). Clés JSON vérifiées : `totalScore`, `blockThreshold`, `decision`.
2. **HMAC webhook** → `HMAC_SECRET` chargé depuis Credentials, preuve calculée dans le Stage 1, limitation smee documentée.
3. **Credentials Jenkins** → 3 secrets en Credentials Binding (`groq-api-key`, `slack-webhook-url`, `github-webhook-secret`), vérifiés via API (plus aucun secret en dur dans le code).
4. **Bruit / stabilité du score** → `.gitleaks.toml` allowlist (`pipeline/out/`, `pipeline/runs/`, `docs/`, `app/inject/`, `node_modules/`) → score **217 stable** sur builds consécutifs ; tests noise-filter (12 tests passants, tournent à chaque build Jenkins Stage 2) ; preuve E2E 31→30 (doublon injecté dans pivot réel, score inchangé).
5. **Notifications Slack** → `notify.sh` appelé au Stage 7 (ex. « [notify] Slack: sent (BLOCK) »).

## 10. Faits techniques utiles (piqures de rappel pour l'écriture)

- Normalisation : chaque outil → **pivot** (JSON normalisé) via `pipeline/normalize/src/index.js` (semgrep/trivy/gitleaks/kube-score/zaproxy + merge).
- Scoring : `pipeline/score/src/index.js` + `weights.json` ; sorties `decision.json` + `decision.log` (explicable, "top findings pondérés").
- Rapport IA : `pipeline/ai/report.js` + `llm.js` (**Groq**, `fetch` natif, fallback déterministe) ; `pipeline/ai/composition.js` = analyse d'architecture/surface d'attaque.
- Archivage : `pipeline/scripts/save-run.sh` → `~/devsecops-runs/<timestamp>/` (ex. `20260901-165026/` = le run BLOCK 217 de l'E2E).
- Dashboard V2 : Express API port 3200, SPA vanilla dark, cards par catégorie, lit `~/devsecops-runs/`.
- **Bug corrigé — SCAN_ROOT-override → score 340 fictif** : au début du développement E2E, on pouvait injecter `SCAN_ROOT=test/fixtures/fake-app` en override Jenkins, ce qui produisait un score artificiel de 340 (faux positifs sur données de test). Fix : `SCAN_ROOT` par défaut dans la définition de job (`app` pour v0, `test/fixtures/clean-app` pour v0-pass), pas d'override manuel. Le pipeline actuel est **100% déterministe** : les 217 points du BLOCK proviennent exclusivement de l'application réelle `app/` et de la configuration K8s, pas de données de test.
- Docs de référence : `README.md`, `docs/ROADMAP.md`, `docs/DEMO-V0.md`, `docs/SETUP-JENKINS.md`, `docs/V2-HMAC-SETUP.md`, `docs/ADR/ADR-0001` (seuil + limite Gitleaks --no-git), `docs/ADR/ADR-0002` (séparation Phase 1/2).

## 11. Captures d'écran à insérer (9, ordre de démo)

> **Chaque capture est un fichier concret sur disque.** Pour le rapport, screenshot/image les fichiers listés ci-dessous. Le répertoire `docs/screenshots/` contient les preuves prêtes à capturer.

| # | Sujet | Commande / Fichier | Preuve sur disque |
|---|-------|-------------------|-------------------|
| 1 | K8s pods (tous Running) | `kubectl get pods -A` | `docs/screenshots/01-k8s-pods.txt` |
| 2 | App health | `curl -H "Host: devsecops.local" http://localhost/health` | `docs/screenshots/02-health.txt` |
| 3 | Argo CD UI (apps Healthy) | `https://localhost:9090` → login `admin` / `4OKpXWRDqaW2oyH8` | `docs/screenshots/03-argocd.txt` (capture texte) |
| 4 | Jenkins v0 (BLOCK 217) | Console `devsecops-v0` #36 | `docs/screenshots/04-jenkins-v0-BLOCK.txt` |
| 5 | Jenkins v0-pass (PASS 0) + noise tests | Console `devsecops-v0-pass` #27/#28 | `docs/screenshots/05-jenkins-v0pass-PASS.txt` |
| 6 | Dashboard (cards) | `http://localhost:3200` | `docs/screenshots/06-dashboard.txt` (ou screenshot image) |
| 7 | Rapport exécutif **IA Groq** | `~/devsecops-runs/20260901-165026/report.txt` | `docs/screenshots/07-report-IA.txt` (section `RÉSUMÉ EXÉCUTIF (généré par IA — Groq Llama)`) |
| 8 | ZAP report (0 FAIL / 58 PASS / 3 WARN) | `pipeline/out/zap-report.html` | `docs/screenshots/08-zap-report.html` (ouvrable dans navigateur) |
| 9 | Dedup proof (31→30, score 217) | `~/devsecops-runs/dedup-proof-20260902-120826/decision.log` | `docs/screenshots/09-dedup-decision.log` |

---

## Plan demandé (structure du rapport de soutenance)

Le rapport doit suivre ce plan. Le rédiger en **français**, ton professionnel, 5000-7000 mots (~10-14 pages), avec tableaux et références aux preuves.

1. **Page de garde** — titre, auteur, tut… structure de stage, date.
2. **Résumé (½ page)** — chaîne DevSecOps V0→V3 sur app MEAN vulnérable, gate IA, 217/10, E2E vert/rouge.
3. **Introduction** — contexte stage, enjeux DevSecOps, problématique, objectifs.
4. **État de l'art / outils** — SAST/SCA/Secrets/DAST/K8s/GitOps, périmètre des outils choisis (tableau §5).
5. **Architecture du projet** — monorepo, pipeline 7 stages, dashboard, K8s/Argo CD (schémas textiles issus du README §Architecture globale).
6. **Méthodologie V0 → V3** — une sous-section par version, ce qui a été ajouté et *pourquoi* (voir §2).
7. **Mesures & résultats** — tables §3, §4 ; E2E `#36 BLOCK 217/30` vs `#26 PASS 0/0` ; stabilité 217 ; ZAP 0/58/3.
8. **Réponses aux points du tuteur** — développer le §9 (séparation des scores, HMAC, credentials, bruit, Slack).
9. **Limites & contraintes** — pas d'égrèsse réseau pod (Argo CD sync live, pulls images ; compensations), fallback IA, seuil arbitraire. Transparence = point fort.
10. **Démo** — ordre + 9 captures (voir §11).
11. **Conclusion & perspectives** — NetworkPolicies, TLS/cert-manager, monitoring, Angular dashboard, multiplier les données d'entraînement IA.
12. **Annexes** — commandes de reproduction (k3d, ZAP, Jenkins), ADR-0001/0002, URLs.