# VULN-001 — Injection NoSQL

- **Catégorie** : `sast`
- **CWE** : CWE-943 (Improper Neutralization of Special Elements in Data Query Logic) / CWE-89 (Injection SQL, ici transposé NoSQL)
- **OWASP** : A03:2021 (Injection)
- **Fichier(s)** : `app/server/src/routes/search.js` (ligne ~12) et `app/server/src/routes/auth.js` (ligne ~13)

## Description

Deux variantes d'injection NoSQL :

1. **Recherche** (`search.js`) : le paramètre `q` est interpolé dans un opérateur `$where` de Mongoose.
   L'utilisateur injecte du JavaScript exécuté côté serveur par le moteur Mongo.
2. **Login** (`auth.js`) : `username` / `password` sont passés tels quels dans le filtre `findOne`.
   En envoyant des objets opérateurs (`{ "$ne": "" }`), l'attaquant contourne l'authentification.

## Exploitation (démo)

```
# Recherche — extraction de toute la base via $where
curl 'http://localhost:3000/api/search?q=1;return true'

# Login — bypass d'auth
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":{"$ne":""},"password":{"$ne":""}}'
```

## Remède

- Ne jamais interpoler d'entrée utilisateur dans un opérateur Mongo. Utiliser une recherche
  textuelle (`$regex` échappé) ou l'index textuel.
- Valider que `username`/`password` sont des chaînes (`typeof === 'string'`).
- Comparer un hash de mot de passe (bcrypt), jamais le mot de passe en clair.

## Détection attendue

- SemGrep (pack OWASP / règle NoSQL injection) → `critical`/`high`, fichier `search.js` / `auth.js`.
