# V2.1 — Sécurisation Jenkins (HMAC + Credentials)

## Objectif

Sécuriser le pipeline contre les appels webhook non autorisés et centraliser les secrets.

## État actuel

### HMAC Webhook — ✅ Configuré

**Fonctionnement** :
1. GitHub envoie le webhook avec header `X-Hub-Signature-256` (HMAC-SHA256 du payload)
2. Jenkins vérifie la signature via le GitHub plugin
3. Rejet si la signature ne correspond pas

**Configuration** :
- Secret généré : `openssl rand -hex 32`
- Stocké dans : `$HOME/.jenkins/secrets/webhook-hmac-secret` (mode 600)
- Stocké dans Jenkins Credentials : `github-webhook-secret` (GLOBAL scope)
- GitHub webhook mis à jour avec le secret

**Vérification** :
```bash
# Vérifier que le secret existe
ls -la $HOME/.jenkins/secrets/webhook-hmac-secret

# Vérifier que le credential existe
curl -s -u admin:admin "http://localhost:8080/script" \
  --data-urlencode "script=println Jenkins.instance.getExtensionList('com.cloudbees.plugins.credentials.SystemCredentialsProvider')[0].getStore().getCredentials(com.cloudbees.plugins.credentials.domains.Domain.global()).find { it.id == 'github-webhook-secret' }?.id"
```

**Limitation V2** :
- La vérification HMAC est gérée par le GitHub plugin au niveau du endpoint `/github-webhook/`
- Le pipeline affiche l'état de la configuration mais ne vérifie pas HMAC lui-même
- En production, le GitHub plugin rejette les requêtes sans signature valide

### Jenkins Credentials — ✅ Stocké

Le secret webhook est stocké dans :
- Jenkins Credentials Store (ID: `github-webhook-secret`)
- Fichier local: `$HOME/.jenkins/secrets/webhook-hmac-secret`

Pour accéder au secret dans un pipeline :
```groovy
withCredentials([string(credentialsId: 'github-webhook-secret', variable: 'SECRET')]) {
  sh 'echo $SECRET'
}
```

## Prochaines étapes (V2)

1. Dashboard minimal (statut par module, historique des runs)
2. Rapport exécutif IA
3. Notifications email/Slack
4. Résilience timeout/plantage
