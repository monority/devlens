# DevLens — Step 15 — Scan Lifecycle & Orchestration Hardening

## Context

DevLens vient de terminer le Step 14 — Detection Engine Hardening & Architecture Audit.

État actuel :

- 29 technologies dans le catalogue
- 6 détecteurs
- Pipeline production centralisé via `createProductionDetector()`
- Pipeline :
  `CompositeDetector → DeduplicatingDetector → ScoringDetector`
- `SiteSnapshot` et `HttpCrawler` audités et durcis
- Golden fixtures : 109 tests
- Total actuel : ~829 tests passed, 9 skipped
- TypeScript strict
- ESLint + Prettier clean
- Build clean
- Madge : aucune dépendance circulaire
- Architecture en couches :
  `core → crawler/detectors → application → database → web/worker`

Le moteur de détection est maintenant considéré comme stable.

Le prochain objectif est de **durcir le cycle de vie complet d'un scan** et l'orchestration applicative.

Principe directeur :

> Un scan doit avoir un cycle de vie explicite, déterministe et cohérent, quel que soit le point d'entrée (Web API ou Worker).

---

# 1. Objectif

Auditer en profondeur :

```text
POST /api/scans
      ↓
createScan
      ↓
executeScan
      ↓
runScan
      ↓
Crawler
      ↓
SiteSnapshot
      ↓
ProductionDetector
      ↓
ScanResult
      ↓
persistResult
      ↓
Database
```

et le chemin Worker :

```text
Worker
  ↓
runScan
  ↓
persistResult
```

L'objectif n'est PAS d'ajouter des fonctionnalités.

Il faut d'abord déterminer si :

- les transitions de statut sont cohérentes ;
- les erreurs sont correctement traduites ;
- un scan échoué reste correctement persisté ;
- les timestamps sont cohérents ;
- les responsabilités sont correctement séparées ;
- Web et Worker ont exactement les mêmes invariants ;
- une erreur à chaque étape laisse le système dans un état cohérent ;
- les résultats ne peuvent pas être partiellement ou silencieusement perdus.

---

# 2. Audit obligatoire avant toute modification

Inspecter au minimum :

```text
packages/core/
packages/application/
packages/crawler/
packages/database/
apps/web/
apps/worker/
```

Identifier précisément :

- `Scan`
- `ScanStatus`
- `ScanError`
- `createScan`
- `runScan`
- `executeScan`
- `persistResult`
- `ScanResult`
- `ScanResultRepository`
- `InMemoryScanResultRepository`
- `PostgresScanResultRepository`
- `handler.ts`
- `route.ts`
- `worker/main.ts`

Ne pas supposer leur comportement.

Lire le code et les tests existants avant de modifier quoi que ce soit.

---

# 3. Construire une machine à états explicite

Documenter l'état actuel.

Le cycle attendu doit être analysé sous cette forme :

```text
pending
   ↓
running
   ↓
completed
```

ou :

```text
pending
   ↓
running
   ↓
failed
```

Vérifier notamment :

- `pending → running`
- `running → completed`
- `running → failed`
- impossibilité de revenir vers `pending`
- impossibilité de passer directement `pending → completed` si le code actuel ne le permet pas
- impossibilité de modifier un scan terminé accidentellement

Ne pas ajouter une nouvelle FSM si le domaine actuel n'en a pas besoin.

Si les invariants sont déjà correctement imposés par les fonctions existantes, conserver l'architecture actuelle et renforcer uniquement les tests/documentation.

---

# 4. Audit de `runScan`

Vérifier précisément :

### Success

```text
pending
→ running
→ crawler success
→ detector success
→ completed
```

Le résultat final doit contenir :

- scan
- snapshot
- detections
- statut `completed`

### Crawl failure

Tester :

- timeout
- network error
- invalid target
- blocked hostname / SSRF
- resource too large

Attendu :

```text
pending
→ running
→ failed
```

avec :

- code d'erreur préservé ;
- message cohérent ;
- aucune détection fictive ;
- snapshot absent ou présent uniquement si le contrat actuel le prévoit explicitement.

Ne pas changer le contrat simplement pour obtenir une préférence personnelle.

---

# 5. Audit des erreurs inattendues

Tester une erreur non prévue provenant de :

- crawler ;
- detector ;
- repository ;
- orchestration.

Vérifier la distinction entre :

### Domain failure

Exemple :

```text
CrawlError
```

→ devient un `ScanError` cohérent.

### Unexpected application failure

Exemple :

```text
throw new Error("unexpected")
```

→ devient :

```text
ScanError {
  code: "UNKNOWN_ERROR"
}
```

sans fuite d'informations sensibles dans l'API.

### Persistence failure

Vérifier que l'erreur de persistence reste une erreur d'infrastructure et ne soit pas artificiellement transformée en erreur de crawl.

---

# 6. Audit de `ScanResult`

