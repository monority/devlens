# Step 96 — Architecture & Product Continuity Audit

## Objectif

Déterminer s'il existe un **vrai prochain chantier architectural ou produit**, rendu
pertinent par l'accumulation des fonctionnalités des Steps 80–92 (Detection, Provenance,
Integrity, Technology, Detection History, History Summary, Comparison, Navigation).

**AUDIT_ONLY** — aucune modification de code n'est appliquée tant qu'un problème concret
n'est pas identifié comme suffisamment important pour justifier une implémentation.

---

## Périmètre

Audit des 9 packages et 2 apps du monorepo :

```text
packages/core        (pure domain, no deps)
packages/application (→ core, crawler, detectors)
packages/analyzer    (reserved stub)
packages/crawler     (→ core)
packages/detectors   (→ core)
packages/database    (→ application, core; devDeps: detectors)
packages/validation  (reserved stub)
packages/config      (reserved stub)
apps/web             (→ application, core, crawler, database, detectors)
apps/worker          (→ application, core, crawler, database, detectors)
```

Flux audités :

```text
Scan → Detection → Dedup → Scoring → Provenance → Integrity → Technology
  → Detection History → History Summary → Comparison → Navigation
```

---

## Architecture auditée

```text
                    ┌──────────────────────────────────────┐
                    │         apps/web  (Next.js SSR)      │
                    │                                      │
                    │  ┌──────┐  ┌──────────┐  ┌───────┐  │
                    │  │ api/*│  │ lib/*    │  │app/*   │  │
                    │  │(route│  │(presenta-│  │(pages) │  │
                    │  │ handler)│ tion +   │  │        │  │
                    │  │      │  │ data)    │  │        │  │
                    │  └──────┘  └────┬─────┘  └────┬──┘  │
                    │                 │              │     │
                    │         HTTP API│       Direct │ DB  │
                    │         fetch()│       access │     │
                    └─────────┬───────┼──────────────┼─────┘
                              │       │              │
                    ┌─────────▼───────▼──────────────▼─────┐
                    │        @devlens/application          │
                    │  (queries.ts: getScan, listScans)   │
                    │  (execute-scan.ts: runScan, etc.)   │
                    └─────────┬──────────────────────────┘
                              │
                    ┌─────────▼──────────┐  ┌──────────────┐
                    │ @devlens/database   │  │ @devlens/core│
                    │ (Postgres/InMemory  │  │ (pure domain)│
                    │  repository)       │  │              │
                    └────────────────────┘  └──────────────┘
                              │                     ▲
                    ┌─────────▼──────────┐  ┌───────┴────────┐
                    │ @devlens/crawler    │  │ @devlens/detectors│
                    │ (crawling)          │  │ (detection)      │
                    └────────────────────┘  └──────────────────┘
```

---

## Résultat

**Audit-only — aucune modification de code justifiée.**

10 findings identifiés. Classification :

| Catégorie | Findings | Décision |
|---|---|---|
| Boundary violation (direct DB from web) | F-001, F-007 | DEFER — nécessite une nouvelle API endpoint (interdit par les contraintes Step 96) |
| Duplication intentionnelle & documentée | F-002, F-003 | DEFER — contraintes de dépendance / garantie de correction |
| Duplication mineure presentation-layer | F-004, F-005, F-006 | DEFER — serait un "generic cleanup" (interdit par Step 96) |
| Gap de test | F-010 | DEFER — test pour un pattern intentionnel |
| Gap navigation | F-008 | DEFER — amélioration UX mineure |
| Test architecture | F-009 | DEFER — pas de drift architectural |

### Finding principal — F-001 : Boundary violation (DEFER, à prioriser)

`apps/web/src/app/technologies/[id]/page.tsx` contourne l'API HTTP et accède
directement à PostgreSQL via `@/lib/scan-data.ts` → `new PostgresScanResultRepository()`.
C'est la seule page web non-API qui importe `@devlens/database`.

- **Cause** : il n'existe pas d'endpoint API pour récupérer tous les scans avec leurs
  détections en un seul appel. L'accès direct est une optimisation N+1, documentée depuis
  Step 53.
- **Conséquence** : doublon `scanResultToSummary` (mirrors `resultToResponse` in `handler.ts`),
  couplage direct à PostgreSQL/Drizzle, aucun test unitaire (`scan-data.test.ts` n'existe pas).
- **Pourquoi pas de fix maintenant** : le fix exige un nouvel endpoint API
  (`GET /api/scans/with-detections` ou équivalent), ce qui est interdit par
  "Do not modify API contracts". Utiliser les endpoints existants introduirait un
  anti-pattern N+1 pire.
- **Prochaine étape future (Step 97)** : ajouter un endpoint API qui sert tous les scans avec
  détections en un seul round-trip, puis faire basculer la page technologie sur l'API HTTP.

---

## Décision finale

```
RESULT: AUDIT ONLY — NO CODE CHANGE JUSTIFIED
```

Toutes les baseline commands passent (2505 tests, typecheck, ESLint, Prettier, build).
L'architecture tient — les duplications qui existent sont soit des compromis intentionnels
documentés (identity evidence, double calcul de l'explicabilité, accès DB direct), soit des
duplications mineures de présentation qui constituent un "generic cleanup" interdit par Step 96.
