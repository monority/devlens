# Step 21 — Scan History & Results API

## Contexte

DevLens a terminé sa phase principale de hardening.

État actuel :

```text
32 technologies
6 detectors
8 evidence types
184 golden fixture tests
916 total tests
0 circular dependencies
```

Le pipeline de scan est maintenant stable :

```text
POST /api/scans
    ↓
executeScan
    ↓
runScan
    ↓
crawler
    ↓
detectors
    ↓
scoring
    ↓
persistResult
```

Les résultats sont déjà persistés en base.

Cependant, l'API permet actuellement principalement de **créer/exécuter un scan**.

Il manque maintenant une capacité produit fondamentale :

> **consulter les scans qui existent déjà.**

---

# Objectif

Ajouter une API de lecture permettant :

```text
GET /api/scans
GET /api/scans/:id
```

afin de pouvoir :

- lister les scans ;
- consulter un scan précis ;
- retrouver son statut ;
- consulter ses detections ;
- consulter son résultat ;
- distinguer les scans inexistants des scans échoués.

Cette étape doit exploiter la persistence existante plutôt que créer une nouvelle couche de stockage.

---

# 1. Audit préalable

Avant de coder, inspecter :

- `ScanResultRepository`
- PostgreSQL repository
- InMemory repository
- `ScanResult`
- `Scan`
- `ScanStatus`
- API `POST /api/scans`
- mapping response existant (`resultToResponse` ou équivalent)

Déterminer quelles données sont actuellement réellement persistées et lesquelles peuvent être exposées.

Ne pas inventer de nouveau modèle si les données existantes suffisent.

---

# 2. Repository read contract

Le repository actuel doit être étendu uniquement si nécessaire.

Déterminer les opérations minimales nécessaires :

```text
getById(scanId)
list(...)
```

Éviter d'ajouter :

```text
findByEverything
search
filter DSL
pagination framework
generic query builder
```

Le repository doit rester orienté métier.

---

# 3. `getById`

Ajouter une opération permettant de récupérer un résultat par son ID.

Comportement :

```text
existing ID
→ ScanResult

unknown ID
→ null / explicit not-found semantic
```

Choisir la convention cohérente avec le repository actuel.

La couche application doit rester indépendante de PostgreSQL.

---

# 4. Listing

Ajouter un listing minimal.

Le contrat initial doit rester volontairement simple :

```text
listScans()
```

ou équivalent.

Le résultat doit être déterministe.

Définir explicitement l'ordre.

Par exemple :

```text
createdAt DESC
```

mais conserver un tie-breaker stable :

```text
createdAt DESC
scanId ASC
```

si nécessaire.

Ne pas introduire de pagination tant qu'elle n'est pas nécessaire au produit actuel.

---

# 5. Persistence parity

Implémenter le nouveau read contract dans :

```text
InMemoryScanResultRepository
PostgresScanResultRepository
```

Les deux doivent avoir les mêmes sémantiques.

Tester notamment :

- scan existant ;
- scan absent ;
- zéro scan ;
- plusieurs scans ;
- ordre ;
- scan failed ;
- scan completed.

---

# 6. Application layer

Ne pas faire accéder l'API directement au repository.

Créer des opérations application explicites si nécessaire :

```text
getScan(...)
listScans(...)
```

La direction doit rester :

```text
API
 ↓
application
 ↓
repository
```

Pas :

```text
API
 ↓
database
```

---

# 7. GET `/api/scans/:id`

Ajouter un endpoint permettant de récupérer un scan.

Exemple conceptuel :

```text
GET /api/scans/scan_123
```

### Success

```text
200
```

avec le même contrat de représentation que le résultat POST lorsque pertinent.

### Unknown scan

```text
404
```

avec une erreur structurée.

Ne pas exposer une erreur PostgreSQL brute.

---

# 8. GET `/api/scans`

Ajouter le listing.

Réponse conceptuelle :

```json
{
  "scans": [
    ...
  ]
}
```

Utiliser un wrapper explicite plutôt qu'un tableau brut si cela correspond mieux au contrat API actuel.

Chaque entrée doit exposer uniquement les informations nécessaires.

Ne pas exposer de détails database.

---

# 9. Response contract

Réutiliser le mapping API existant lorsqu'il est applicable.

Éviter :

```text
GET response
≠
POST response
```

sans justification.

Les objets API doivent rester des représentations explicites et stables.

Vérifier :

