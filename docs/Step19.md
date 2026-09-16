# Step 19 — Technology Detection Coverage & Catalog Expansion

## Contexte

DevLens dispose maintenant d'une architecture fortement stabilisée.

État actuel :

```text
Domain
  ↓
Crawler / Snapshot
  ↓
Production Detector
  ↓
Deduplication
  ↓
Scoring
  ↓
Application
  ↓
Persistence
  ↓
API / Worker
```

Les Steps 8–18 ont notamment stabilisé :

- technology catalog ;
- evidence model ;
- detector pipeline ;
- deterministic scoring ;
- golden fixtures ;
- crawler observations ;
- scan lifecycle ;
- API contract ;
- configuration ;
- persistence ;
- PostgreSQL/InMemory parity.

Le catalogue actuel contient **29 technologies** et 6 detectors.

## Objectif

Faire évoluer la couverture technologique de DevLens sans dégrader sa précision.

Le principe fondamental du projet reste :

> **Precision over recall.**

Une technologie ne doit pas être ajoutée simplement parce qu'elle est populaire.

Chaque nouvelle détection doit avoir :

- une signature observable ;
- une justification ;
- une evidence appropriée ;
- un risque de false positive acceptable ;
- une fixture positive ;
- une fixture négative lorsque nécessaire.

---

# 1. Coverage audit

Avant toute modification, auditer le catalogue actuel.

Construire une matrice :

| Category   | Current | Candidate | Existing detector | Evidence |
| ---------- | ------- | --------- | ----------------- | -------- |
| CMS        | ...     | ...       | ...               | ...      |
| Framework  | ...     | ...       | ...               | ...      |
| Ecommerce  | ...     | ...       | ...               | ...      |
| Analytics  | ...     | ...       | ...               | ...      |
| Hosting    | ...     | ...       | ...               | ...      |
| CDN        | ...     | ...       | ...               | ...      |
| CSS        | ...     | ...       | ...               | ...      |
| JS library | ...     | ...       | ...               | ...      |
| Backend    | ...     | ...       | ...               | ...      |

Identifier les catégories sous-représentées.

Ne pas ajouter immédiatement de technologies.

---

# 2. Candidate selection

Sélectionner uniquement des technologies qui répondent à au moins un de ces critères :

- forte présence sur le web ;
- forte valeur pour l'utilisateur DevLens ;
- signature fiable ;
- observabilité directe depuis le snapshot existant ;
- complément logique au catalogue actuel.

Priorité aux technologies détectables sans network probing supplémentaire.

Exemples de familles pouvant être étudiées :

### CMS

- Joomla
- Wix
- Squarespace
- Ghost

### Ecommerce

- PrestaShop
- Magento / Adobe Commerce
- BigCommerce

### Analytics

- Matomo
- Plausible
- Segment

### Infrastructure / CDN

- Cloudflare
- Vercel
- Netlify

### Framework / runtime

- Svelte / SvelteKit
- Nuxt
- Astro

Ces noms sont des **candidats d'audit**, pas une liste obligatoire.

La sélection finale doit être justifiée par les signatures réellement disponibles.

---

# 3. Signature quality audit

Pour chaque candidat, déterminer :

```text
Observable signal
      ↓
Signature
      ↓
Evidence type
      ↓
Confidence
```

Une signature doit être suffisamment spécifique.

Éviter les signatures du type :

```text
"react" anywhere
"vue" anywhere
"wordpress" anywhere
"cloud" anywhere
```

qui créent facilement des false positives.

Préférer :

- headers spécifiques ;
- meta generators ;
- scripts connus ;
- URL patterns fortement spécifiques ;
- resource fingerprints ;
- contenu structurel réellement distinctif.

---

# 4. Detector reuse

Avant de créer un nouveau detector, vérifier si un detector existant suffit.

Architecture actuelle :

```text
HeaderDetector
MetaTagDetector
ScriptUrlDetector
ContentScriptDetector
ResourceDetector
LinkDetector
```

Une nouvelle technologie doit être intégrée au detector approprié lorsque cela est possible.

Ne créer un nouveau detector que si le signal nécessite réellement une nouvelle observation ou une nouvelle logique.

---

# 5. Technology catalog

Toute nouvelle technologie doit être ajoutée via le catalog centralisé.

Respecter le modèle existant :

```text
Technology
├── id
├── name
├── category
├── signatures
└── metadata actuelle
```

Ne jamais dupliquer les définitions dans les detectors.

Les detectors doivent continuer à dépendre du catalog central.

---

# 6. Evidence quality

Chaque détection doit produire l'evidence la plus précise possible.

Exemple :

```text
script_url
```

plutôt que :

```text
html
```

si le signal provient réellement d'un script.

Respecter les 8 evidence types actuels :

```text
html
http_header
script_url
script_content
meta_tag
javascript_global
resource
link
```

