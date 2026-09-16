# DevLens — Step 13 — Detection Coverage & Real-World Fixture Suite

## Context

DevLens dispose maintenant d'une base technique stable :

- **29 technologies** dans le catalogue centralisé
- **6 detectors**
- pipeline :

```text
CompositeDetector
→ DeduplicatingDetector
→ ScoringDetector(ConfidenceScorer)
→ ScanResult
```

- `SiteSnapshot` et `HttpCrawler` ont été audités et durcis lors du Step 12
- observations HTTP / HTML / scripts / links / resources fiables et déterministes
- evidence canonicalisée
- confidence bornée et ranking déterministe
- persistence fonctionnelle
- architecture sans dépendance navigateur
- aucune détection basée sur LLM/ML

État de référence :

```text
715 tests passed
9 skipped
106 files
0 circular dependencies
```

Le projet possède désormais suffisamment de maturité pour passer d'une validation principalement **unit/integration-driven** à une validation par **fixtures représentatives et golden expectations**.

---

# Goal

Construire une **Real-World Detection Fixture Suite** permettant de mesurer objectivement :

1. quelles technologies sont correctement détectées ;
2. lesquelles ne le sont pas ;
3. quelles technologies produisent des faux positifs ;
4. quelles signatures entrent en collision ;
5. si les résultats restent déterministes ;
6. si une modification future casse une détection existante.

Cette étape est principalement une étape de **measurement + regression protection**.

## Important

Ne pas profiter de cette étape pour ajouter massivement de nouvelles technologies.

Si une technologie actuellement absente apparaît comme un manque évident, la documenter dans un backlog de couverture.

Une nouvelle signature n'est autorisée que si elle est nécessaire pour corriger une régression ou un problème directement découvert pendant l'audit.

---

# 1. Audit de la stratégie de test actuelle

Commencer par analyser les tests existants.

Identifier :

- tests unitaires des detectors ;
- tests de collision ;
- tests pipeline ;
- tests crawler ;
- tests persistence ;
- fixtures déjà existantes ;
- helpers de test ;
- conventions de nommage ;
- manière actuelle de construire `SiteSnapshot` ;
- éventuels tests qui reproduisent déjà des pages réalistes.

Ne pas recréer ce qui existe déjà.

Produire mentalement une distinction claire entre :

```text
Unit tests
Integration tests
Golden fixture tests
Regression tests
```

---

# 2. Définir le corpus de fixtures

Créer un petit corpus contrôlé de pages représentatives.

Le corpus doit privilégier **la qualité plutôt que la quantité**.

Chaque fixture doit représenter un environnement identifiable avec plusieurs observations réalistes.

Inclure au minimum les technologies principales déjà supportées, notamment :

```text
Next.js
React
WordPress
Shopify
WooCommerce
Drupal
Laravel
Webflow
Tailwind CSS
Google Analytics
Vue
Nuxt
```

Adapter cette liste aux technologies réellement présentes dans le catalogue.

Ajouter également :

```text
No fingerprint
Noise / generic website
```

L'objectif est essentiel :

> Une page qui ne contient aucun fingerprint fort ne doit pas être artificiellement détectée.

---

# 3. Fixture design

Les fixtures doivent être des **snapshots représentatifs**, pas simplement un exemple minimal contenant une seule chaîne magique.

Par exemple, éviter :

```html
<script>
  window.Laravel = true;
</script>
```

comme unique contenu d'une fixture Laravel.

Préférer un environnement ressemblant davantage à une vraie page :

```text
HTTP headers
HTML
meta
scripts
links
inline scripts
resources
```

tout en restant :

- déterministe ;
- local ;
- léger ;
- sans dépendance réseau ;
- reproductible.

Les fixtures doivent pouvoir être exécutées hors ligne.

---

# 4. Fixture structure

Adapter la structure au repository existant.

Une structure possible :

```text
packages/
  detectors/
    test/
      fixtures/
        nextjs/
        react/
        wordpress/
        shopify/
        ...
        no-fingerprint/
        noise/
```

Ne force pas cette structure si une convention meilleure existe déjà.

Chaque fixture doit avoir :

```text
input snapshot
expected detections
```

ou une représentation équivalente adaptée à l'architecture actuelle.

---

# 5. Golden expectations

Introduire un mécanisme de **golden expectations**.

Pour chaque fixture, définir explicitement :

### Expected technologies

Exemple conceptuel :

```text
Next.js
React
```

### Forbidden technologies

Exemple :

```text
Vue
WordPress
Shopify
```

### Optional detections

Si une technologie peut légitimement être absente selon le niveau de fingerprint :

```text
optional
```

Mais utiliser cette catégorie avec parcimonie.

L'objectif est que chaque fixture exprime clairement :

```text
What must be detected
What must never be detected
```

---

# 6. Ne pas tester uniquement les technologies

Le test golden doit également vérifier la qualité de la détection.

Pour chaque detection :

- technology ID
- confidence
- evidence type
- evidence content
- éventuellement ordre final

Ne verrouille pas inutilement des détails internes qui ne font pas partie du contrat public.

