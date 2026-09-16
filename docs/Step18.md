# Step 18 — Persistence & Database Hardening

## Contexte

DevLens possède maintenant :

- un domaine stable ;
- un crawler stable ;
- un detector engine déterministe ;
- un pipeline de production centralisé ;
- un lifecycle de scan cohérent ;
- une API contractuelle ;
- une configuration auditée ;
- une persistance PostgreSQL + Drizzle ;
- un repository InMemory pour les tests.

Architecture actuelle :

```text
Web / Worker
      ↓
application
      ↓
ScanResultRepository
      ↓
database
      ↓
PostgreSQL / InMemory
```

Les Steps 15–17 ont notamment établi :

- lifecycle `pending → running → completed/failed` ;
- timestamps cohérents ;
- idempotence ;
- last-write-wins documenté ;
- configuration DB explicite ;
- absence de fallback DB silencieux ;
- Web/Worker parity.

## Objectif

Effectuer un audit complet de la couche persistence afin de vérifier que PostgreSQL et InMemory respectent réellement le même contrat et que la persistance reste correcte sous :

- succès ;
- échec ;
- répétition ;
- données partielles ;
- contraintes DB ;
- erreurs transactionnelles ;
- migrations ;
- évolution du schéma.

> **Le scan est maintenant fiable jusqu'à la couche application. Vérifions que son état reste fiable une fois écrit en base.**

---

# 1. Audit du modèle persistant

Inspecter :

- schema Drizzle ;
- migrations ;
- `ScanResultRepository` ;
- PostgreSQL repository ;
- InMemory repository ;
- mapping domain ↔ database.

Documenter précisément :

```text
Scan
ScanResult
Detection
Evidence
Snapshot
Technology
```

et leur représentation persistée.

Vérifier :

- types ;
- nullable/non-nullable ;
- defaults ;
- timestamps ;
- IDs ;
- enum/status ;
- JSON/JSONB ;
- relations éventuelles.

Ne rien changer si le modèle actuel est cohérent.

---

# 2. PostgreSQL ↔ InMemory parity

Comparer méthodiquement les deux implémentations.

Pour chaque opération :

```text
create
update
upsert
get
delete
```

vérifier :

- résultat ;
- comportement absent ;
- comportement duplicate ;
- overwrite ;
- timestamps ;
- erreurs ;
- snapshot cleanup ;
- ordering.

Construire si utile une matrice :

| Operation | InMemory | PostgreSQL | Same semantics |
| --------- | -------- | ---------- | -------------- |
| insert    | ...      | ...        | ...            |
| update    | ...      | ...        | ...            |
| upsert    | ...      | ...        | ...            |
| delete    | ...      | ...        | ...            |
| missing   | ...      | ...        | ...            |

L'objectif est une **parité comportementale**, pas une implémentation identique.

---

# 3. Transaction boundaries

Auditer les opérations qui modifient plusieurs tables ou plusieurs éléments persistants.

Identifier :

```text
atomic operation
vs
multiple independent writes
```

Vérifier si une opération partiellement réussie peut laisser la DB dans un état incohérent.

Si une transaction est déjà présente, vérifier qu'elle couvre réellement le boundary métier attendu.

Si aucune transaction n'est nécessaire actuellement, le documenter.

Ne pas introduire une abstraction transactionnelle générique.

---

# 4. Upsert / idempotence

Revalider le comportement :

```text
same scan ID
→ repeated persistence
→ same logical state
```

Vérifier les contraintes PostgreSQL :

- unique keys ;
- primary keys ;
- `ON CONFLICT` ;
- update behavior ;
- stale data cleanup.

Attention aux différences entre :

```text
application-level idempotence
database-level idempotence
```

Les deux doivent être cohérentes.

Ajouter un test uniquement si un edge case réel n'est pas couvert.

---

# 5. Partial failure

Auditer les scénarios :

### Scan completed

```text
scan
 ↓
result
 ↓
persist
```

### Scan failed

```text
scan
 ↓
failed result
 ↓
persist
```

### Persistence failure

Simuler si possible :

```text
result
 ↓
repository error
```

Vérifier que :

- l'erreur n'est pas silencieusement avalée ;
- l'état en mémoire reste cohérent ;
- l'API/Worker reçoit le bon signal ;
- aucune fausse réussite n'est produite.

---

# 6. JSONB / Evidence persistence

Auditer particulièrement les données complexes :

```text
evidence
snapshot
html
headers
scripts
resources
links
```

Vérifier :

- sérialisation ;
- désérialisation ;
- dates ;
- URLs ;
- `null` ;
- tableaux vides ;
- objets imbriqués ;
- compatibilité avec le schéma.

Les 8 types d'evidence doivent pouvoir traverser :

```text
domain
 ↓
repository
 ↓
PostgreSQL JSONB
 ↓
repository
 ↓
domain
```

sans perte sémantique.

Ne pas modifier le modèle d'evidence.

---

# 7. Migration audit

Inspecter toutes les migrations existantes.

Vérifier :

- ordre ;
- numérotation ;
- cohérence avec schema ;
- contraintes ;
- indexes ;
- nullable ;
- defaults ;
- migrations destructives éventuelles.

Comparer :

```text
Drizzle schema
        ↕
migration history
        ↕
repository queries
```

Identifier les divergences.

Ne pas squasher les migrations existantes.

