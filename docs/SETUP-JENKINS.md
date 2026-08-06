# Setup Jenkins local (V0)

Jenkins natif (WAR), sans Docker ni sudo. Données dans `~/.jenkins`, WAR dans `~/jenkins`.

## 1. Télécharger et lancer

```bash
mkdir -p ~/jenkins
curl -sL https://get.jenkins.io/war-stable/latest/jenkins.war -o ~/jenkins/jenkins.war
infra/jenkins-start.sh --bg          # arrière-plan, port 8080
infra/jenkins-start.sh --logs        # suivre les logs
infra/jenkins-start.sh --stop        # arrêter
```

Jenkins UI : http://localhost:8080

> **Mode sécurité V0** : lancé avec `-Djenkins.install.runSetupWizard=false` →
> Jenkins est **non sécurisé** en local. C'est volontaire : la sécurisation
> (utilisateur admin, HMAC sur le webhook, secrets dans Jenkins Credentials)
> est au programme **V2** de la roadmap.

## 2. Plugins installés

Via l'API `pluginManager/installNecessaryPlugins` :
`git`, `github`, `workflow-aggregator` (Pipeline) + dépendances. (61 plugins au total.)

## 3. Job « devsecops-v0 »

Type **Pipeline from SCM** :
- SCM : `https://github.com/Carbon14-48/devsecops-mean.git`, branche `*/main`
- Script path : `pipeline/Jenkinsfile`
- Trigger : **GitHub hook trigger for GITScm polling** (`GitHubPushTrigger`)

Configuration réutilisable dans `infra/job-devsecops-v0.xml`
(créer : `POST /createItem?name=devsecops-v0` avec ce XML en body `application/xml`).

Paramètre de build `SCAN_ROOT` (défaut `app`) : cible du scan SemGrep.
Avec `SCAN_ROOT=test/fixtures/clean-app`, la même chaîne produit un build **vert**
(voir § 5.b) — c'est la preuve que la porte de décision discrimine.

### 3.b Job « devsecops-v0-pass » (chemin PASS)

Même Pipeline from SCM, même Jenkinsfile, mais `SCAN_ROOT` par défaut = `test/fixtures/clean-app`
(module sain, aucune vulnérabilité injectée → score 0 < seuil → PASS).

Configuration dans `infra/job-devsecops-v0-pass.xml`
(créer : `POST /createItem?name=devsecops-v0-pass` avec ce XML en body `application/xml`).

Les deux jobs ont le trigger webhook : **un seul push lance le rouge et le vert en parallèle**.

## 4. Webhook GitHub → Jenkins local (via smee.io)

GitHub ne peut pas joindre `localhost`. On utilise **smee.io** (relais officiel recommandé
par GitHub pour tester les webhooks en local) :

```bash
infra/webhook-local.sh        # crée/relance le relais smee → Jenkins
infra/webhook-local.sh --logs # voir les requêtes arriver
infra/webhook-local.sh --stop
```

- Channel smee : `https://smee.io/Idi3niApFloU03v` (URL à donner à GitHub)
- Target : `http://localhost:8080/github-webhook//`
  (le **double slash** est volontaire : smee retire un slash, et Jenkins répond 302→405
  si on POST sur `/github-webhook` sans slash final.)

Côté GitHub : webhook `push` sur le repo, Payload URL = channel smee, Content-Type `json`.
Vérifier les livraisons : Settings → Webhooks → Recent Deliveries.

## 5. Vérification

1. `git push origin main`
2. GitHub → smee → Jenkins (`/github-webhook/`)
3. Les deux jobs démarrent en parallèle.
4. **devsecops-v0** : build **rouge** avec `DÉCISION : BLOCK (score 18 / seuil 10)` + artefacts archivés.
5. **devsecops-v0-pass** : build **vert** avec `DÉCISION : PASS (score 0 / seuil 10)` + artefacts archivés.

> Vérifie la **discrimination** du moteur : même chaîne, deux cibles différentes →
> vulnérable = bloqué, sain = autorisé.

## Pré-requis sur le host

- Java 17/21 (`java -jar jenkins.war`)
- Node.js ≥ 18 (scripts pipeline)
- Python 3 + venv (venv semgrep provisionné une fois par le build dans `~/devsecops-tools/semgrep-venv`)
