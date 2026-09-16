# DevLens — Step 14 — Detection Engine Hardening & Architecture Audit

## Context

DevLens vient de terminer son Step 13 avec une baseline de détection complète.

État actuel :

- **29 technologies** dans le catalogue
- **6 detectors**
- pipeline :

```text
CompositeDetector
→ DeduplicatingDetector
→ ScoringDetector(ConfidenceScorer)
→ ScanResult
```

- `HttpCrawler` et `SiteSnapshot` durcis au Step 12
- corpus de **35 fixtures réalistes**
- **29/29 technologies couvertes**
- **19 collisions** testées
- fixtures négatives / false-positive
- golden tests exécutant le pipeline réel
- résultats déterministes
- persistence PostgreSQL/Drizzle
- API Next.js séparant route adapter / handler / application logic
- architecture monorepo
- TypeScript strict

Dernier état de validation :

```text
pnpm typecheck      → 0 errors
pnpm test           → 824 passed / 9 skipped
pnpm lint           → clean
pnpm build          → clean
madge               → no circular dependency
                       143 files
```

---

# Goal

Réaliser un **Architecture & Detection Engine Hardening Audit** complet.

Cette étape ne doit pas ajouter de nouvelles fonctionnalités utilisateur.

Elle doit déterminer si l'architecture actuelle est suffisamment solide pour continuer à évoluer.

Les objectifs sont :

1. vérifier les frontières entre packages ;
2. vérifier les responsabilités ;
3. identifier les duplications ;
4. identifier les abstractions inutiles ;
5. identifier les APIs trop permissives ;
6. vérifier les chemins d'erreur ;
7. vérifier la robustesse du pipeline ;
8. vérifier les performances évidentes ;
9. vérifier la testabilité ;
10. identifier les risques techniques avant qu'ils deviennent coûteux.

Principe :

> **Stabilize the engine before expanding the engine.**

---

# 1. Audit global obligatoire

Commencer par cartographier l'architecture réelle.

Inspecter :

```text
apps/
packages/
```

et produire une représentation conceptuelle :

```text
apps
 ├── web/api
 └── ...

packages
 ├── core
 ├── detectors
 └── ...
```

Utiliser l'architecture réellement présente.

Ne pas supposer que les noms de packages ou responsabilités correspondent exactement à la documentation.

---

# 2. Package boundaries

Pour chaque package, déterminer :

- responsabilité ;
- dépendances ;
- API publique ;
- API interne ;
- types exportés ;
- effets de bord ;
- accès réseau ;
- accès DB ;
- dépendances runtime ;
- dépendances de test.

Créer une matrice :

| Package   | Responsibility | Depends on | Public API | Side effects |
| --------- | -------------- | ---------- | ---------- | ------------ |
| core      | ...            | ...        | ...        | ...          |
| detectors | ...            | ...        | ...        | ...          |
| app       | ...            | ...        | ...        | ...          |
| web       | ...            | ...        | ...        | ...          |

Le but est de détecter les violations de séparation des responsabilités.

---

# 3. Dependency direction

Vérifier que les dépendances suivent une direction cohérente.

Architecture cible conceptuelle :

```text
HTTP / Web
    ↓
Application
    ↓
Core
    ↑
Detectors
```

Adapter à l'architecture réelle.

Identifier notamment :

- core dépendant d'une implémentation web ;
- detectors dépendant de Next.js ;
- core dépendant de la DB ;
- domain dépendant d'un framework ;
- infrastructure exposée au domain ;
- imports traversant plusieurs couches inutilement.

Ne pas imposer une architecture théorique si le code actuel possède une raison légitime.

Le but est de détecter les **couplages réels**, pas de créer des abstractions pour satisfaire un diagramme.

---

# 4. Public API audit

Inspecter les `index.ts` / package exports.

Pour chaque export :

- est-il réellement utilisé hors du package ?
- doit-il être public ?
- est-il accidentellement exposé ?
- expose-t-il une implémentation interne ?
- expose-t-il des types qui devraient rester internes ?

Une règle importante :

> **Internal implementation details should remain internal.**

Exemples de choses qui peuvent rester internes :