Vérifier que `ScanResult` est cohérent dans tous les cas.

Construire une matrice :

| Scenario                  | status    | snapshot | detections | error           |
| ------------------------- | --------- | -------- | ---------- | --------------- |
| success                   | completed | yes      | yes        | none            |
| crawl timeout             | failed    | ?        | ?          | timeout         |
| network error             | failed    | ?        | ?          | network_error   |
| blocked target            | failed    | ?        | ?          | invalid/blocked |
| detector unexpected error | failed    | ?        | ?          | UNKNOWN_ERROR   |
| persistence failure       | ?         | ?        | ?          | infrastructure  |

Les `?` doivent être déterminés à partir du contrat actuel.

Ne pas inventer un nouveau modèle.

---

# 7. Audit des timestamps

Inspecter les timestamps du domaine :

- `createdAt`
- `startedAt`
- `completedAt`
- éventuels autres timestamps.

Vérifier :

```text
createdAt <= startedAt <= completedAt
```

lorsqu'ils existent.

Tester :

- scan terminé ;
- scan échoué ;
- erreur avant démarrage ;
- erreur pendant le crawl.

Vérifier également :

- pas de timestamp généré plusieurs fois inutilement ;
- pas de `Date.now()` dans plusieurs couches pour représenter le même événement ;
- comportement déterministe des tests via injection/mock si nécessaire.

Ne pas introduire une abstraction d'horloge complexe si elle n'est pas nécessaire.

---

# 8. Audit de la persistence

Inspecter les deux repositories :

```text
InMemoryScanResultRepository
PostgresScanResultRepository
```

Ils doivent respecter le même contrat observable.

Comparer :

- create/upsert ;
- completed scan ;
- failed scan ;
- snapshot ;
- detections ;
- error ;
- timestamps ;
- idempotence éventuelle.

Vérifier notamment qu'un scan échoué ne laisse pas :

- un ancien snapshot obsolète ;
- des detections d'un run précédent ;
- un statut `completed` ;
- des données incohérentes entre `scans` et `snapshots`.

Pour PostgreSQL, vérifier les transactions existantes.

Ne pas modifier le schéma DB sauf si un véritable problème de cohérence est découvert.

---

# 9. Idempotence

Déterminer le comportement actuel lorsqu'un même résultat est persisté plusieurs fois.

Tester :

```text
persist(result)
persist(result)
```

et vérifier qu'il n'y a pas :

- duplication ;
- corruption ;
- changement inattendu des detections ;
- snapshot fantôme.

Si l'opération n'est pas censée être idempotente, documenter explicitement ce fait au lieu de créer une abstraction inutile.

---

# 10. Web / Worker parity

Vérifier que Web et Worker utilisent :

- le même detector factory ;
- le même `runScan` ;
- les mêmes règles de lifecycle ;
- les mêmes erreurs ;
- les mêmes repositories/contracts là où applicable.

Construire une petite matrice :

| Concern           | Web | Worker | Same contract |
| ----------------- | --- | ------ | ------------- |
| detector          |     |        |               |
| crawler           |     |        |               |
| runScan           |     |        |               |
| persistence       |     |        |               |
| error translation |     |        |               |
| lifecycle         |     |        |               |

Le Worker ne doit pas contenir une logique métier différente du Web.

---

# 11. API contract

Auditer `POST /api/scans`.

Tester :

### Validation

- malformed JSON
- missing URL
- invalid URL
- unsupported protocol
- empty URL

### Successful scan

Vérifier précisément :

```json
{
  "scan": {
    "status": "completed"
  },
  "snapshot": {},
  "detections": []
}
```

selon le contrat actuel.

### Failed scan

Vérifier que le comportement actuel documenté est respecté :

```text
HTTP 200
+
scan.status = failed
+
scan.error
```

si le code actuel confirme ce contrat.

Ne pas transformer automatiquement les erreurs métier en HTTP 4xx/5xx.

### Infrastructure failure

Vérifier :

```text
HTTP 500
```

et absence de fuite du message interne.

---

# 12. Concurrency / duplicate execution

Auditer sans implémenter prématurément une queue ou un système de locking.

Question à résoudre :

> Que se passe-t-il si deux scans indépendants ciblent exactement la même URL simultanément ?

Puis :

> Que se passe-t-il si deux écritures concurrentes concernent le même `scanId` ?

Ne pas ajouter de locking si le modèle actuel ne l'exige pas.

Documenter simplement les garanties actuelles et les limites.

---

# 13. Mutation safety

Vérifier que :

```text
runScan()
```

ne modifie pas :

- le target original ;
- le crawler ;
- le snapshot avant détection ;
- les detections après scoring ;
- les résultats déjà persistés.

Réutiliser les principes établis au Step 14.

Ajouter des tests uniquement si un véritable trou de couverture existe.

---

# 14. Test strategy

