# POC Demo — Script de démonstration (défense de stage)

> **Durée** : 10-15 min. Lister les commandes, montrer les résultats, dire les talking points.
>
> **Prérequis** : tous les services doivent être up (voir §0). Si quelque chose est down, lancer les commandes de §0.

---

## §0 — Prérequis (état attendu)

```bash
export PATH="$HOME/devsecops-tools:$PATH"

# Vérifier le cluster
kubectl get nodes
kubectl get pods -A

# Vérifier les services
curl -s -o /dev/null -w "jenkins: %{http_code}\n" http://localhost:8080/     # 200
curl -s -o /dev/null -w "app: %{http_code}\n" http://localhost/health       # 200
curl -sk -o /dev/null -w "argocd: %{http_code}\n" https://localhost:9090/   # 200
curl -s -o /dev/null -w "dashboard: %{http_code}\n" http://localhost:3200/  # 200
ss -ltn | grep -E "8080|9090|3200"                                          # 3 services UP
```

### Démarrage (si besoin)

```bash
# Jenkins
cd ~/jenkins && java -jar jenkins.war --httpPort=8080 &

# Argo CD UI
kubectl -n argocd port-forward svc/argocd-server 9090:80 &

# Dashboard
cd ~/devsecops-mean/dashboard/api && pm2 start server.js --name dashboard

# Smee (GitHub → Jenkins)
smee --url https://smee.io/Idi3niApFloU03v --target http://localhost:8080/github-webhook/
```

### Credentials

| Service | URL | Login |
|---------|-----|-------|
| Jenkins | http://localhost:8080 | `admin` / `admin` |
| Argo CD | https://localhost:9090 | `admin` / `4OKpXWRDqaW2oyH8` |
| Dashboard | http://localhost:3200 | (pas de login) |
| App | http://localhost/ (Host: `devsecops.local`) | — |

---

## Étape 1 — K8s + app live (2 min)

### Commande
```bash
kubectl get nodes
kubectl get pods -A
curl -H "Host: devsecops.local" http://localhost/health
```

### Attendu
- 1 node `k3d-devsecops-server-0` **Ready**
- Pods Running : kube-system (coredns, traefik, svclb-traefik, metrics-server, local-path-provisioner), devsecops (app + mongo), argocd (7 pods)
- `{"status":"ok"}`

### Talking point
> « Le cluster k3d 'devsecops' est opérationnel. L'application MEAN (MongoDB + Express) est déployée via des manifests Kubernetes (Kustomize overlays) et accessible via l'ingress Traefik. L'architecture reprend l'infrastructure K8s qu'on retrouve en production. »

### Capture : screenshot 1 (`kubectl get pods -A`) + screenshot 2 (`curl /health`)

---

## Étape 2 — Argo CD + GitOps (2 min)

### Commande
```bash
# Ouvrir https://localhost:9090 dans le navigateur
# Login : admin / 4OKpXWRDqaW2oyH8 (accepter le cert auto-signé)
# Montrer : Applications → devsecops-mean → Health: Healthy
```

### Attendu
- Argo CD UI accessible (HTTPS, cert auto-signé)
- Application `devsecops-mean` : **Health = Healthy**, Sync = Unknown

### Talking point
> « Argo CD est installé sur le cluster (7 pods, namespace 'argocd'). L'Application CR 'devsecops-mean' est appliquée et le santé est 'Healthy'. La synchronisation Git live est indisponible car le réseau pod n'a pas d'égrense vers Internet — c'est une contrainte environnementale documentée, pas un bug. Les images ont été importées hors-ligne via containerd. »

### Capture : screenshot 3 (Argo CD login + applications)

---

## Étape 3 — Jenkins : le BUILD ROUGE (v0) (3 min)

### Commande
```bash
# Ouvrir http://localhost:8080
# Aller dans devsecops-v0 → Build #36 → Console
# Montrer : "PORTE DE DÉCISION : BLOCK — build rouge"
# Montrer : "Decision: BLOCK | Score: 217 | Findings: 30"
```

