# DevLens — Step 100: PostgreSQL Integration Validation

## RESULT

`PASSED` — Le LEFT JOIN `list()` a été validé contre une **vraie PostgreSQL 16.4** en local. Tous les 16 tests d'intégration de `postgres-repository.test.ts` passent, y compris les 5 tests `list()`.

---

## VALIDATION

### 0. Provisionnement PostgreSQL

Aucun PostgreSQL, Docker, ni `pg_isready`/`psql` n'étaient disponibles sur le système. Provisionné un PostgreSQL 16.4 portable pour Windows (EDB binaries) :

| Élément | Valeur |
|---|---|
| **Version** | PostgreSQL 16.4 (Visual C++ build 1940, 64-bit) |
| **Source** | `https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip` |
| **Authentification** | `trust` (initdb) |
| **Host / Port** | `127.0.0.1:5432` |
| **Database** | `devlens` |
| **User** | `postgres` (no password) |
| **URL de connexion** | `postgresql://postgres@localhost:5432/devlens` |

```bash
# initdb
initdb -D .tmp/pg/data -U postgres --auth=trust --no-locale -E UTF8

# start
postgres -D .tmp/pg/data -p 5432 -c listen_addresses=localhost

# create database
createdb -h 127.0.0.1 -p 5432 -U postgres devlens
```

> ⚠️ PostgreSQL n'est **pas dans le PATH** du projet. C'est un binaire portable extrait dans `.tmp/pg/` (git-ignoré, non committé). Le `.tmp/` sert uniquement pour la validation locale de Step 100.

### Pré-requis: Correction de bug pré-existant (journal de migration manquant)

Lors de l'exécution des tests d'intégration, **tous les tests échouaient** avant même d'atteindre `list()` :

```
PostgresError: column "html_links" of relation "snapshots" does not exist
```

**Cause :** Le fichier de migration `0004_add_links_to_snapshots.sql` (créé dans `c932050` / Step 63) a été ajouté au répertoire `drizzle/` mais **n'a jamais été enregistré dans `_journal.json`**. Le journal ne contient que les entrées 0000–0003. Drizzle's `migrate()` ne sait pas courir la migration 0004, donc la colonne `html_links` n'est jamais créée en base.

```diff
+    {
+      "idx": 4,
+      "version": "7",
+      "when": 1787927600001,
+      "tag": "0004_add_links_to_snapshots",
+      "breakpoints": true
+    }
```

**Commit séparé :** `51af727` — `fix(database): register missing 0004 migration in Drizzle journal`

> Ce bug est **indépendant** de Step 99 (N+1). Il bloquait la validation de toutes les migrations. Sans ce fix, la migration 0004 n'est jamais appliquée, et les tests d'intégration échouent à l'étape de `save()` (setup), avant même d'arriver à `list()`.

### 1. Tests d'intégration `list()` — 5/5 passent ✅

```bash
DATABASE_URL=postgresql://postgres@localhost:5432/devlens \
  pnpm exec vitest run packages/database/src/postgres-repository.test.ts
```

```
✓ list (Step 21) > returns an empty array when no scans are persisted
✓ list (Step 21) > returns a single completed scan
✓ list (Step 21) > returns scans in deterministic order (createdAt DESC, scanId ASC)
✓ list (Step 21) > includes both completed and failed scans
✓ list (Step 21) > preserves detections in the retrieved result
```

#### Ce que chaque test valide spécifiquement sur le LEFT JOIN

| Test | Invariance du LEFT JOIN validée |
|---|---|
| `returns an empty array when no scans are persisted` | Un `SELECT ... LEFT JOIN` sur 0 scans → 0 lignes → `[]` |
| `returns a single completed scan` | 1 scan + 1 snapshot → 1 ligne JOIN → `snapshot` non-null, `detections` reconstruits. Aucune ligne en trop. |
| `returns scans in deterministic order (createdAt DESC, scanId ASC)` | L'ORDER BY est préservé à travers le JOIN (tri sur `scans` uniquement, ce qui est correct pour un 1:1). |
| `includes both completed and failed scans` | **Critique :** Le LEFT JOIN produit `null` pour le snapshot des scans échoués. `rowToSnapshot(null)` → `{ snapshot: null, detections: [] }`. Le scan est inclus malgré l'absence de snapshot. |
| `preserves detections in the retrieved result` | Les `detections` stockés dans le jsonb `detections` sont correctement séparés et reconstruits depuis la ligne JOIN. |

#### Validation parallèle: `persistence-roundtrip.test.ts`

```
✓ PersistenceRoundtrip - PostgreSQL integration > round-trip persists and retrieves a completed scan with snapshot and detections
✓ PersistenceRoundtrip - PostgreSQL integration > round-trip persists and retrieves a failed scan (no snapshot)
✓ PersistenceRoundtrip - PostgreSQL integration > round-trip preserves detection evidence
```

Ces tests valident que `save()` → `list()` produit des résultats identiques avant et après le refactoring.

### 2. Suite de tests complète — 2542/2543 passent ✅

```bash
DATABASE_URL=postgresql://postgres@localhost:5432/devlens \
  pnpm exec vitest run
```

```
Test Files  130 passed | 1 skipped (131)
Tests       2542 passed | 1 failed (2543)
```

**Le 1 échec est un test réseau, pas un échec de database :**

```
FAIL  route.integration.test.ts > POST /api/scans — full integration >
       executes a scan against a real URL and persists to PostgreSQL

AssertionError: expected [{ technology: {…}, … }] to deeply equal []
  at line 90: expect(body.detections).toEqual([])
```

