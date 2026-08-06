# VULN-003 — Dépendance avec CVE connue

- **Catégorie** : `sca` (Software Composition Analysis)
- **CWE** : CWE-1104 (Use of Unmaintained Third Party Components) / CWE-1357
- **OWASP** : A06:2021 (Vulnerable and Outdated Components)
- **Fichier(s)** : `app/server/package.json` (dépendance `lodash` épinglée à `4.17.15`)

## Description

`lodash@4.17.15` est épinglée **volontairement** en version vulnérable.
CVE référencée :

- **CVE-2019-10744** — prototype pollution via `defaultsDeep` (RCE potentielle
  dans certaines chaînes d'exploitation).
- **CVE-2021-23337** — command injection via `templateSettings.variable`
  (fixée en 4.17.21).

Aucune version `4.17.15` ne satisfait npm audit. C'est l'exemple parfait pour
montrer que la chaîne V0 **ne scanne pas que le code** : la dépendance est
détectée dès que le scan SCA arrive en V1 (Trivy / npm audit / Snyk).

## Remède

- Mettre à jour vers `lodash@^4.17.21` (dernière 4.x saine).
- Automatiser la mise à jour (renovate/dependabot) et bloquer les builds tant
  que la porte SCA est rouge.

## Détection attendue

- **V0** : npm audit (vérification manuelle de l'étape de test E2E), log.
- **V1** : Trivy / Snyk remontent `CVE-2019-10744`, `CVE-2021-23337` → `high`.