Ne pas créer un nouveau type d'evidence sauf nécessité démontrée.

---

# 7. Confidence calibration

Ne pas modifier le scoring engine global.

Pour chaque nouvelle technologie, calibrer uniquement :

```text
detection.confidence
```

selon la force de la signature.

Principe :

```text
strong unique signature
    → high confidence

known but weaker signal
    → medium confidence

ambiguous signal
    → do not detect
```

Ne pas compenser une mauvaise signature avec un score artificiellement élevé.

---

# 8. Negative fixtures

Chaque nouvelle technologie doit disposer de fixtures négatives lorsqu'un false positive plausible existe.

Exemples :

```text
real signature
vs
similar-looking URL
vs
generic keyword
```

Les fixtures doivent démontrer que DevLens ne détecte pas simplement :

- un nom de technologie présent dans du texte ;
- une URL ressemblante ;
- une bibliothèque tierce non pertinente ;
- un fichier bundle générique.

---

# 9. Golden fixture integration

Étendre le système de golden fixtures existant.

Pour chaque technologie ajoutée :

```text
positive fixture
→ expected detection

negative fixture
→ forbidden detection
```

Conserver les propriétés existantes :

- production pipeline réel ;
- determinism ;
- expected detections ;
- forbidden detections.

Ne pas créer un second système de fixtures.

---

# 10. Coexistence

Tester les cas où plusieurs technologies doivent être détectées simultanément.

Exemples :

```text
CMS + Analytics
Framework + Analytics
Ecommerce + Analytics
CDN + Framework
CMS + Ecommerce
```

Une nouvelle signature ne doit pas supprimer ou remplacer une détection légitime existante.

---

# 11. Detector regressions

Après ajout de nouvelles signatures, exécuter l'ensemble des golden fixtures.

Vérifier notamment que les fixtures historiques restent identiques.

Un ajout de technologie ne doit pas provoquer silencieusement :

```text
expected detections ↓
forbidden detections ↑
```

Si une régression apparaît :

1. identifier la collision ;
2. corriger la signature ;
3. ne pas affaiblir les fixtures existantes.

---

# 12. Catalog completeness

Après l'extension, ajouter un test garantissant :

```text
catalog
    ↕
detector references
    ↕
golden fixtures
```

Aucune technologie ne doit être :

- définie mais jamais détectable ;
- référencée mais absente du catalog ;
- présente uniquement dans un detector ;
- oubliée dans les fixtures sans justification.

Utiliser les mécanismes de couverture existants plutôt que créer un registry parallèle.

---

# 13. Documentation

Mettre à jour :

```text
docs/architecture/detectors.md
docs/architecture/domain-model.md
```

Mettre à jour le catalogue si une documentation dédiée existe.

Créer :

```text
docs/Step19-report.md
```

Le rapport doit contenir :

1. Executive Summary
2. Coverage audit
3. Candidate technologies
4. Selected technologies
5. Signature rationale
6. Detector integration
7. Evidence mapping
8. Confidence calibration
9. Positive fixtures
10. Negative fixtures
11. Coexistence tests
12. Regression results
13. Changes made
14. Rejected candidates
15. Deferred candidates
16. Validation results

---

# Contraintes strictes

## Ne pas faire

- pas de nouveau detector sans nécessité ;
- pas de network probing ;
- pas de scraping externe ;
- pas de changement du crawler ;
- pas de changement du snapshot contract ;
- pas de changement du scoring algorithm ;
- pas de changement de l'evidence model ;
- pas de duplicate technology catalog ;
- pas de detector-specific technology definitions ;
- pas de heuristiques génériques basées sur des mots ;
- pas de détection probabiliste ;
- pas de machine learning ;
- pas de dépendance externe ;
- pas de baisse volontaire des seuils de précision.

## Important

**Ajouter moins de technologies mais avec de meilleures signatures.**

Si une candidate ne possède pas de signature suffisamment fiable avec les observations actuelles :

> **NE PAS L'AJOUTER.**

La reporter dans `Rejected` ou `Deferred` avec justification.

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

Vérifier également explicitement :

```text
golden fixtures
production detector
catalog completeness
negative fixtures
determinism
```

Comparer :

- nombre de technologies avant/après ;
- nombre de detectors avant/après ;
- nombre de tests avant/après ;
- nombre de golden fixtures avant/après.

## Critère de réussite

Le Step 19 est terminé lorsque :

- la couverture technologique a été auditée ;
- les nouvelles technologies sont justifiées ;
- chaque nouvelle signature possède une evidence précise ;
- les false positives plausibles sont couverts ;
- les golden fixtures historiques restent vertes ;
- aucune régression de précision n'est introduite ;
- le catalog reste la source de vérité ;
- le detector pipeline reste déterministe ;
- aucune architecture inutile n'a été ajoutée.

**La qualité des détections prime sur le nombre de technologies détectées.**
