# VULN-002 — Secret en dur dans le code source

- **Catégorie** : `secrets`
- **CWE** : CWE-798 (Use of Hard-coded Credentials)
- **OWASP** : A07:2021 (Identification and Authentication Failures)
- **Fichier(s)** : `app/server/src/config.js` (lignes ~12-13)

## Description

Une clé API (`AKIAIOSFODNN7EXAMPLE`, format AWS Access Key) et un mot de passe
(`dbPassword`) sont en clair dans le code. Une fois commités, ils restent dans
l'historique Git même après suppression — c'est pour ça que la porte de décision
est **bloquante** sur cette catégorie.

## Exploitation

- Tout contributeur/attaquant ayant accès au repo obtient des credentials réels.
- Les secrets compromis dans l'historique Git sont traqués par des scanners type
  GitHub secret scanning / Gitleaks.

## Remède

- Retirer le secret du code, l'injecter via variable d'environnement / secret manager.
- Centraliser dans Jenkins Credentials (V2 de la roadmap).
- Utiliser un pré-commit hook (gitleaks/git-secrets) pour empêcher le commit.

## Détection attendue

- SemGrep (règle `hardcoded-credentials` / regex AWS) → `high`, fichier `config.js`.
- En V1 : Gitleaks → `high`, même fichier.