```text
clampConfidence
getEvidenceKey
helper functions
normalization internals
matcher implementation details
fixture helpers
```

Ne pas rendre public quelque chose uniquement parce qu'il est réutilisable actuellement.

---

# 5. Detector contract audit

Auditer l'interface `Detector`.

Vérifier :

- input ;
- output ;
- erreurs ;
- side effects ;
- déterminisme ;
- synchronisme/asynchronisme ;
- mutation éventuelle ;
- dépendances implicites.

Un detector devrait idéalement être conceptuellement proche de :

```text
SiteSnapshot
    ↓
Detector
    ↓
Detection[]
```

ou du contrat réel équivalent.

Vérifier qu'un detector :

- ne fait pas de network request ;
- ne touche pas la DB ;
- ne modifie pas le snapshot ;
- ne dépend pas d'un autre detector ;
- ne possède pas d'état global mutable.

---

# 6. CompositeDetector audit

Auditer `CompositeDetector`.

Questions :

- comment les detectors sont-ils enregistrés ?
- l'ordre est-il significatif ?
- l'ordre est-il documenté ?
- un detector peut-il empêcher les suivants de s'exécuter ?
- que se passe-t-il lorsqu'un detector échoue ?
- les erreurs sont-elles isolées ?
- les résultats sont-ils déterministes ?
- y a-t-il une duplication de logique avec `DeduplicatingDetector` ?

Important :

Si l'ordre n'a aucune signification métier, vérifier qu'il ne devient pas accidentellement une dépendance implicite.

---

# 7. Error isolation

Vérifier le comportement lorsqu'un detector individuel échoue.

Scénario :

```text
Detector A → success
Detector B → throws
Detector C → success
```

Déterminer le comportement attendu.

Options possibles :

```text
fail entire scan
```

ou :

```text
A success
B failure
C success
→ partial result
```

Ne pas changer le contrat automatiquement.

Déterminer d'abord ce qui est actuellement prévu par l'architecture.

Si le comportement n'est pas explicitement défini :

- définir le comportement minimal cohérent ;
- le documenter ;
- ajouter un test.

Un detector défaillant ne doit pas provoquer un comportement imprévisible.

---

# 8. Mutation audit

Rechercher les mutations de :

- `SiteSnapshot`
- `Detection`
- `Evidence`
- arrays de résultats
- catalog entries
- detector configuration

Le pipeline doit autant que possible fonctionner avec des données immuables.

Chercher notamment :

```text
array.push()
array.sort()
object.property = ...
```

sur des objets provenant d'une autre couche.

Attention particulièrement à :

```text
Array.prototype.sort()
```

qui mute le tableau.

Si une mutation est nécessaire et locale, elle peut rester.

Ne pas appliquer une immutabilité dogmatique à tout le repository.

---

# 9. Determinism audit

Le Step 13 a établi la déterminisme fonctionnelle.

Le Step 14 doit maintenant vérifier **pourquoi** elle existe.

Chercher les sources potentielles de nondéterminisme :

- `Map` iteration dépendante de l'insertion ;
- `Set` ;
- object keys ;
- filesystem traversal ;
- detector registration order ;
- network response ordering ;
- random values ;
- timestamps ;
- UUIDs ;
- locale-sensitive sorting ;
- case-sensitive sorting ;
- `JSON.stringify` utilisé comme clé ;
- async execution order.

Le pipeline final doit avoir un ordre stable.

---

# 10. Async / concurrency audit

Si le pipeline utilise de l'asynchronisme, auditer :

- `Promise.all`
- `Promise.allSettled`
- sequential execution
- concurrent detectors
- concurrent resource fetching

Déterminer si la concurrence peut modifier :

- detection order ;
- evidence order ;
- confidence ;
- error handling.

Ne pas paralléliser automatiquement.

La performance ne doit pas être obtenue au prix de la déterminisme.

---

# 11. Performance audit

Effectuer une analyse simple mais concrète.

Identifier :

- parsing répété ;
- regex compilées à chaque invocation ;
- parcours répétés du même HTML ;
- `JSON.stringify` inutiles ;
- copies massives de tableaux ;
- déduplication répétée ;
- tri répété ;
- recherche linéaire répétée dans le catalog ;
- construction répétée d'objets identiques.

