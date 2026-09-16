# DevLens — Step 12 — Snapshot Quality & Observation Coverage

## Context

DevLens dispose maintenant de :

- **29 technologies** dans le catalogue centralisé
- **6 detectors** concrets
- un pipeline stable :

```text
CompositeDetector
→ DeduplicatingDetector
→ ScoringDetector(ConfidenceScorer)
→ ScanResult
```

- des observations couvrant notamment :

  - HTTP headers
  - HTML/meta
  - inline scripts
  - script URLs
  - links
  - resources (`robots.txt`, `manifest.json`, CSS, etc.)

- une suite de tests importante et stable
- aucune dépendance à un navigateur ou à l'exécution JavaScript

Les détecteurs sont désormais suffisamment nombreux pour que le prochain risque principal soit **la qualité des observations produites par le crawler**.

Principe directeur :

> **A detector is only as reliable as the observations it receives.**

---

# Goal

Réaliser un **audit complet de `SiteSnapshot` et `HttpCrawler`**, puis corriger uniquement les problèmes réellement identifiés.

L'objectif est de garantir que les détecteurs reçoivent des observations :

- complètes dans les limites du contrat du crawler
- correctement normalisées
- déterministes
- cohérentes
- résistantes aux cas HTML/HTTP atypiques
- suffisamment riches pour éviter des faux négatifs artificiels

## Important

Cette étape **n'ajoute aucune nouvelle technologie**.

Elle **n'ajoute aucun nouveau detector**.

Elle **ne modifie pas le scoring**.

Elle **ne modifie pas le ranking**.

Elle **ne crée pas de nouveau type d'evidence**.

Elle doit rester une étape de **hardening du snapshot/crawler**, pas devenir une refonte de l'architecture.

---

# 1. Audit initial obligatoire

Avant toute modification, inspecte complètement :

### Core

- `SiteSnapshot`
- `ScanTarget`
- les types d'observation
- les types HTML
- les types resources
- les types headers/cookies s'ils existent
- les contrats utilisés par les detectors

### Crawler

Inspecte précisément :

- `HttpCrawler`
- client HTTP utilisé
- gestion des redirects
- status codes
- response headers
- cookies
- content type
- charset / encoding
- body size
- body truncation
- timeout
- erreurs réseau
- HTML parsing
- extraction des `<meta>`
- extraction des `<script>`
- extraction des `<link>`
- extraction des ressources
- résolution des URLs relatives
- déduplication
- ordre des observations

### Tests / fixtures

Inspecte également :

- fixtures HTTP
- fixtures HTML
- helpers de test
- mocks HTTP
- snapshots éventuels
- tests existants du crawler

**Ne suppose pas que l'architecture actuelle fonctionne correctement. Vérifie-la dans le code.**

---

# 2. Construire une Observation Coverage Matrix

Avant de modifier le code, établis une matrice couvrant toutes les observations produites par le crawler.

Format recommandé :

| Surface      | Snapshot field | Producer | Normalized? | Limits | Error behavior | Consumers                                 | Tests |
| ------------ | -------------- | -------- | ----------- | ------ | -------------- | ----------------------------------------- | ----- |
| HTTP headers | ...            | ...      | ...         | ...    | ...            | HeaderDetector                            | ...   |
| HTML meta    | ...            | ...      | ...         | ...    | ...            | MetaTagDetector                           | ...   |
| Scripts      | ...            | ...      | ...         | ...    | ...            | ContentScriptDetector / ScriptUrlDetector | ...   |
| Links        | ...            | ...      | ...         | ...    | ...            | LinkDetector                              | ...   |
| CSS          | ...            | ...      | ...         | ...    | ...            | ResourceDetector                          | ...   |
| manifest     | ...            | ...      | ...         | ...    | ...            | ResourceDetector                          | ...   |
| robots       | ...            | ...      | ...         | ...    | ...            | ResourceDetector                          | ...   |

Adapte la matrice aux vrais types présents dans le repository.

**Ne crée pas artificiellement des surfaces qui n'existent pas.**

