# DevLens — Step 11 — Technology Coverage Expansion

## Context

DevLens dispose maintenant d'un moteur de détection stable et déterministe.

Pipeline actuel :

```text
Snapshot
    ↓
CompositeDetector
    ↓
DeduplicatingDetector
    ↓
ScoringDetector(ConfidenceScorer)
    ↓
Detection[]
    ↓
Persistence
```

Les Steps 8–10 ont stabilisé :

- le catalogue technologique centralisé ;
- les métadonnées `{ id, name, category }` ;
- les preuves structurées ;
- la canonicalisation des preuves ;
- la déduplication ;
- le scoring ;
- la normalisation de confidence ;
- le ranking déterministe ;
- la persistence JSONB.

État de référence :

```text
pnpm typecheck → 0 errors
pnpm test      → 596 passed / 9 skipped
pnpm lint      → OK
pnpm build     → OK
madge          → no circular dependency
```

## Mission

Implémenter **Step 11 — Technology Coverage Expansion**.

L'objectif est d'augmenter la couverture réelle de DevLens en ajoutant un ensemble **sélectionné et justifié** de technologies web importantes.

Cette étape doit privilégier :

```text
precision > recall
```

Une technologie ne doit être ajoutée que si DevLens possède des fingerprints suffisamment fiables pour la détecter sans réseau supplémentaire.

---

# 1. Audit obligatoire

Avant toute modification, auditer :

- `technology-catalog.ts` ;
- tous les détecteurs ;
- toutes les tables de signatures ;
- les 23 technologies actuellement présentes ;
- leurs catégories ;
- leurs preuves disponibles ;
- les tests existants ;
- les fixtures disponibles ;
- les overlaps entre technologies.

Produire d'abord une matrice :

```text
Technology
Category
Detector(s)
Evidence type(s)
Primary fingerprint
Secondary fingerprint
Confidence potential
False-positive risk
```

Ne pas commencer immédiatement à coder.

---

# 2. Identifier les gaps de couverture

Analyser les catégories existantes :

```text
CMS
Framework
Library
Hosting
Analytics
Backend
Infrastructure
E-commerce
Database
Authentication
Build tool
CSS/UI
```

Utiliser uniquement les catégories déjà définies dans le domaine.

Si une nouvelle catégorie est réellement nécessaire :

1. justifier pourquoi ;
2. vérifier qu'elle correspond au modèle métier ;
3. modifier le catalogue de manière centralisée ;
4. ajouter les tests associés.

Ne pas créer des catégories artificielles.

---

# 3. Sélection des technologies

Identifier les technologies web ayant le meilleur ratio :

```text
usefulness
×
detectability
×
fingerprint reliability
```

Prioriser les technologies avec des signatures observables dans :

- HTTP headers ;
- HTML ;
- meta tags ;
- script URLs ;
- resource URLs ;
- links ;
- robots.txt ;
- manifest ;
- cookies ;
- éventuellement contenu inline déjà capturé par le snapshot.

Ne pas utiliser de réseau supplémentaire.

---

# 4. Technologies candidates

Avant d'ajouter une technologie, vérifier si elle n'est pas déjà couverte indirectement.

Explorer notamment les familles suivantes :

### Frontend frameworks

```text
Vue
Angular
Svelte
Nuxt
Gatsby
Astro
```

### CSS / UI

```text
Tailwind CSS
Bootstrap
Bulma
Material UI
```

### CMS

```text
Drupal
Joomla
Ghost
Webflow
Wix
Squarespace
```

### E-commerce

```text
WooCommerce
Magento / Adobe Commerce
PrestaShop
BigCommerce
```

### Backend / runtime

```text
Laravel
Django
Ruby on Rails
ASP.NET
Express
```

### Analytics / marketing

```text
Google Analytics
Google Tag Manager
Hotjar
Matomo
Plausible
```

### Hosting / infrastructure

```text
Vercel
Netlify
Cloudflare
Firebase
```

### Build / tooling

```text
Webpack
Vite
Parcel
```

Cette liste est **candidate uniquement**.

L'agent doit sélectionner les technologies réellement justifiées par les fingerprints disponibles.