Pour chaque problème :

```text
Current complexity
Potential impact
Evidence
Recommended action
```

Ne pas optimiser sans preuve.

Le but n'est pas de micro-optimiser un moteur qui traite actuellement quelques pages.

---

# 12. Detector performance characteristics

Pour chaque detector, documenter approximativement :

```text
Input surfaces
Algorithm
Typical complexity
Network access
DB access
Potential expensive operation
```

Exemple :

```text
HeaderDetector
→ O(number of headers)

MetaTagDetector
→ O(number of meta tags)

ScriptUrlDetector
→ O(number of scripts × signatures)
```

Adapter aux implementations réelles.

Identifier les detectors dont la complexité pourrait devenir problématique avec de très grosses pages.

---

# 13. Regex / matcher audit

Inspecter toutes les signatures.

Chercher :

- regex catastrophiques ;
- regex trop permissives ;
- regex sans boundaries ;
- `.*` inutiles ;
- case sensitivity incohérente ;
- substring matching dangereux ;
- compilation répétée ;
- signatures dupliquées.

Pour chaque matcher, déterminer :

```text
Precision
Potential false positives
Potential false negatives
Complexity
```

Ne pas modifier les fingerprints simplement pour les rendre "plus élégants".

Les golden tests du Step 13 constituent la référence comportementale.

Toute modification doit préserver les résultats attendus.

---

# 14. Technology catalog audit

Le catalogue est désormais la source de vérité pour :

```text
id
name
category
```

Vérifier :

- aucun doublon d'ID ;
- aucun doublon inattendu ;
- catégories cohérentes ;
- IDs stables ;
- detectors ne redéfinissent pas metadata ;
- signatures ne contiennent pas des metadata dupliquées ;
- catalog lookup déterministe.

Vérifier également que les detectors ne dépendent pas accidentellement de l'ordre du catalogue.

---

# 15. Evidence contract audit

Auditer les 8 variants d'`Evidence`.

Pour chaque variant :

- est-il réellement utilisé ?
- quelles informations contient-il ?
- est-il suffisamment précis ?
- peut-il être sérialisé sans ambiguïté ?
- possède-t-il une clé déterministe ?
- est-il compatible avec persistence ?
- peut-il produire des duplicates ?

Vérifier également :

```text
Detection
  technology
  confidence
  evidence[]
```

et l'invariant :

> Une Detection valide possède au moins une evidence.

Ne pas ajouter de nouveau type d'evidence.

---

# 16. Scoring layer audit

Le scoring a déjà été calibré.

Ne pas changer sa formule.

Auditer uniquement :

- responsabilité ;
- inputs ;
- outputs ;
- bornes ;
- NaN / Infinity handling ;
- déterminisme ;
- dépendance au nombre de sources ;
- séparation entre scoring et ranking.

Vérifier que :

```text
ScoringDetector
```

ne commence pas à accumuler des responsabilités qui devraient appartenir à d'autres couches.

---

# 17. Deduplication audit

Auditer `DeduplicatingDetector`.

Vérifier :

- clé d'evidence ;
- fusion ;
- ordre ;
- déduplication des detections ;
- comportement avec plusieurs detectors ;
- comportement avec evidences identiques ;
- comportement avec evidences similaires mais différentes.

Tester notamment :

```text
same technology
same evidence
```

et :

```text
same technology
different evidence
```

Le résultat attendu doit être explicitement documenté.

---

# 18. Configuration audit

Chercher les constantes et configurations dispersées.

Exemples :

```text
confidence thresholds
limits
known technologies
detector lists
resource limits
timeouts
```

Identifier les valeurs qui sont :

- correctement centralisées ;
- volontairement locales ;
- accidentellement dupliquées.

Ne pas créer un gigantesque `config.ts`.

La centralisation doit avoir une raison.

---

# 19. Test architecture audit

Le projet possède désormais plus de 800 tests.

C'est le bon moment pour vérifier leur organisation.

Classer les tests :

```text
unit
integration
pipeline
fixture/golden
crawler
persistence
architecture
```

Identifier :

