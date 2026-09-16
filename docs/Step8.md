# Step 8 — Detection Result Quality & Technology Catalog

## Contexte

DevLens possède maintenant plusieurs familles de détection :

- HeaderDetector
- MetaTagDetector
- ScriptUrlDetector
- ContentScriptDetector
- ResourceDetector
- LinkDetector

Le pipeline actuel est :

```text
Detectors
    ↓
CompositeDetector
    ↓
DeduplicatingDetector
    ↓
ScoringDetector
    ↓
ScanResult
    ↓
Persistence
    ↓
API
```

Le système dispose également de :

- `Detection`
- `Evidence`
- `Technology`
- confidence locale
- score final via `ConfidenceScorer`
- PostgreSQL / Drizzle
- JSONB pour les détections
- Web API
- Worker

---

# OBJECTIF

Faire un audit et une consolidation de la **qualité du résultat final de détection**.

Cette étape ne doit PAS ajouter massivement de nouveaux detectors.

L'objectif est de vérifier que :

> une technologie détectée possède un résultat cohérent, explicable, correctement catégorisé, correctement scoré et correctement transporté jusqu'à l'API/persistence.

Cette étape doit également établir un **catalogue explicite des technologies actuellement supportées** afin d'éviter que les signatures et catégories deviennent incohérentes au fil des prochains detectors.

---

# 1. AUDIT AVANT MODIFICATION

Avant de modifier quoi que ce soit, inspecter :

- `Technology`
- `Detection`
- `Evidence`
- tous les detectors
- toutes les signatures existantes
- `CompositeDetector`
- `DeduplicatingDetector`
- `ScoringDetector`
- `ConfidenceScorer`
- `ScanResult`
- `runScan`
- `executeScan`
- repository PostgreSQL
- mapping DB
- API response
- Worker pipeline
- documentation actuelle

Produire mentalement un inventaire précis avant d'implémenter.

Ne pas faire de refactor préventif.

---

# 2. INVENTAIRE DES TECHNOLOGIES

Construire un inventaire de toutes les technologies actuellement produites par les detectors.

Pour chaque technologie :

```text
id
name
category
detectors/signatures qui peuvent la produire
evidence types possibles
confidence range
```

Identifier les incohérences éventuelles :

- même technologie avec plusieurs IDs
- noms différents pour une même technologie
- catégories incohérentes
- confidence manifestement incohérente
- technologie détectée mais non documentée
- technologie documentée mais non détectable

IMPORTANT :

Ne pas inventer de nouvelles technologies simplement pour compléter le catalogue.

Le catalogue doit refléter **l'implémentation réelle actuelle**.

---

# 3. TECHNOLOGY CATALOG

Si l'architecture actuelle le permet proprement, introduire un catalogue partagé et typé des technologies.

Exemple conceptuel :

```ts
TechnologyCatalog;
```

avec une définition centralisée :

```ts
{
  (id, name, category);
}
```

Mais :

> ne crée PAS une nouvelle abstraction si `Technology` constitue déjà un catalogue suffisamment solide.

Le but est d'éviter la duplication, pas d'ajouter une couche.

Le catalogue doit devenir la source de vérité pour les métadonnées stables d'une technologie.

Les detectors doivent continuer à rester simples.

---

# 4. TECHNOLOGY IDENTITY

Vérifier précisément l'identité d'une technologie.

Une même technologie doit toujours être représentée par le même :

```text
technology.id
```

Exemple :

```text
Next.js
```

ne doit jamais apparaître sous :

```text
next
nextjs
NextJS
```

comme IDs différents.

Les différences de nom d'affichage et d'identifiant interne doivent être explicites.

Ne modifier les IDs existants que si une incohérence réelle est démontrée.

Si un changement d'ID est nécessaire :

- identifier tous les usages
- mettre à jour les tests
- mettre à jour la documentation
- vérifier la persistence
- vérifier l'API

---

# 5. CATEGORY CONSISTENCY

Auditer les catégories existantes.

Utiliser uniquement les catégories déjà définies par le domaine lorsque possible.

Exemples possibles :

```text
framework
library
cms
analytics
hosting
payment
database
...
```

Ne crée pas de nouvelles catégories sans nécessité.

Une technologie doit avoir une catégorie stable.

Les detectors ne doivent pas attribuer arbitrairement des catégories différentes pour la même technologie.

---

# 6. DETECTION CONTRACT

Vérifier le contrat final :

```ts
Detection;
```

Il doit rester suffisamment simple pour représenter :

```text
Technology
confidence / score
Evidence[]
```

Ne pas transformer `Detection` en objet massif contenant :

- crawler metadata
- HTTP internals
- raw HTML
- resource content
- debug state
- detector internals

Le résultat de détection doit rester un objet de domaine propre.

---

# 7. CONFIDENCE VS FINAL SCORE

Auditer la décision prise au Step 7.

Le système possède désormais :

```text
local signature confidence
        ↓
deduplication
        ↓
final scored confidence
```

Vérifier précisément si le champ actuellement appelé `confidence` représente :

```text
signature confidence
```

ou :

```text
final confidence score
```

Le contrat doit être clair.

Si le Step 7 utilise le même champ pour le score final, déterminer si cela est cohérent avec le domaine actuel.

NE PAS créer deux champs :

```text
confidence
score
```

simplement pour faire plus propre.

Créer une distinction uniquement si elle est réellement nécessaire.

Documenter la décision.

---

# 8. EVIDENCE QUALITY

Auditer toutes les variantes d'`Evidence`.

Pour chaque type :

