# Step 95 — Monorepo Remaining Issues Hardening

## Objectif

Réexaminer un par un les problèmes différés lors de l'audit précédent (Step 94)
et corriger ceux qui sont **réellement justifiés** — pas ceux qui « pourraient
être mieux ».

Principe : **AUDIT → PREUVE → DÉCISION → IMPLEMENTATION → VALIDATION → RAPPORT**.

---

## Périmètre

### Findings réexaminés

| # | Finding | Catégorie | Résultat |
|---|---------|-----------|----------|
| 1A | esbuild Moderate vulnerability (GHSA-67mh-4wv8-2f99) | Security | DEFER |
| F-005 | Stubs analyzer / validation / config | Architecture | KEEP |
| F-006 | Absence de véritables E2E Playwright | Testing | DEFER |
| F-008 | Worker one-shot / DEMO_TARGET_URL | Architecture | KEEP |
| F-009 | Instanciation DB par requête | Infrastructure | KEEP/DEFER |
| F-014 | Dead code identifié (page.tsx:117) | Dead code | KEEP (re-examined) |
| F-015 | Baseline log cleanup | Housekeeping | Already done (Step 94) |

### Findings explicitement hors périmètre

F-004 — Test fixture casts (`as never` / `as ScanId`): acceptable pattern,
TypeScript strict mode + ESLint enforce safety.

### Décisions d'architecture

Toutes les décisions sont fondées sur des preuves concrètes (versions
installées, imports/références, tests existants, comportement observé),
pas sur des hypothèses.

---

## Architecture impactée

Aucune modification de l'architecture n'est apportée. Le Step 95 est un
audit d'évaluation : chaque finding a été vérifié contre le code actuel,
et les décisions de KEEP / DEFER sont documentées ci-dessous.

```text
web
 ↓
application/infrastructure packages
 ↓
core
```

Cette direction de dépendance reste respectée — aucun composant UI
n'importe jamais `@devlens/database`, `@devlens/detectors`, ou
`@devlens/crawler` directement.