Cette matrice doit apparaître dans `docs/Step12-report.md`.

---

# 3. Audit de déterminisme

Le même input doit produire le même `SiteSnapshot`.

Vérifie notamment :

- ordre des headers si pertinent
- ordre des scripts
- ordre des links
- ordre des resources
- déduplication
- résolution des URLs
- normalisation
- traitement des attributs
- contenu inline
- gestion des erreurs

Deux exécutions sur le même fixture doivent produire un résultat équivalent.

Si une source de nondéterminisme existe, corrige-la uniquement si elle est réellement dans le contrat du snapshot.

Ajouter un test explicite :

```text
same input
→ same snapshot
```

---

# 4. URL normalization

Audit particulièrement important.

Vérifie comment sont traitées :

- URLs absolues
- URLs relatives
- root-relative URLs
- protocol-relative URLs
- fragments
- query strings
- trailing slash
- hostname casing
- ports
- encodage

Exemples :

```text
/scripts/app.js
./scripts/app.js
../scripts/app.js
https://example.com/scripts/app.js
//cdn.example.com/app.js
```

## Attention

**Ne supprime pas arbitrairement les query parameters.**

Ils peuvent contenir une information pertinente pour les fingerprints.

Par exemple :

```text
/script.js?id=...
```

ou :

```text
/assets/app.js?ver=...
```

La politique de normalisation doit donc être dérivée du comportement existant et des besoins des detectors.

Si aucune politique explicite n'existe :

1. définir la politique minimale nécessaire ;
2. la tester ;
3. la documenter ;
4. éviter toute normalisation destructive.

---

# 5. HTML observation quality

Audit les cas suivants :

### Scripts

Vérifier :

- `<script src="...">`
- `<script>` inline
- script vide
- script sans `src`
- script avec `src=""`
- attributs supplémentaires
- HTML malformé
- plusieurs scripts identiques
- URLs relatives
- contenu inline volumineux

Le contrat connu de `ScriptTag` doit rester cohérent :

```text
src: string | null
content: string
```

Ne change pas inutilement cette API.

### Meta

Vérifier :

- `name`
- `property`
- `content`
- casing
- attributs manquants
- meta malformées
- doublons

### Links

Vérifier :

- `href`
- `rel`
- URLs relatives
- fragments
- doublons
- links sans `href`
- éléments HTML malformés

---

# 6. Resource observation quality

Audit les resources actuellement supportées par le crawler.

En particulier, si elles existent dans le contrat actuel :

- `robots.txt`
- `manifest.json`
- CSS
- autres resources explicitement supportées

Pour chaque resource :

- comment est-elle découverte ?
- comment est-elle récupérée ?
- quelle URL est utilisée ?
- quel content type est accepté ?
- quelle taille maximale est autorisée ?
- que se passe-t-il en cas d'erreur ?
- que se passe-t-il si la resource est absente ?
- est-elle dédupliquée ?
- son ordre est-il déterministe ?

## Important

Ne transforme pas cette étape en nouveau crawler généraliste.

Si une resource n'est **pas actuellement récupérée**, ne l'ajoute pas automatiquement.

Si son absence constitue une vraie limitation architecturale, documente-la comme **deferred work** sauf si son ajout est trivial, clairement dans le contrat actuel et sans élargissement dangereux du scope réseau.

---

# 7. HTTP edge cases

Tester le comportement du crawler avec :

### Status codes

- `200`
- `3xx`
- `404`
- `500`
- autres non-2xx

### Redirects

Tester :

```text
HTTP → HTTPS
```

et plusieurs redirects si le client le permet.

Vérifier :

- URL finale
- base URL utilisée pour résoudre les URLs relatives
- headers
- body
- comportement déterministe

### Headers

Tester :

- headers manquants
- casing différent
- headers multiples
- headers inhabituels

### Content-Type

Tester :

- `text/html`
- `text/html; charset=utf-8`
- content type absent
- content type incorrect
- contenu HTML malgré content type inattendu
- contenu non HTML