### Attendu
- Build #36 **FAILURE** (rouge)
- `DÉCISION : BLOCK (score cumulé non plafonné 217 / seuil 10)`
- `Findings bruts : 30 → après filtrage bruit/dédup : 30`
- Top findings : secrets (20 pts CRITICAL), gitleaks AWS (14 pts), semgrep (7 pts × 3), trivy lodash (7 pts × 4), kube-score (7 pts × 1)

### Talking point
> « Le job 'devsecops-v0' scanne l'application réelle (dossier 'app/'). Le scoring déterministe produit 217 points, soit 21 fois le seuil de blocage (10). Le build est marqué rouge — BLOCK — et la notification Slack est envoyée automatiquement. C'est le comportement attendu : l'application contient des vulnérabilités injectées volontairement. »

### Capture : screenshot 4 (console Jenkins v0, "PORTE DE DÉCISION : BLOCK" + score 217)

---

## Étape 4 — Jenkins : le BUILD VERT (v0-pass) + noise-filter (2 min)

### Commande
```bash
# Aller dans devsecops-v0-pass → Build #27/#28 → Console
# Montrer : "PORTE DE DÉCISION : PASS — build vert"
# Montrer : "Decision: PASS | Score: 0 | Findings: 0"
# Descendre jusqu'à : "Noise filter tests" → "Results: 12 passed, 0 failed"
```

### Attendu
- Build **SUCCESS** (vert)
- `DÉCISION : PASS (score cumulé non plafonné 0 / seuil 10)`
- `Noise filter tests → Test 1..5 → Results: 12 passed, 0 failed`

### Talking point
> « Le job 'devsecops-v0-pass' scanne un module sain ('test/fixtures/clean-app'). Le score est 0 → BUILD VERT. Le Stage 2 exécute aussi les tests unitaires du filtre de bruit (12 assertions démontrant la déduplication, le filtrage par confiance, et les règles ignorées). Le filtre de bruit est prouvé à chaque build. »

### Capture : screenshot 5 (console v0-pass, "PASS" + "Results: 12 passed, 0 failed")

---

## Étape 5 — Scoring détaillé + rapport IA (2 min)

### Commande
```bash
# Ouvrir http://localhost:3200 (Dashboard)
# Montrer : cards SAST, SCA, Secrets, K8s, DAST, Container
# Montrer : score cumulé, décision BLOCK
# Ouvrir un rapport exécutif (~/devsecops-runs/20260901-165026/report.txt)
```

### Attendu
- Dashboard : cards par catégorie avec scores
- report.txt : rapport déterministe + section « RÉSUMÉ EXÉCUTIF » (IA Groq)

### Talking point
> « Le dashboard agrège les résultats par catégorie. Le rapport exécutif combine l'analyse déterministe (tranchée, pondérée) avec une section IA (Groq) qui génère un résumé en langage naturel. Le scoring est transparent et explicable : chaque finding a un poids sévérité × catégorie. »

### Capture : screenshot 6 (dashboard) + screenshot 7 (report.txt section IA)

---

## Étape 6 — ZAP DAST (1 min)

### Commande
```bash
# Ouvrir pipeline/out/zap-report.html dans le navigateur
# Montrer : "Alerts Summary" → 0 High/Medium/Low, 3 Informational
```

### Attendu
- ZAP baseline scan : **0 FAIL**, **58 PASS**, **3 WARN** (informational)
- Avertissements mineurs : X-Content-Type-Options, X-Powered-By, CSP

### Talking point
> « Le scan DAST OWASP ZAP est exécuté contre l'application live sur le cluster (via le réseau k3d). Résultat : zéro fail, 58 checks passés, 3 warnings informatifs (headers manquants). C'est un scan baseline — les prochaines étapes pourraient ajouter un spider + active scan. »

### Capture : screenshot 8 (ZAP report HTML)

---

## Étape 7 — Noise-filter dedup proof (1 min)

### Commande
```bash
# Montrer le fichier ~/devsecops-runs/dedup-proof-20260902-120826/decision.log
# Ligne : "Findings bruts : 31 → après filtrage bruit/dédup : 30"
# Ligne : "DÉCISION : BLOCK (score cumulé non plafonné 217 / seuil 10)"
```