Le test doit principalement protéger :

```text
Technology
Confidence invariants
Evidence invariants
Deterministic ordering
```

Si le confidence exact est une conséquence directe d'une signature stable et fait partie du comportement attendu, il peut être testé.

Sinon préférer des assertions de bornes / seuils plutôt qu'un snapshot trop fragile.

---

# 7. Precision / false-positive tests

Créer une catégorie spécifique de fixtures destinées à produire des **faux positifs potentiels**.

Exemples conceptuels :

### Generic React-looking page

Contient :

```text
generic JS
generic DOM code
```

mais aucun fingerprint Next.js.

Expected :

```text
Next.js → absent
```

### Generic CDN

Contient :

```text
cdn.example.com/app.js
```

Expected :

```text
no framework detection
```

### Generic CSS

Contient des classes arbitraires.

Expected :

```text
Tailwind CSS → absent
```

### Generic analytics

Contient un script analytics non-Google.

Expected :

```text
Google Analytics → absent
```

### WordPress-like content

Contient des chaînes communes à de nombreux CMS.

Expected :

```text
WordPress → absent
```

Ces fixtures sont particulièrement importantes car DevLens privilégie :

> **precision > recall**

---

# 8. Collision matrix

Construire une matrice de collisions pour les familles présentant un risque.

Minimum :

| Family       | Technology A     | Technology B      | Expected behavior              |
| ------------ | ---------------- | ----------------- | ------------------------------ |
| JS framework | React            | Next.js           | Next.js may coexist with React |
| Vue          | Vue              | Nuxt              | Nuxt may coexist with Vue      |
| CMS          | WordPress        | WooCommerce       | coexistence possible           |
| Analytics    | Google Analytics | generic analytics | no false positive              |
| CSS          | Tailwind         | generic CSS       | Tailwind only with fingerprint |
| CDN          | Shopify          | generic CDN       | Shopify only with fingerprint  |
| Backend      | PHP              | Laravel           | Laravel may coexist with PHP   |
| CMS          | Drupal           | generic JS        | Drupal only with fingerprint   |

Ne pas inventer des relations.

La matrice doit refléter les signatures réellement implémentées.

---

# 9. Expected coexistence

Important : une collision n'est pas toujours un conflit.

Certaines technologies doivent pouvoir être détectées simultanément.

Exemples :

```text
Next.js + React
WordPress + WooCommerce
Nuxt + Vue
Laravel + PHP
```

Les golden tests doivent donc distinguer :

```text
False positive
vs
Legitimate coexistence
```

Ne modifier aucun detector simplement parce que deux technologies apparaissent ensemble.

---

# 10. Negative corpus

Créer un petit corpus de pages volontairement ambiguës.

Objectif :

```text
many generic signals
+
no strong fingerprint
=
no confident detection
```

Exemples :

```text
generic React-like JS
generic Vue-like JS
generic CSS framework-like classes
generic CDN URLs
generic analytics scripts
generic CMS metadata
```

Le corpus négatif est aussi important que le corpus positif.

---

# 11. Determinism

Chaque fixture doit être exécutée plusieurs fois.

Vérifier :

```text
same snapshot
→ same detections
→ same evidence
→ same confidence
→ same ordering
```

Aucune variation ne doit apparaître entre deux exécutions.

Si une nondéterminisme est découvert :

1. identifier la cause ;
2. corriger seulement si elle appartient au contrat actuel ;
3. ajouter un test de régression.

---

# 12. Golden regression test

Créer un test de niveau pipeline.

Conceptuellement :

```text
fixture
 ↓
SiteSnapshot
 ↓
CompositeDetector
 ↓
DeduplicatingDetector
 ↓
ScoringDetector
 ↓
ScanResult
 ↓
assert golden expectations
```

Le test doit utiliser le **pipeline réel**, pas appeler chaque detector séparément.

Cela permettra de détecter les régressions dans :

- detector composition ;
- deduplication ;
- scoring ;
- ranking ;
- evidence handling.

---

# 13. Coverage report

Créer un rapport de couverture des technologies.

Format recommandé :

| Technology | Category  | Positive fixture | Negative fixture | Detected | Confidence | Evidence | Status |
| ---------- | --------- | ---------------: | ---------------: | -------: | ---------: | -------: | ------ |
| Next.js    | framework |                ✓ |                ✓ |        ✓ |        ... |        ✓ | PASS   |
| React      | library   |                ✓ |                ✓ |        ✓ |        ... |        ✓ | PASS   |
| ...        | ...       |              ... |              ... |      ... |        ... |      ... | ...    |

Toutes les technologies du catalogue doivent apparaître.

Le rapport doit permettre de voir immédiatement :

```text
covered
partially covered
not covered
```

---

# 14. Coverage classification

Utiliser une classification simple.

### Covered

La technologie possède :

- au moins une fixture positive ;
- au moins une protection negative/collision pertinente lorsque nécessaire ;
- une detection correcte ;
- une evidence valide.

### Partial

La technologie possède un test positif mais pas suffisamment de protection contre les faux positifs/collisions.