Le parser HTML ne doit pas être appliqué aveuglément à tout type de réponse si le contrat du crawler distingue les contenus.

---

# 8. Encoding / charset

Audit la gestion de l'encodage.

Tester au minimum si l'architecture le permet :

- UTF-8
- charset explicitement déclaré
- charset absent
- caractères accentués
- HTML contenant des caractères non ASCII

Objectif :

> éviter qu'une mauvaise gestion de l'encodage détruise silencieusement un fingerprint.

Ne mets pas en place un système complexe d'inférence d'encodage si le projet n'en a pas besoin.

---

# 9. Body size / truncation

Audit toutes les limites :

- taille maximale du HTML
- taille maximale d'une resource
- taille maximale d'un script inline
- timeout
- nombre éventuel de resources
- profondeur éventuelle de crawl

Chaque limite doit avoir un comportement explicite.

Une troncature ne doit jamais être silencieusement présentée comme une observation complète.

Si le système tronque déjà le contenu :

- vérifier si cette troncature peut provoquer des faux négatifs ;
- documenter son comportement ;
- ajouter les tests nécessaires.

Ne supprime pas arbitrairement les limites de sécurité.

---

# 10. Malformed input

Tester des HTML volontairement imparfaits :

```html
<html>
<script src="/app.js"
<div>
<meta name="generator" content="WordPress">
```

ainsi que :

- tags non fermés
- attributs malformés
- scripts contenant du HTML inhabituel
- caractères invalides
- body vide
- document sans `<html>`
- document sans `<head>`

Le crawler ne doit pas planter pour une page simplement malformée.

---

# 11. Duplicate observations

Audit les doublons dans :

- scripts
- links
- resources
- meta
- headers si applicable

Déterminer si la déduplication est :

- nécessaire
- déjà présente
- attendue au niveau crawler
- ou volontairement laissée aux detectors

Ne déduplique pas aveuglément.

Une observation peut être répétée dans le HTML pour une raison légitime.

Si une déduplication est nécessaire, elle doit être :

- déterministe
- stable
- non destructive
- couverte par tests

---

# 12. Network contract

Documente précisément ce que `HttpCrawler` est autorisé à faire.

Exemple conceptuel :

```text
Target URL
   ↓
HTTP request
   ↓
redirect handling
   ↓
HTML response
   ↓
HTML observations
   ↓
explicitly supported resource fetches
```

Vérifie surtout qu'il n'y a pas de network crawling implicite ou incontrôlé.

DevLens n'est pas un navigateur.

Il ne faut pas introduire :

- Playwright
- Puppeteer
- JS execution
- browser rendering
- DOM runtime
- crawling de liens arbitraires

Le crawler reste **HTTP-based**.

---

# 13. Tests à ajouter

Ajoute des tests ciblés, sans multiplier inutilement les fichiers.

Les noms peuvent être adaptés à la structure réelle du projet.

Tests attendus :

### `snapshot-determinism.test.ts`

Vérifier :

- même input → même snapshot
- ordre stable
- observations stables

### `snapshot-normalization.test.ts`

Vérifier :

- URLs relatives
- URLs absolues
- protocol-relative
- fragments
- query parameters
- casing
- trailing slash selon le contrat

### `crawler-observation-coverage.test.ts`

Vérifier que chaque surface officiellement supportée est correctement produite.

### `crawler-edge-cases.test.ts`

Couvrir :

- redirect
- 404
- 500
- empty body
- malformed HTML
- missing content type
- charset
- duplicate observations
- large body / truncation si applicable
- resource errors
- relative URLs

Adapte les fichiers aux conventions existantes du repository.

**Ne crée pas de duplication avec des tests déjà présents.**

---

# 14. Persistence audit

Vérifie que les éventuelles améliorations de `SiteSnapshot` restent compatibles avec la persistence existante.

Attention aux données JSONB et aux types sérialisés.

Objectifs :

```text
crawler
→ snapshot
→ detectors
→ ScanResult
→ persistence
→ read back
```

doit rester cohérent.

## Important

Ne fais **pas** de migration DB par défaut.