- identifier sa source
- vérifier qu'elle contient uniquement les informations nécessaires
- vérifier qu'elle ne stocke pas de contenu excessif
- vérifier qu'elle est sérialisable
- vérifier qu'elle est déterministe
- vérifier qu'elle reste exploitable après persistence

Vérifier particulièrement :

```text
script_content
resource
link
```

afin de s'assurer qu'une page volumineuse ne provoque pas une explosion de la taille du JSONB.

Si une limite existe déjà, la documenter.

Ne pas introduire un système de stockage externe dans cette étape.

---

# 9. END-TO-END TEST SCENARIOS

Ajouter des tests d'intégration couvrant plusieurs sources simultanément.

Les scénarios doivent tester le pipeline complet, pas uniquement les detectors isolés.

## Scenario A — Next.js

Simuler des preuves provenant de plusieurs familles :

```text
meta
script_url
script_content
resource
link si pertinent
```

Vérifier :

- une seule technologie Next.js
- evidences fusionnées
- score final correct
- catégorie correcte
- résultat déterministe

## Scenario B — WordPress

Simuler :

```text
meta
script_url
resource
link
```

Vérifier :

- une seule détection WordPress
- evidences fusionnées
- score final cohérent

## Scenario C — React

Simuler plusieurs preuves React.

Vérifier que React et Next.js restent deux technologies distinctes lorsque les preuves le justifient.

## Scenario D — Shopify

Tester notamment les signatures hostname/link/resource existantes.

## Scenario E — Aucun fingerprint

Une page normale sans signature connue doit retourner :

```text
detections = []
```

et ne doit pas inventer une technologie.

## Scenario F — Bruit

Une page contenant beaucoup de CSS/HTML/JS générique ne doit pas produire de faux positifs significatifs.

---

# 10. PERSISTENCE ROUND-TRIP

Tester explicitement :

```text
ScanResult
   ↓
repository.save()
   ↓
repository.get()
   ↓
ScanResult
```

Vérifier que :

- technology ID
- name
- category
- confidence/score
- evidence
- evidence order

sont conservés.

Le round-trip doit être sémantiquement équivalent.

Ne pas modifier le schéma DB si le JSONB actuel suffit.

---

# 11. API CONTRACT

Vérifier la réponse de :

```text
POST /api/scans
```

et les éventuels endpoints de lecture existants.

Vérifier que l'API expose un résultat cohérent avec le domaine.

Ne pas exposer accidentellement :

- contenu brut des ressources
- contenu complet des scripts
- détails internes du crawler
- informations SSRF/security
- états internes du detector

L'API doit exposer le résultat utile de détection, pas l'implémentation interne.

Si l'API sérialise directement `Detection`, documenter cette décision.

---

# 12. DETERMINISM

Ajouter un test de déterminisme end-to-end :

```text
same snapshot
     ↓
same detector pipeline
     ↓
same detections
```

Vérifier notamment :

- ordre des technologies
- ordre des evidences
- score
- représentation JSON

Deux exécutions avec le même snapshot doivent produire le même résultat.

---

# 13. NO NEW DETECTORS

IMPORTANT :

Step 8 n'est PAS une étape de couverture.

Ne pas ajouter :

- nouveaux detectors
- dizaines de signatures
- nouvelle observation crawler
- nouvelle source réseau

Si pendant l'audit une technologie intéressante manque, la noter dans :

```text
Future detection coverage
```

mais ne pas l'implémenter.

---

# 14. NO PREMATURE REFACTOR

Ne pas refactorer tout le système simplement pour introduire un catalogue.

Une modification est justifiée uniquement si elle résout une incohérence démontrée.

Priorité :

```text
correctness
>
consistency
>
maintainability
>
abstraction
```

---

# 15. DOCUMENTATION

Mettre à jour la documentation avec :

## Technology catalog

Liste des technologies actuellement supportées.

Pour chaque technologie :

```text
Technology
Category
Detection sources
Evidence types
```

## Detection lifecycle

Documenter :

```text
crawl
  ↓
observe
  ↓
detect
  ↓
deduplicate
  ↓
score
  ↓
persist
  ↓
API
```

## Confidence

Expliquer clairement :

- confidence locale
- déduplication
- score final
- rôle des evidences

---

# 16. TESTS DE NON-RÉGRESSION

Tous les tests existants doivent continuer à passer.

Ne modifie pas les comportements des detectors existants sauf lorsqu'une incohérence de catalogue démontrée l'exige.

Si un test existant doit changer :

- expliquer pourquoi
- vérifier que le nouveau comportement est réellement plus cohérent
- ne jamais modifier un test uniquement pour le faire passer

---

# 17. VALIDATION

Exécuter obligatoirement :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular .
```

Tous doivent passer.

Vérifier également :

- Web API
- Worker
- persistence round-trip
- tests end-to-end du pipeline

---

# 18. RAPPORT FINAL

Retourner exactement une synthèse structurée :

## Step 8 — Complete

### Audit findings

### Technology catalog

Table :

| Technology | ID  | Category | Detection sources | Evidence types |
| ---------- | --- | -------- | ----------------- | -------------- |

### Detection contract

### Confidence / score semantics

### Evidence audit

### End-to-end scenarios

### Persistence round-trip

### API contract

### Files changed

### Tests

### Validation

### Future detection coverage

### Remaining limitations

### Recommended next step

IMPORTANT :

Ne commence aucune étape ultérieure.

Si l'audit révèle qu'une modification architecturale importante est nécessaire, ne la fais pas automatiquement : documente le problème et arrête-toi avant un gros refactor.