### Uncovered

La technologie existe dans le catalogue mais n'a pas encore de fixture représentative.

Ne pas traiter `Uncovered` comme un bug automatiquement.

Cela constitue une information de couverture.

---

# 15. No network

Les fixtures doivent être entièrement offline.

Interdiction :

- requête vers un site réel ;
- scraping de sites publics ;
- dépendance à Internet ;
- téléchargement de ressources pendant les tests.

Le corpus doit être :

```text
deterministic
offline
version-controlled
reproducible
```

---

# 16. Realism without bloat

Ne pas créer des pages HTML énormes.

Une fixture doit être suffisamment réaliste pour tester les interactions entre observations, mais rester :

- petite ;
- lisible ;
- maintenable ;
- rapide à exécuter.

Éviter les dumps HTML provenant directement de vrais sites.

Préférer des fixtures synthétiques mais réalistes.

---

# 17. No detector redesign

Pendant cette étape, ne pas :

- réécrire les detectors ;
- modifier les signatures simplement pour augmenter le taux de couverture ;
- ajouter des heuristiques faibles ;
- modifier `ConfidenceScorer` ;
- modifier le ranking ;
- modifier `DeduplicatingDetector` ;
- ajouter des evidence types ;
- ajouter des detectors spécialisés.

Si une vraie faiblesse est découverte :

1. la documenter ;
2. déterminer si elle constitue une régression ou simplement une limitation ;
3. ne corriger que si la correction est minimale et clairement justifiée.

---

# 18. Technology additions

Ne pas transformer cette étape en Step 11 bis.

Si une technologie absente est rencontrée dans les fixtures ou identifiée comme importante :

```text
document it
→ add to coverage backlog
```

Elle pourra faire l'objet d'une étape dédiée ultérieurement.

---

# 19. Test organization

Respecter les conventions actuelles du repository.

Les nouveaux tests peuvent notamment couvrir :

```text
detection-fixtures.test.ts
detection-golden.test.ts
detection-negative-fixtures.test.ts
detection-coverage.test.ts
```

Mais utiliser les noms/locations existants si une convention meilleure est déjà présente.

Éviter de multiplier les fichiers inutilement.

---

# 20. Documentation

Créer :

```text
docs/Step13-report.md
```

Structure :

```markdown
# Step 13 — Detection Coverage & Real-World Fixture Suite

## Executive Summary

## Current Detection Surface

## Fixture Corpus

## Golden Expectations

## Negative Corpus

## Collision Matrix

## Technology Coverage

## Findings

## Changes Implemented

## Regression Protection

## Test Results

## Deferred Coverage

## Validation

## Conclusion
```

Le rapport doit notamment répondre à :

1. Combien de technologies sont couvertes ?
2. Combien sont partiellement couvertes ?
3. Lesquelles n'ont aucune fixture ?
4. Quelles collisions sont protégées ?
5. Quels faux positifs potentiels ont été testés ?
6. Quelles limitations restent connues ?

---

# 21. Validation obligatoire

Exécuter :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular packages apps
```

Attendu :

```text
typecheck → 0 errors
tests → 0 failures
lint → clean
build → clean
madge → no circular dependencies
```

Comparer au baseline :

```text
715 passed
9 skipped
106 files
```

Indiquer clairement :

```text
baseline tests
new tests
total tests
skipped
```

---

# 22. Definition of Done

Step 13 est terminé uniquement si :

- [ ] toutes les technologies du catalogue ont un statut de couverture ;
- [ ] un corpus positif représentatif existe ;
- [ ] un corpus négatif existe ;
- [ ] les principales collisions sont couvertes ;
- [ ] les coexistences légitimes sont testées ;
- [ ] les tests utilisent le pipeline réel ;
- [ ] les résultats sont déterministes ;
- [ ] aucun test ne dépend du réseau ;
- [ ] aucune nouvelle dépendance inutile n'est introduite ;
- [ ] aucun changement de scoring/ranking n'est introduit ;
- [ ] aucun nouveau detector n'est introduit ;
- [ ] aucune régression existante n'est détectée ;
- [ ] `docs/Step13-report.md` est créé ;
- [ ] toute limitation restante est explicitement documentée ;
- [ ] toute la validation passe.

---

# Final principle

Step 13 doit transformer DevLens d'un système dont les detectors sont **individuellement bien testés** en un système dont le comportement global est **mesurable et protégé contre les régressions**.

La cible :

```text
Technology Catalog
       ↓
Fixture Corpus
       ↓
Realistic SiteSnapshot
       ↓
Full Detection Pipeline
       ↓
Golden Expectations
       ↓
Coverage + Precision
       ↓
Regression Protection
```

Ne cherche pas à maximiser artificiellement le nombre de technologies détectées.

Cherche à pouvoir répondre objectivement à :

> **"Sur quelles observations et quelles situations DevLens peut-il actuellement faire confiance à sa détection ?"**

Priorités :

**precision > recall**

**measurement > feature expansion**

**regression protection > quantity of fixtures**

**minimal change > architectural redesign**