Une migration n'est justifiée que si l'audit démontre un problème réel et impossible à résoudre autrement.

---

# 15. Detector compatibility

Après les changements crawler/snapshot, vérifie explicitement les 6 detectors :

```text
HeaderDetector
MetaTagDetector
ScriptUrlDetector
ContentScriptDetector
ResourceDetector
LinkDetector
```

Ils doivent continuer à recevoir exactement les observations attendues.

Vérifie notamment :

- aucun changement involontaire de l'API `SiteSnapshot`
- aucun changement de type inutile
- aucune evidence cassée
- aucune régression de detection
- aucune modification du scoring
- aucune modification du ranking

---

# 16. Regression tests

Les tests existants de collision et de pipeline doivent continuer à passer.

Une modification du crawler qui fait disparaître une detection existante est une régression potentielle.

Vérifier particulièrement :

- Next.js
- WordPress
- React vs Next.js
- Shopify
- WooCommerce vs WordPress
- Drupal
- Laravel
- Webflow
- Tailwind CSS
- Google Analytics
- no-fingerprint
- noise

---

# 17. Documentation

Créer :

```text
docs/Step12-report.md
```

Structure :

```markdown
# Step 12 — Snapshot Quality & Observation Coverage

## Executive Summary

## Current Architecture

## Observation Coverage Matrix

## Audit Findings

### HTTP

### HTML

### Scripts

### Meta

### Links

### Resources

### URLs

### Encoding

### Limits

### Errors

### Determinism

## Changes Implemented

## Invariants

## Edge Cases

## Detector Compatibility

## Persistence Compatibility

## Tests

## Validation

## Deferred Work

## Conclusion
```

Le rapport doit clairement distinguer :

- **problèmes réellement trouvés**
- **corrections implémentées**
- **comportements déjà corrects**
- **limitations connues**
- **travail volontairement différé**

Ne transforme pas le rapport en liste de modifications artificielles.

---

# 18. Strict constraints

## DO

- auditer avant de modifier
- privilégier les changements minimaux
- préserver les API existantes
- ajouter des tests pour chaque comportement corrigé
- documenter les invariants
- préserver la précision des detectors
- préserver le déterminisme
- préserver les limites de sécurité
- conserver l'architecture HTTP crawler

## DO NOT

- ne pas ajouter de technologie
- ne pas ajouter de detector
- ne pas ajouter de nouveau evidence type
- ne pas modifier le scoring
- ne pas modifier le ranking
- ne pas ajouter de ML
- ne pas ajouter de LLM
- ne pas ajouter Playwright
- ne pas ajouter Puppeteer
- ne pas exécuter JavaScript
- ne pas transformer DevLens en crawler généraliste
- ne pas ajouter une couche d'abstraction sans besoin réel
- ne pas faire de refactor massif
- ne pas modifier la DB sans nécessité démontrée
- ne pas supprimer des limites de sécurité pour simplifier les tests
- ne pas introduire de network access supplémentaire sans justification

---

# 19. Validation finale obligatoire

Exécuter :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular packages apps
```

Résultats attendus :

- typecheck : **0 erreur**
- tests : tous passent
- lint : clean
- build : clean
- madge : aucune dépendance circulaire

Comparer également le nombre de tests avec l'état précédent :

```text
636 passed / 9 skipped
```

Indiquer clairement le delta.

---

# 20. Final principle

Cette étape ne cherche pas à rendre DevLens "plus intelligent".

Elle cherche à rendre ses **observations fiables**.

La chaîne doit être robuste :

```text
HTTP
 ↓
HttpCrawler
 ↓
SiteSnapshot
 ↓
Observations normalisées
 ↓
Detectors
 ↓
Evidence
 ↓
Confidence
 ↓
ScanResult
 ↓
Persistence
```

Le résultat attendu est un snapshot qui constitue une **base d'observation stable, déterministe et suffisamment complète**, sans élargir inutilement le périmètre du crawler.

**Priorité absolue : précision > couverture, simplicité > sophistication, correction minimale > refonte.**