- tests dupliqués ;
- tests trop fragiles ;
- helpers dupliqués ;
- assertions trop internes ;
- tests qui testent une implementation au lieu d'un contrat ;
- tests qui pourraient devenir coûteux.

Le but n'est pas de réduire le nombre de tests.

Le but est d'améliorer leur **signal-to-noise ratio**.

---

# 20. Test helpers audit

Inspecter les helpers créés récemment, notamment :

```text
test-helpers.ts
detector-fixtures.ts
```

Vérifier :

- responsabilité ;
- duplication ;
- API ;
- types ;
- dépendances ;
- lisibilité.

Les helpers de tests ne doivent pas devenir une seconde abstraction framework.

---

# 21. Persistence boundary audit

Vérifier la séparation :

```text
Domain
↓
Application
↓
Repository
↓
Drizzle/Postgres
```

ou l'architecture réelle.

Chercher :

- domain types couplés à Drizzle ;
- SQL dans application logic ;
- repository leak ;
- JSONB serialization logic dispersée ;
- reconstruction des Detection/Evidence fragile.

Le domain ne doit pas connaître les détails de PostgreSQL.

---

# 22. API boundary audit

Auditer :

```text
POST /api/scans
```

et la chaîne :

```text
route adapter
→ handler
→ executeScan
→ runScan
→ repository
```

Vérifier :

- validation URL ;
- validation input ;
- erreurs ;
- status codes ;
- serialization ;
- séparation business/infrastructure ;
- absence de business logic dans la route.

Ne pas refactorer simplement pour modifier la structure des fichiers.

---

# 23. Error model

Faire un inventaire des erreurs.

Identifier :

- crawler errors ;
- invalid URL ;
- detector errors ;
- persistence errors ;
- API errors ;
- parsing errors.

Vérifier si le projet possède une stratégie cohérente.

Éviter :

```text
catch (error) {
  return null;
}
```

ou équivalents qui masquent silencieusement les erreurs.

Mais ne pas introduire une hiérarchie massive d'Error classes sans besoin réel.

---

# 24. Dead code / duplication audit

Rechercher :

- fonctions non utilisées ;
- exports non utilisés ;
- types redondants ;
- helpers dupliqués ;
- constantes dupliquées ;
- anciens fichiers laissés après refactors ;
- commentaires obsolètes ;
- documentation contradictoire.

Pour chaque élément :

```text
Remove
Keep
Document
```

Ne supprimer que ce qui est clairement mort.

---

# 25. Documentation consistency

Comparer :

```text
docs/architecture/*
docs/Step*.md
README
package documentation
```

avec le code réel.

Chercher :

- architecture obsolète ;
- nombres de technologies incorrects ;
- anciens nombres de tests ;
- detectors manquants ;
- noms de fichiers obsolètes ;
- diagrammes incorrects ;
- responsabilités incorrectement décrites.

Corriger uniquement les incohérences identifiées.

---

# 26. Architecture fitness tests

Si le repository possède déjà des tests d'architecture, les auditer.

Sinon, créer uniquement quelques tests si une règle importante peut être vérifiée automatiquement.

Exemples pertinents :

```text
core must not import Next.js
detectors must not import DB implementation
detectors must not import web application
domain must not import Drizzle
```

Utiliser l'outil/convention déjà présente dans le repository si possible.

Ne pas créer un framework d'architecture custom complexe.

---

# 27. Refactoring policy

Pour chaque problème découvert, classer :

### P0 — Critical

Risque de :

- corruption ;
- nondéterminisme ;
- perte de données ;
- faux résultats systématiques ;
- architecture cassée.

### P1 — Important

Dette technique ayant un impact concret sur l'évolution.

### P2 — Minor

Amélioration de lisibilité/maintenance sans impact immédiat.

### Deferred

Problème réel mais prématuré à corriger maintenant.

Cette classification doit apparaître dans le rapport.

---

# 28. Minimal-change rule

Ne pas faire de refactor massif.

Chaque modification doit avoir une justification :

```text
Problem
→ Evidence
→ Minimal fix
→ Regression test
```

Éviter les changements du type :

```text
"Since we're here, let's rewrite..."
```

Le Step 14 n'est pas une réécriture.

---

# 29. Tests de hardening

Ajouter des tests uniquement pour les problèmes réellement découverts.