Ne pas réécrire l'historique.

Si une nouvelle migration est réellement nécessaire, créer la prochaine migration uniquement.

---

# 8. Indexes & query patterns

Auditer les queries réellement utilisées.

Identifier les accès :

- par scan ID ;
- par target URL ;
- par status ;
- par timestamp ;
- autres.

Vérifier que les indexes existants correspondent aux queries réelles.

Ne pas ajouter des indexes spéculatifs.

Ne pas optimiser avant d'avoir identifié un accès réellement concerné.

---

# 9. Connection lifecycle

Auditer le client PostgreSQL :

- création ;
- lazy/eager initialization ;
- pool ;
- fermeture ;
- erreurs de connexion ;
- worker lifecycle ;
- test lifecycle.

Vérifier particulièrement le comportement du Worker :

```text
startup
 ↓
DB client
 ↓
scan
 ↓
persistence
 ↓
process exit
```

Éviter les connexions persistantes inutiles ou les ressources qui empêchent le process de terminer.

---

# 10. Concurrency

Le Step 15 a documenté :

> last-write-wins

Réévaluer ce choix au niveau DB.

Vérifier :

- deux écritures simultanées du même scan ;
- ordering ;
- transaction isolation ;
- stale overwrite ;
- duplicate insertion.

Ne pas implémenter optimistic locking ou versioning sauf si l'audit démontre que le modèle actuel est incorrect pour le produit actuel.

Si `last-write-wins` reste acceptable, le documenter explicitement.

---

# 11. Repository contract

Auditer l'interface :

```text
ScanResultRepository
```

Vérifier qu'elle expose uniquement les opérations réellement nécessaires à `application`.

Elle ne doit pas exposer :

- Drizzle ;
- SQL ;
- PostgreSQL types ;
- implementation details.

Le package `application` doit rester indépendant de la technologie de persistence.

---

# 12. Error mapping

Vérifier la frontière :

```text
PostgreSQL error
      ↓
database layer
      ↓
application
      ↓
API / Worker
```

Les erreurs DB ne doivent pas être transformées silencieusement en succès.

Vérifier également que les erreurs DB sensibles ne sont pas directement exposées à l'API.

Ne pas créer une hiérarchie d'erreurs massive.

---

# 13. Persistence tests

Compléter les tests uniquement là où des contrats réels ne sont pas verrouillés.

Priorités :

1. PostgreSQL/InMemory semantic parity ;
2. JSONB round-trip ;
3. duplicate/upsert ;
4. stale snapshot cleanup ;
5. partial failure ;
6. missing record ;
7. concurrency edge cases si testables proprement.

Les tests PostgreSQL doivent être ajoutés uniquement si l'infrastructure de test existante permet de le faire proprement.

Ne pas imposer Docker/Testcontainers si cela n'existe pas déjà.

---

# 14. Documentation

Mettre à jour si nécessaire :

```text
docs/architecture/persistence.md
docs/architecture/database.md
```

Créer :

```text
docs/Step18-report.md
```

Le rapport doit contenir :

1. Executive Summary
2. Persistence model
3. Repository contract
4. InMemory/PostgreSQL parity
5. Transactions
6. Upsert/idempotence
7. Partial failure
8. JSONB/evidence persistence
9. Migration audit
10. Index/query audit
11. Connection lifecycle
12. Concurrency
13. Error mapping
14. Changes made
15. Deferred findings
16. Validation results

---

# Contraintes strictes

## Ne pas faire

- pas de nouvel ORM ;
- pas de changement de Drizzle ;
- pas de nouvelle database ;
- pas de Redis ;
- pas de cache ;
- pas de queue ;
- pas de CQRS ;
- pas d'event sourcing ;
- pas de repository framework ;
- pas d'optimistic locking sans problème démontré ;
- pas de nouvelle abstraction transactionnelle générique ;
- pas de changement API ;
- pas de changement lifecycle ;
- pas de changement detector pipeline ;
- pas de changement scoring ;
- pas de nouveau detector ;
- pas de nouveau technology ;
- pas de nouveau evidence type ;
- pas de migration destructive ;
- pas de squash des migrations ;
- pas d'index spéculatif.

## Principe

**Audit first, migration second.**

Le schéma actuel est probablement déjà suffisamment bon.

Le but du Step 18 est de démontrer sa correction et de corriger uniquement les problèmes concrets.

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

Comparer le nombre de tests avant/après.

Le rapport doit explicitement indiquer :

- migrations inspectées ;
- tables inspectées ;
- repositories inspectés ;
- changements DB éventuels ;
- tests ajoutés ;
- problèmes réellement corrigés ;
- comportements volontairement conservés ;
- findings différés ;
- confirmation que l'API et le detector engine sont inchangés.

## Critère de réussite

À la fin du Step 18 :

- PostgreSQL et InMemory respectent le même contrat métier ;
- les écritures importantes sont atomiques lorsque nécessaire ;
- les upserts sont réellement idempotents ;
- les JSONB/evidence survivent correctement au round-trip ;
- les migrations correspondent au modèle actuel ;
- les queries disposent uniquement des indexes justifiés ;
- les erreurs de persistence ne sont pas avalées ;
- le repository reste indépendant de PostgreSQL ;
- les limites de concurrence sont explicites ;
- aucune dette architecturale artificielle n'a été introduite.