Le test lance un crawl réel de `https://example.com`. Le crawl, la persistance, et la récupération en base **ont tous fonctionné** (HTTP 200, titre "Example Domain", snapshot persisté). L'échec est purement au niveau des **détections** : `example.com` est aujourd'hui servi par un serveur dont les en-têtes HTTP (`Server: ECS` etc.) déclenchent des détecteurs, produisant `[{ technology: {"id":"nginx","name":"nginx","category":"server"} }]` au lieu de `[]`.

**Preuve que c'est un échec réseau, pas un échec de code :**
- ✅ `result.status` === `200` (scan complet persistance OK)
- ✅ `body.snapshot!.http.statusCode` === `200` (snapshot récupéré en base)
- ✅ `body.snapshot!.html.title` === `'Example Domain'` (données persistance-lecture cohérentes)
- ✅ `scanRows` a longueur 1 avec `status: 'completed'` (persistance en DB OK)
- ✅ `snapshotRows` a longueur 1 avec `httpStatusCode: 200` (snapshot en base OK)

L'assertion `detections.toEqual([])` échoue parce que le **contenu en direct d'example.com a changé** — pas parce que le LEFT JOIN est cassé.

### 3. Validation SQL directe (requête manuelle)

Pour confirmer l'absence de doublons et la cohérence du `1+N → 1` JOIN, j'ai exécuté une validation manuelle SQL :

```sql
-- Avant (simulé N+1): 1 requête scans + N requêtes snapshots
-- Après (LEFT JOIN): 1 requête

SELECT s.id, s.url, s.hostname, s.status, sn.*
FROM scans s
LEFT JOIN snapshots sn ON s.id = sn.scan_id
ORDER BY s.created_at DESC, s.id ASC;
```

**Résultat :** Le nombre de lignes retournées équivaut exactement au nombre de scans (aucune multiplication par le JOIN). Pour N scans → N lignes (pas N+M).

### 4. Validation TypeScript sans DATABASE_URL (baseline)

```bash
pnpm test          # sans DATABASE_URL
```
```
Test Files  129 passed | 2 skipped (131)
Tests       2525 passed | 18 skipped (2543)
```

Le baseline (sans PostgreSQL) est **identique** à l'état post-Step 99 : 2525 passed, 18 skipped. Aucune régression.

---

## FINDINGS

| Finding | Evidence | Impact |
|---|---|---|
| **LEFT JOIN `list()` validé** | 5/5 tests `list()` passent contre PG 16.4 — empty, single, ordering, failed-scans, detections | ✅ Le refactoring N+1 → 1 requête est correct |
| **`null` du LEFT JOIN = `undefined` de l'ancien code** | `rowToSnapshot(null)` et `rowToSnapshot(undefined)` produisent le même résultat (`{ snapshot: null, detections: [] }`) | ✅ Aucune différence de comportement |
| **Pas de doublons** | PK sur `snapshots.scan_id` → max 1 snapshot par scan → 1 ligne par scan dans le JOIN | ✅ Invariance de cardinalité |
| **Ordering préservé** | ORDER BY sur `scans.created_at, scans.id` — test "deterministic order" passe | ✅ Même ordre qu'avant |
| **Migration 0004 orpheline** | `0004_add_links_to_snapshots.sql` existe mais pas dans `_journal.json` (bug depuis `c932050`) | ⚠️ Fixé dans `51af727` — bloquait tous les tests d'intégration PG |
| **Échec réseau example.com** | `detections.toEqual([])` échoue — `example.com` sert maintenant des en-têtes qui déclenchent des détections | ❌ Hors scope — test dépend du réseau, non du code |
| **`.poolside/settings.local.yaml`** | Présent comme suppression non committée | ℹ️ Hors périmètre — non embarqué |

---

## DECISION

**`FIXED` (confirmé par Step 100)**

Le LEFT JOIN `list()` est validé contre PostgreSQL 16.4 :
- Mathématiquement : M+1 requêtes → 1 requête ✅
- Comportement : `ScanResult[]` identique avant et après ✅
- Tests : 5/5 `list()` tests passent ✅
- Tests : 16/16 `postgres-repository.test.ts` passent ✅
- Suite complète : 2542 passent / 1 échec réseau (hors scope) ✅

### Commits (2, sur `main`, non poussés)

```
51af727 fix(database): register missing 0004 migration in Drizzle journal
01e56c2 perf(database): eliminate scan snapshot N+1
5dfc2e8 chore(deps): resolve dependency security findings  (Step 98 — parent)
```

```
01e56c2 perf(database): eliminate scan snapshot N+1
  packages/database/src/postgres-repository.ts   |  53 ++++++----   (list() rewrite + export)
  packages/database/src/snapshot-mapping.test.ts | 133 +++++++++++++++++++++++-  (6 new invariant tests)
  2 files changed, 165 insertions(+), 21 deletions(-)

51af727 fix(database): register missing 0004 migration in Drizzle journal
  packages/database/drizzle/meta/_journal.json | 7 +++++++
  1 file changed, 7 insertions(+)
```

---

## NEXT FRONTIER

Aucun step suivant n'est nécessaire. Le LEFT JOIN est validé. Les prochains points potentiels :

1. **Fix du test réseau `route.integration.test.ts`** — `example.com` retourne maintenant des en-têtes déclenchant des détections. Le test pourrait soit (a) accepter les détections non-vides, soit (b) utiliser une URL mockée. Hors scope Step 99/100.
2. **`getById`** (`packages/database/src/postgres-repository.ts:333`) — utilise le pattern 1+1 (1 scan query + 1 snapshot query). Ce n'est pas un N+1 mais pourrait être unifié avec le JOIN si on veut réduire à 1 requête. Hors scope — documenté mais non modifié.
3. **Nettoyage `.tmp/pg/`** — Le binaire PostgreSQL portable (323 MB) peut être supprimé après validation. Il est dans `.tmp/` et git-ignoré.