Créer uniquement les tests nécessaires.

Priorité aux tests contractuels.

Créer si pertinent :

```text
scan-lifecycle.test.ts
scan-error-handling.test.ts
scan-result-contract.test.ts
repository-parity.test.ts
```

Ne pas créer quatre fichiers si deux suffisent.

Tester au minimum :

### Lifecycle

- success
- crawl failure
- unexpected detector error

### Error mapping

- CrawlError preservation
- UNKNOWN_ERROR
- persistence error separation

### Result invariants

- completed result
- failed result
- detections consistency
- snapshot consistency

### Persistence

- success round-trip
- failed scan round-trip
- no stale snapshot
- idempotent behavior if contract promises it

### Timestamp invariants

- created/start/completion ordering
- failure timestamps

### Determinism

Deux executions avec le même crawler/detector mock doivent produire des résultats équivalents, à l'exception des timestamps/IDs lorsqu'ils sont volontairement générés.

---

# 15. Important — ne pas sur-architecturer

Interdictions :

- pas de nouvelle state-machine framework ;
- pas d'event sourcing ;
- pas de CQRS ;
- pas de queue ;
- pas de retry framework ;
- pas de worker orchestration framework ;
- pas de nouvelle abstraction repository inutile ;
- pas de changement du detector pipeline ;
- pas de nouveau detector ;
- pas de nouvelle technologie ;
- pas de nouvelle evidence ;
- pas de changement du scoring ;
- pas de Playwright ;
- pas de nouvelle dépendance externe sans nécessité démontrée.

Le but est de **durcir le système existant**, pas de le réécrire.

---

# 16. Documentation

Mettre à jour uniquement les documents réellement concernés.

Probablement :

```text
docs/architecture/application.md
docs/architecture/persistence.md
docs/architecture/api.md
docs/architecture/overview.md
```

Documenter :

- lifecycle réel ;
- error mapping ;
- résultat success/failure ;
- responsabilités Web/Worker ;
- persistence semantics ;
- invariants temporels si présents.

Ne pas recopier toute l'implémentation dans la documentation.

Créer :

```text
docs/Step15-report.md
```

avec :

1. Executive Summary
2. Current Lifecycle
3. State Transition Matrix
4. Error Model
5. ScanResult Contract
6. Timestamp Audit
7. Repository Audit
8. Web/Worker Parity
9. Tests Added
10. Changes
11. Validation
12. Deferred Work

---

# 17. Validation obligatoire

À la fin :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps
```

Toutes les commandes doivent passer.

Comparer le nombre de tests avant/après.

Ne jamais déclarer une validation réussie sans réellement exécuter les commandes.

---

# 18. Contraintes de modification

Avant de modifier du code :

1. Lire l'implémentation.
2. Lire les tests concernés.
3. Identifier le contrat existant.
4. Déterminer si le problème est réel.
5. Corriger uniquement les problèmes démontrés.

Chaque changement doit avoir une justification.

Priorité :

```text
correctness
> consistency
> determinism
> maintainability
> performance
```

Ne pas modifier un comportement simplement parce qu'une autre architecture serait théoriquement préférable.

---

# 19. Final report

Créer :

```text
docs/Step15-report.md
```

Le rapport doit clairement séparer :

### Fixed

Problèmes réellement corrigés.

### Verified

Propriétés déjà correctes et simplement validées.

### Deferred

Améliorations identifiées mais volontairement non implémentées.

### No change

Comportements examinés et conservés volontairement.

Le rapport doit permettre à un développeur externe de comprendre exactement ce qui garantit aujourd'hui la cohérence d'un scan.

---

## Definition of Done

Step 15 est terminé uniquement si :

- [ ] Lifecycle du scan audité
- [ ] Transitions d'état vérifiées
- [ ] `runScan` audité
- [ ] Error mapping vérifié
- [ ] `ScanResult` contract vérifié
- [ ] Timestamps audités
- [ ] InMemory repository audité
- [ ] PostgreSQL repository audité
- [ ] Persistence failure semantics vérifiées
- [ ] Web/Worker parity vérifiée
- [ ] API contract vérifié
- [ ] Idempotence analysée
- [ ] Concurrency limitations documentées
- [ ] Tests ajoutés uniquement là où nécessaire
- [ ] Documentation mise à jour
- [ ] `Step15-report.md` créé
- [ ] `pnpm typecheck` passe
- [ ] `pnpm test` passe
- [ ] `pnpm lint` passe
- [ ] `pnpm build` passe
- [ ] `madge --circular` passe
- [ ] Aucun changement de scoring
- [ ] Aucun changement de fingerprint
- [ ] Aucun nouveau detector
- [ ] Aucun nouveau evidence type
- [ ] Aucune dépendance inutile ajoutée

## Guiding principle

> **The detector engine is stable. Now make the scan lifecycle equally trustworthy.**