- dates ;
- URL ;
- status ;
- detections ;
- evidence ;
- score ;
- errors ;
- nullability.

---

# 10. Failed scans

Un scan ayant échoué n'est pas un scan inexistant.

Exemple :

```text
GET /api/scans/failed-scan
```

doit retourner :

```text
200
```

si le scan existe et possède un état `failed`.

Alors que :

```text
GET /api/scans/unknown
```

doit retourner :

```text
404
```

Cette distinction doit être verrouillée par les tests.

---

# 11. Tests API

Ajouter les tests nécessaires.

### GET by ID

- existing completed scan ;
- existing failed scan ;
- unknown scan ;
- response shape ;
- evidence serialization ;
- date serialization.

### GET list

- empty database ;
- one scan ;
- multiple scans ;
- deterministic order ;
- completed + failed scans ;
- response shape.

### Error handling

- repository error ;
- controlled 500 response ;
- no database error leakage.

---

# 12. Tests repository

Ajouter les tests correspondant au nouveau contrat :

```text
getById
list
```

pour :

- InMemory ;
- PostgreSQL si l'infrastructure actuelle le permet.

Tester la parité sémantique.

---

# 13. Performance boundary

Le premier listing peut rester simple.

Ne pas implémenter :

- pagination ;
- cursor pagination ;
- full-text search ;
- filtering DSL ;
- caching ;
- Redis.

Mais documenter que le listing complet est volontairement adapté à la phase actuelle du produit.

Si un risque évident apparaît dans l'implémentation SQL, le signaler plutôt que construire prématurément une architecture.

---

# 14. API security / exposure

Auditer les champs retournés.

Ne jamais retourner :

- `DATABASE_URL` ;
- internal DB identifiers inutiles ;
- SQL errors ;
- stack traces ;
- internal implementation objects.

Les réponses GET doivent utiliser le même principe d'exposition contrôlée que le POST.

---

# 15. Documentation

Mettre à jour la documentation API existante.

Ajouter :

```text
GET /api/scans
GET /api/scans/:id
```

Documenter :

- request ;
- response ;
- status codes ;
- not-found semantics ;
- failed scan semantics ;
- ordering.

Créer :

```text
docs/Step21-report.md
```

Le rapport doit contenir :

1. Executive Summary
2. Existing persistence audit
3. Repository read contract
4. Application operations
5. GET by ID
6. GET listing
7. Response contract
8. Failed scan semantics
9. Repository tests
10. API tests
11. Performance considerations
12. Security/exposure audit
13. Changes made
14. Deferred features
15. Validation results

---

# Contraintes strictes

## Ne pas faire

- pas de frontend UI ;
- pas de dashboard ;
- pas de React components ;
- pas de pagination ;
- pas de search ;
- pas de filtering DSL ;
- pas de Redis ;
- pas de cache ;
- pas de GraphQL ;
- pas de tRPC ;
- pas de nouveau repository framework ;
- pas de changement du POST contract sans nécessité ;
- pas de changement du detector pipeline ;
- pas de changement du scoring ;
- pas de changement du crawler ;
- pas de nouveau detector ;
- pas de nouvelle technologie ;
- pas de nouvelle evidence ;
- pas de refactor massif.

## Principe

**Read existing data before inventing new data.**

Les résultats existent déjà.

Le Step 21 doit simplement rendre ces résultats accessibles proprement.

---

# Validation finale obligatoire

Exécuter :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps
```

Vérifier explicitement :

```text
POST /api/scans
GET /api/scans
GET /api/scans/:id
```

ainsi que :

```text
completed scan
failed scan
unknown scan
empty history
multiple scans
deterministic ordering
response serialization
```

Comparer :

- tests avant/après ;
- fichiers modifiés ;
- nouveaux endpoints ;
- nouvelles opérations repository ;
- nouveaux contrats application.

## Critère de réussite

À la fin du Step 21 :

- un scan existant peut être récupéré par ID ;
- plusieurs scans peuvent être listés ;
- les scans failed restent consultables ;
- un scan inexistant retourne 404 ;
- InMemory et PostgreSQL ont les mêmes sémantiques ;
- les réponses API n'exposent aucun détail interne ;
- l'ordre du listing est déterministe ;
- le POST existant continue de fonctionner ;
- aucune nouvelle architecture inutile n'est introduite.

**On quitte maintenant le mode audit : DevLens commence à devenir un produit utilisable.**