Ne pas implémenter toute la liste automatiquement.

---

# 5. Règle fondamentale : pas de fingerprint fragile

Pour chaque technologie candidate, identifier au minimum :

```text
1 strong fingerprint
```

ou :

```text
2+ independent medium fingerprints
```

Exemples acceptables :

```text
/_next/
wp-content/
wp-includes/
cdn.shopify.com/
__NUXT__
ng-version
data-wf-page
```

Exemples à éviter :

```text
presence of generic React syntax
presence of generic webpack chunk
generic "app.js"
generic "main.js"
generic CSS class names
generic framework-like DOM structure
```

Un fingerprint générique ne doit pas suffire à identifier une technologie.

---

# 6. Technologie ≠ framework sous-jacent

Attention aux relations :

```text
Next.js → React
Nuxt → Vue
Gatsby → React
```

Une technologie spécifique ne doit pas automatiquement provoquer la détection de sa dépendance sous-jacente.

Si les preuves sont réellement observées :

```text
Next.js specific evidence
React generic evidence
```

les deux détections peuvent exister.

Mais le système ne doit pas ajouter une règle :

```text
if Next.js detected → detect React
```

La détection doit venir des observations du snapshot.

---

# 7. Catalogue centralisé

Toutes les nouvelles technologies doivent être ajoutées uniquement dans :

```text
technology-catalog.ts
```

Respecter le contrat :

```ts
{
  (id, name, category);
}
```

Garantir :

- ID unique ;
- nom unique ;
- catégorie valide ;
- ordre stable ;
- `getTechnology(id)` utilisé partout ailleurs.

Ne jamais dupliquer :

```ts
{
  id: "...",
  name: "...",
  category: "..."
}
```

dans une table de signatures.

---

# 8. Détecteurs

Réutiliser les détecteurs existants lorsqu'ils peuvent exprimer le nouveau fingerprint.

Exemples :

```text
HeaderDetector
MetaTagDetector
ScriptUrlDetector
ScriptContentDetector
ResourceDetector
LinkDetector
```

Ne créer un nouveau `Detector` que si aucun détecteur existant ne peut représenter proprement le signal.

Ne pas créer :

```text
VueDetector
AngularDetector
AstroDetector
...
```

si le fingerprint peut naturellement être représenté par un détecteur générique existant.

Le detector doit produire une Evidence spécialisée appropriée.

---

# 9. Fingerprint design

Chaque signature doit être :

```text
specific
documented
testable
deterministic
```

Exemple conceptuel :

```ts
{
  pattern: "/_nuxt/",
  technologyId: "nuxt",
  evidence: ...
}
```

Éviter les regex inutilement complexes.

Préférer :

```text
simple exact match
prefix match
case-normalized match
well-scoped regex
```

selon le type d'observation.

---

# 10. False-positive analysis

Pour chaque nouvelle technologie, écrire au moins un test négatif.

Exemple :

```text
Nuxt
positive:
  /_nuxt/

negative:
  /static/_nuxt-example/
```

ou selon le fingerprint réel.

Tester particulièrement les collisions :

```text
React ↔ Next.js
Vue ↔ Nuxt
React ↔ Gatsby
Shopify ↔ generic CDN
Vercel ↔ generic infrastructure
Bootstrap ↔ arbitrary bootstrap-like CSS
```

Ne pas accepter une signature uniquement parce qu'elle passe le test positif.

---

# 11. Tests obligatoires par technologie

Pour chaque technologie ajoutée :

### Positive

Le fingerprint doit être détecté.

### Negative

Un snapshot similaire mais sans le fingerprint ne doit pas être détecté.

### Multiple evidence

Si plusieurs fingerprints sont disponibles :

```text
evidence.length >= 2
```

et les preuves doivent rester distinctes.

### Duplicate

La même observation répétée ne doit pas augmenter artificiellement le résultat.

### Determinism

Deux scans identiques produisent exactement le même résultat.

### Persistence

Le résultat survive au round-trip DB.

---

# 12. Tests de collision

Créer une suite dédiée :

```text
technology-collision.test.ts
```

Couvrir les couples à risque identifiés pendant l'audit.

