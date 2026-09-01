# ADR-0002 : Agrégation du score Phase 1 + Phase 2

## Statut

Approuvé — 2026-08-31

**Mise à jour démonstration (2026-09-01)** : les deux phases sont désormais exercées sur l'infra V3 réelle — phase 2 tourne `kube-score` sur les manifests déployés (`k8s/base/*.yaml`) et le scan DAST ZAP exécuté contre l'app live sur le cluster k3d (`devsecops`) alimente la catégorie DAST. E2E final Jenkins : v0 → BLOCK 217/30 (rouge), v0-pass → PASS 0/0 (vert), le rapport exécutif affiche bien les deux scores séparément (Phase 1 V0-V2 / Phase 2 V3).

## Contexte

Le pipeline DevSecOps combine des outils de scan de sécurité à travers deux phases :

- **Phase 1 (V0-V2)** : SemGrep (SAST) + Trivy (SCA) + Gitleaks (secrets)
- **Phase 2 (V3)** : kube-score (audit K8s) + composition.js (analyse d'architecture)

Le score canonique de 217 pts inclut les deux phases. Le tutor a demandé une séparation claire entre le score V0-V2 (preuve des étapes 0 à 2) et la contribution V3 (étape 3), pour éviter un mélange inconscient et répondre à la question de réflexion : « Comment le score Phase 2 s'agrège au score Phase 1 ? »

## Décision

Le score est produit en deux étapes distinctes :

1. **Phase 1** : `pivot-phase1.json` (semgrep+trivy+gitleaks) → `decision-phase1.json`
2. **Phase 2** : `pivot.json` (Phase 1 + kube-score + composition) → `decision.json`

Le `decision.json` contient :
```json
{
  "decision": "BLOCK",
  "totalScore": 217,
  "phase1": { "score": 74, "findings": 9 },
  "phase2Contribution": 143
}
```

Le rapport exécutif affiche les deux scores séparément :
```
Score Phase 1 (V0-V2) : 74 pts  (9 findings)
Score Phase 2 (V3)    : +143 pts  (kube-score + composition)
Score total           : 217 / seuil 10
```

## Conséquences

### Positives
- V0-V2 est démontrable indépendamment (score 74, pas de kube-score/composition)
- La contribution V3 est quantifiée (+143 pts) et justifiable
- La question de réflexion du tutor est répondue concrètement
- En cas de régression V3 (kube-score indisponible), le score V0-V2 reste valide

### Négatives
- Deux pivots à produire au lieu d'un (coût marginal en temps)
- Le `decision.json` est plus complexe (champs supplémentaires)

## Justification des poids

| Composant | Poids | Rationale |
|-----------|-------|-----------|
| SemGrep (SAST) | 1.0 | Catégorie de base |
| Trivy (SCA) | 1.0 | Catégorie de base |
| Gitleaks (secrets) | 2.0 | Secrets exposés = impact double |
| kube-score (K8s) | 1.0 | Audit configuration |
| Composition (analyse) | 1.0 | Analyse d'architecture |
| Critique | 10x | Impact maximum |
| Haute | 7x | Impact significatif |
| Moyenne | 4x | Impact modéré |
| Basse | 1x | Impact faible |