Quelques catégories possibles :

```text
detector-error-isolation.test.ts
pipeline-determinism.test.ts
architecture-boundaries.test.ts
catalog-invariants.test.ts
evidence-invariants.test.ts
```

Les noms doivent suivre les conventions du repository.

Ne pas créer tous ces fichiers si les tests existants couvrent déjà les invariants.

---

# 30. Benchmark optionnel

Si l'architecture le permet facilement, ajouter un micro-benchmark local du pipeline.

Mesurer :

```text
1 fixture
10 fixtures
100 fixtures
```

ou une représentation équivalente.

Mesurer uniquement :

```text
pipeline execution time
```

Pas besoin de benchmark scientifique.

L'objectif est d'avoir un ordre de grandeur et de détecter une éventuelle régression grossière.

Si cela nécessite une infrastructure importante, **ne pas le faire**.

Documenter simplement l'absence de benchmark.

---

# 31. Final architecture report

Créer :

```text
docs/Step14-report.md
```

Structure :

```markdown
# Step 14 — Detection Engine Hardening & Architecture Audit

## Executive Summary

## Current Architecture

## Package Boundaries

## Dependency Direction

## Public APIs

## Detector Contract

## Pipeline Audit

## Error Handling

## Determinism

## Mutation

## Performance

## Matcher Audit

## Technology Catalog

## Evidence Model

## Scoring

## Deduplication

## Persistence Boundary

## API Boundary

## Test Architecture

## Documentation Consistency

## Findings

### P0

### P1

### P2

### Deferred

## Changes Implemented

## Tests Added

## Validation

## Remaining Technical Debt

## Conclusion
```

Le rapport doit être honnête.

S'il n'y a pas de problème dans une section :

```text
No issue found.
```

Ne pas inventer du travail pour donner l'impression que l'étape a produit beaucoup de modifications.

---

# 32. Validation obligatoire

Exécuter :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular packages apps
```

Baseline :

```text
824 passed
9 skipped
143 files
0 circular dependencies
```

Reporter explicitement le delta :

```text
Tests before:
Tests after:
New tests:
Skipped:
Files before:
Files after:
```

---

# 33. Definition of Done

Step 14 est terminé lorsque :

- [ ] architecture réelle cartographiée ;
- [ ] package boundaries auditées ;
- [ ] dependency direction vérifiée ;
- [ ] public APIs auditées ;
- [ ] Detector contract vérifié ;
- [ ] CompositeDetector audité ;
- [ ] error handling audité ;
- [ ] mutation audit terminé ;
- [ ] determinism audit terminé ;
- [ ] async/concurrency audit terminé ;
- [ ] performance audit terminé ;
- [ ] matcher audit terminé ;
- [ ] technology catalog audit terminé ;
- [ ] evidence contract audit terminé ;
- [ ] scoring audit terminé ;
- [ ] deduplication audit terminé ;
- [ ] persistence boundary audit terminé ;
- [ ] API boundary audit terminé ;
- [ ] test architecture audit terminé ;
- [ ] dead code / duplication audit terminé ;
- [ ] documentation cohérente ;
- [ ] problèmes classés P0/P1/P2/Deferred ;
- [ ] corrections minimales appliquées ;
- [ ] tests de régression ajoutés lorsque nécessaire ;
- [ ] `Step14-report.md` créé ;
- [ ] validation complète réussie.

---

# Final principle

Après les Steps 1–13, DevLens possède désormais une base fonctionnelle et une couverture de détection sérieuse.

Le Step 14 doit répondre à une question différente :

> **"Est-ce que cette architecture peut continuer à grandir sans devenir progressivement fragile ?"**

Le résultat recherché n'est pas un gros diff.

Le meilleur résultat possible est :

```text
Audit
 ↓
Few real issues
 ↓
Minimal fixes
 ↓
Strong invariants
 ↓
Clear technical debt
 ↓
Stable architecture
```

Et si l'audit révèle que l'architecture est déjà saine, **ne force aucun refactor**.

La règle absolue :

**Architecture réelle > architecture théorique**

**Evidence > intuition**

**Minimal fix > rewrite**

**Regression protection > code churn**