### Attendu
- bruts: 31 → filtrés: 30 (1 doublon supprimé)
- Score inchangé : 217

### Talking point
> « Le filtre de bruit est prouvé end-to-end. On a injecté un doublon volontaire (même id, sévérité inférieure) dans le pivot réel de 30 findings. Le moteur de scoring l'a supprimé (31 → 30), le score reste 217. Les tests unitaires (12 assertions) tournnent à chaque build Jenkins. »

### Capture : screenshot 9 (decision.log lignes bruts/filtrés + score)

---

## Étape 8 — Git log (30 sec)

### Commande
```bash
git log --oneline | head -15
```

### Attendu
- Progression visible : V0 → V1 → V2 → V3
- Derniers commits : docs V3 démontré, trivy fix, README, Phase1/Phase2 separation, V2 hardening

### Talking point
> « L'historique git montre la progression du projet de V0 à V3, avec chaque étape démontrée et documentée. »

---

## Réponses aux questions probables du tutor

### Q1 : « Pourquoi kube-score (99 pts) pèse plus que composition (44 pts) ? »
> « kube-score produit 15 findings de configuration K8s (probes, security context, resource limits...), chacun pondéré sévérité × catégorie (K8s = 1.0). La composition produit 6 findings d'analyse architecturale (secrets en dur, config vulnérable), pondérés par la catégorie du finding (secrets = 2.0, sast = 1.0). Le plus gros contributeur est kube-score car il y a 15 findings vs 6. »

### Q2 : « La Phase 2 s'agrège comment à la Phase 1 ? »
> « Le decision.json contient phase1.score (74) + phase2Contribution (143) = total (217). Chaque phase est calculée indépendamment sur son propre pivot (pivot-phase1.json et pivot.json). Voir ADR-0002 pour la justification complète. »

### Q3 : « Argo CD ne synchronise pas GitHub, c'est un vrai GitOps ? »
> « L'installation est complète et fonctionnelle (7 pods, UI, Application CR Healthy). La synchro live est impossible car le réseau pod n'a pas d'égrense (contrainte environnementale documentée). Les images ont été importées hors-ligne. En production avec un vrai réseau, la synchro fonctionnerait normalement. »

### Q4 : « Le noise-filter a-t-il vraiment un impact ? »
> « Sur les données réelles, il n'y a pas de doublons (les ids sont uniques par outil+fichier+ligne). Le filtre agit surtout sur les données bruitées (confidence < 0.5, règles ignorées). Les 12 tests unitaires prouvent le mécanisme avec des doublons volontaires, et le build Jenkins montre les résultats à chaque exécution. »

### Q5 : « Les credentials sont-ils vraiment sécurisés ? »
> « Les 3 secrets (groq-api-key, github-webhook-secret, slack-webhook-url) sont dans Jenkins Credentials Binding (type Secret text, store système). Aucun secret en dur dans le code. Vérifié via l'API Jenkins : l'endpoint /credentials/store/system/domain/_ les liste tous les trois. »

---

## Ordre de captures (récapitulatif)

| # | Sujet | Commande / Fichier |
|---|-------|-------------------|
| 1 | K8s pods (tous Running) | `kubectl get pods -A` |
| 2 | App health | `curl -H "Host: devsecops.local" http://localhost/health` |
| 3 | Argo CD UI (apps Healthy) | `https://localhost:9090` |
| 4 | Jenkins v0 (BLOCK 217) | Console `devsecops-v0` #36 |
| 5 | Jenkins v0-pass (PASS 0) | Console `devsecops-v0-pass` #27 + noise tests |
| 6 | Dashboard (cards) | `http://localhost:3200` |
| 7 | Rapport exécutif (Groq) | `~/devsecops-runs/20260901-165026/report.txt` |
| 8 | ZAP report (0 FAIL) | `pipeline/out/zap-report.html` |
| 9 | Dedup proof (31→30) | `~/devsecops-runs/dedup-proof-20260902-120826/decision.log` |