Exemples :

```text
Next.js / React
Nuxt / Vue
Gatsby / React
WooCommerce / WordPress
```

Le but n'est pas d'empêcher les détections simultanées lorsqu'elles sont légitimes.

Le but est d'empêcher :

```text
generic evidence
    ↓
wrong technology
```

---

# 13. Detection matrix

Ajouter si pertinent un test/tableau central permettant de vérifier :

```text
Technology
Expected detector
Expected evidence type
Positive fixture
Negative fixture
```

L'objectif est de rendre les futures additions plus simples.

Ne pas construire un framework de test inutilement complexe.

---

# 14. Confidence

Ne pas modifier le scoring global.

Step 10 définit déjà :

```text
confidence ∈ [0, 100]
```

et :

```text
confidence DESC
technology.id ASC
```

Les nouvelles technologies doivent utiliser le scoring existant.

Ne pas introduire de poids spécifiques par technologie sauf si une signature possède une sémantique explicitement différente et que cela est démontré par l'architecture existante.

Pas de :

```ts
if (technologyId === "vue") ...
```

dans le scorer.

---

# 15. Catalogue cible

À la fin de l'étape, produire une table :

```text
Current technologies
New technologies
Rejected candidates
Reason for rejection
```

Pour chaque technologie rejetée, expliquer par exemple :

```text
No reliable fingerprint available
High false-positive risk
Insufficient snapshot data
Already covered
Fingerprint requires network request
```

Cette partie est importante.

**Il est acceptable de ne pas ajouter une technologie.**

La qualité du catalogue est prioritaire sur sa taille.

---

# 16. Documentation

Mettre à jour :

```text
detectors.md
overview.md
```

pour documenter les nouvelles technologies.

Pour chaque technologie ajoutée, documenter :

```text
Technology
Category
Detector
Primary fingerprint
Secondary fingerprints
Evidence type
Known limitations
False-positive considerations
```

Créer :

```text
Step11-report.md
```

avec :

```text
# Executive Summary

# Coverage Audit

# Existing Technology Matrix

# Candidate Technologies

# Selected Technologies

# Rejected Technologies

# New Fingerprints

# False Positive Analysis

# Collision Analysis

# Tests

# Persistence

# Validation

# Architectural Decisions

# Deferred Coverage
```

---

# 17. Scope control

Cette étape ne doit PAS :

- réécrire le pipeline ;
- modifier `ConfidenceScorer` ;
- modifier le ranking ;
- remplacer les Evidence existantes ;
- introduire du ML ;
- introduire un LLM ;
- effectuer des requêtes réseau supplémentaires ;
- ajouter des technologies avec des fingerprints spéculatifs ;
- créer un detector dédié pour chaque technologie sans justification ;
- modifier le frontend ;
- modifier l'API publique sans nécessité.

---

# 18. Validation finale

Exécuter :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular packages apps
```

Tous doivent passer.

Comparer avec Step 10 :

```text
Step 10:
596 passed / 9 skipped
```

Rapporter :

```text
Typecheck:
Tests:
Lint:
Build:
Circular dependencies:
```

Donner également :

```text
Technologies before:
Technologies added:
Technologies after:
Candidates rejected:
```

---

# 19. Critère de réussite

Step 11 est réussi si :

1. le catalogue possède davantage de couverture utile ;
2. chaque nouvelle technologie possède des fingerprints défendables ;
3. chaque fingerprint possède des tests positifs ET négatifs ;
4. les collisions connues sont testées ;
5. le scoring existant reste inchangé ;
6. le ranking reste déterministe ;
7. aucune régression n'est introduite ;
8. le catalogue reste la source unique de vérité ;
9. aucun réseau supplémentaire n'est nécessaire ;
10. toutes les validations passent.

## Principe directeur

> **Expand coverage, not uncertainty.**

La priorité absolue est :

```text
Reliable detection
    >
More detections
```

Commencer par l'audit du repository.

Ne modifier le code qu'après avoir produit la matrice de couverture et identifié les technologies réellement prioritaires.

Ne pas chercher à atteindre un nombre arbitraire de technologies.
