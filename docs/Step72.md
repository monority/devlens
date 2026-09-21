# DevLens — Step 72 — Advanced Version Intelligence

## 0. Mission

Step 71 a ajouté la détection de technologies depuis le contenu des ressources JavaScript/CSS.

DevLens sait maintenant exploiter plusieurs familles de signaux :

```text
headers
meta
script URLs
HTML/content
resources
links
resource content
relationships
```

Mais le versioning introduit en Step 67 reste relativement simple :

```text
TechnologyDefinition
    ↓
VersionRule
    ↓
extractVersion(...)
```

Step 72 doit transformer ce mécanisme en une véritable **Version Intelligence** déterministe et explicable.

Objectif produit :

> Lorsqu'une technologie est détectée, DevLens doit pouvoir fournir une version lorsqu'une version suffisamment fiable est réellement observable, tout en refusant de deviner lorsqu'il existe des signaux contradictoires ou insuffisants.

Exemple :

```text
WordPress
Version: 6.8.2
Evidence: meta generator
```

ou :

```text
jQuery
Version: 3.7.1
Evidence: resource content
```

mais :

```text
React
Version: unknown
```

si aucun signal fiable ne permet de déterminer la version.

---

# 1. Règle fondamentale

**Ne jamais deviner une version.**

Une version doit être :

* directement observable ;
* extraite par une règle déclarative ;
* associée à une evidence ;
* suffisamment fiable selon les règles de consensus.

En particulier :

```text
absence de version ≠ version inconnue estimée
```

et :

```text
"latest" ≠ version
```

---

# 2. Audit obligatoire

Avant toute modification, lire le code réel de :

```text
packages/core
packages/detectors
apps/web
```

et notamment :

```text
version.ts
Detection
TechnologyVersion
VersionRule
extractVersion
DeduplicatingDetector
catalog/types.ts
catalog/technologies/*
getEvidenceKey
ResourceContentDetector
```

Lire également les tests Step 67 et Step 71.

Comprendre exactement :

* où les versions sont actuellement extraites ;
* comment les signatures transmettent leurs observables ;
* comment une Detection fusionne plusieurs résultats ;
* comment l'evidence est représentée ;
* comment les versions sont persistées ;
* comment l'API expose la version ;
* comment l'UI l'affiche.

Ne pas remplacer une abstraction existante sans nécessité.

---

# 3. Problème actuel

Le modèle actuel permet essentiellement :

```text
un signal
    ↓
une VersionRule
    ↓
une version
```

Mais en pratique une technologie peut exposer sa version dans plusieurs endroits :

```text
header
script URL
resource content
meta
HTML
```

Exemple :

```text
WordPress
├── meta generator → 6.8.2
├── script URL → 6.8.2
└── resource content → aucun
```

ou :

```text
Technology
├── signal A → 3.7.1
├── signal B → 3.7.1
└── signal C → 3.6.0
```

DevLens doit désormais pouvoir distinguer :

```text
consensus fort
consensus partiel
conflit
aucune version
```

sans transformer cela en estimation statistique.

---

# 4. Version evidence

Une version ne doit plus être une simple string détachée de son origine.

Introduire une représentation permettant de conserver au minimum :

```text
version
source / observable
evidence
```

Conceptuellement :

```ts
type VersionObservation = {
  version: TechnologyVersion
  evidence: Evidence
}
```

Adapter cette forme aux abstractions réelles du repository.

Ne pas dupliquer inutilement `Evidence`.

La version doit rester reliée à une preuve existante ou à une représentation strictement compatible.

---

# 5. Sources supportées

Le système doit pouvoir extraire des versions depuis les sources déjà présentes.

Au minimum étudier :

```text
headers
meta
script URL
resource URL
resource content
HTML/content
```

Ne pas obliger toutes les technologies à utiliser toutes les sources.

Une technologie doit déclarer uniquement les sources pour lesquelles elle possède un fingerprint suffisamment fiable.

---

# 6. Nouveau modèle déclaratif

Étendre `TechnologyDefinition` avec une représentation déclarative de version suffisamment expressive.

Le modèle doit permettre quelque chose conceptuellement proche de :

```ts
versionRules?: {
  source: VersionSource
  pattern: RegExp
  captureGroup?: number
}[]
```

avec par exemple :

```text
header
meta
script_url
resource_url
resource_content
content
```

Mais adapter les noms au code réel.

Important :

**ne pas créer un second système parallèle à celui de Step 67.**

Le système Step 67 doit être généralisé.

Les anciennes `VersionRule` doivent rester compatibles.

---

# 7. Extraction

Créer une abstraction pure permettant conceptuellement :

```text
observable
    +
version rules
    ↓
VersionObservation[]
```

Elle doit :

* ne faire aucun I/O ;
* ne jamais lancer de code ;
* gérer les groupes de capture ;
* refuser les matches invalides ;
* retourner `null` / aucune observation lorsqu'il n'y a pas de match ;
* rester déterministe.

Une regex qui throw ne doit jamais casser le scan.

---

# 8. Normalisation

Introduire une normalisation prudente des versions.

Accepter par exemple :

```text
3.7.1
v3.7.1
version 3.7.1
```

si la règle l'autorise explicitement.

Mais ne pas transformer arbitrairement :

```text
3.7
```

en :

```text
3.7.0
```

sauf si le contrat de la technologie indique explicitement que c'est valide.

Ne pas faire de comparaison sémantique agressive.

Une version reste une valeur observable.

---

# 9. Validation des versions

Ajouter une validation minimale.

Refuser comme version :

```text
""
"latest"
"unknown"
"current"
undefined
```

sauf si le contrat de la technologie indique explicitement autre chose.

Les versions doivent être bornées en longueur afin qu'un contenu arbitraire ne devienne jamais une version.

Exemple :

```text
max version length = 64
```

ou une limite équivalente justifiée.

---

# 10. Consensus

Le cœur de Step 72.

Lorsqu'une technologie produit plusieurs observations :

```text
WordPress
  6.8.2
  6.8.2
  6.8.2
```

→ version :

```text
6.8.2
```

Lorsqu'elles sont :

```text
6.8.2
6.8.2
6.7.9
```

ne pas simplement prendre la première.

Le système doit appliquer une politique déterministe documentée.

Une stratégie acceptable est :

```text
majority / weighted consensus
```

à condition qu'elle soit strictement déterministe et basée sur des caractéristiques explicites des sources.

Mais **ne pas inventer un score probabiliste**.

---

# 11. Conflit de version

Cas :

```text
header → 6.8.2
script URL → 6.7.9
```

Le résultat doit rendre le conflit observable.

Par défaut, préférer :

```text
version = undefined
conflict = true
```

plutôt que de choisir arbitrairement une version.

Exception uniquement si une hiérarchie de confiance existante peut être justifiée objectivement et documentée.

Le système ne doit pas cacher un conflit.

---

# 12. Consensus par source

Les sources ne sont pas nécessairement équivalentes.

Une version provenant :

```text
resource content
```

peut être plus directement liée à la librairie qu'une chaîne générique dans le HTML.

Mais ne créez pas immédiatement une grande matrice de poids arbitraires.

Commencer par une politique simple :

1. même version observée plusieurs fois → consensus ;
2. version unique provenant d'un fingerprint explicitement fiable → acceptée ;
3. versions contradictoires → conflit ;
4. aucun signal → absence de version.

Si une hiérarchie est réellement nécessaire, la rendre déclarative et testable.

---

# 13. Version + Detection

Une Detection doit pouvoir représenter :

```text
technology
confidence
evidence
version
versionEvidence
```

sans casser les consommateurs existants.

Si la version est absente :

```text
version === undefined
```

et aucune UI ne doit afficher un faux placeholder.

---

# 14. Deduplication

La déduplication doit fonctionner au niveau :

```text
technology + evidence
```

et ne doit pas transformer :

```text
6.8.2
6.7.9
```

en une seule observation silencieuse.

Les observations de versions contradictoires doivent rester disponibles pour la résolution.

---

# 15. Resource Content

Step 71 doit être pleinement exploité.

Ajouter des règles de version provenant de :

```text
resource_content
```

pour les technologies où le bundle expose réellement une version.

Ne pas forcer une version si les bundles minifiés ne contiennent aucun fingerprint fiable.

Commencer par quelques technologies existantes seulement.

Priorité à celles pour lesquelles une version est réellement observable.

---

# 16. Resource URL

Supporter également les versions encodées dans les URLs lorsqu'elles sont suffisamment explicites.

Exemples conceptuels :

```text
/jquery-3.7.1.min.js
/library@2.4.0/dist/app.js
```

Mais éviter les faux positifs :

```text
/assets/v2/app.js
```

ne doit pas automatiquement signifier :

```text
technology version = 2
```

La signature doit être liée à la technologie.

---

# 17. Headers / Meta

Exploiter les signaux déjà présents.

Exemples conceptuels :

```text
X-Powered-By: PHP/8.3.11
<meta name="generator" content="WordPress 6.8.2">
```

La version doit être attribuée uniquement si le signal correspond à une signature déclarative connue.

---

# 18. Version persistence

Vérifier la chaîne complète :

```text
Detection
↓
mapper
↓
PostgreSQL JSONB
↓
read
↓
Detection
```

Les nouvelles informations de version doivent être backward-compatible.

Les anciennes detections sans version doivent continuer à se désérialiser.

Ajouter les tests de round-trip nécessaires.

---

# 19. API

L'API doit continuer à exposer :

```json
{
  "technology": "...",
  "version": "6.8.2"
}
```

lorsqu'une version est résolue.

Ajouter si nécessaire une représentation minimale du conflit, par exemple :

```json
{
  "version": null,
  "versionConflict": true
}
```

Mais ne pas exposer toute la mécanique interne si elle n'est pas utile au produit.

---

# 20. UI

Améliorer l'affichage existant uniquement lorsque nécessaire.

Le produit doit pouvoir afficher :

```text
WordPress
Version 6.8.2
```

et, en cas de conflit :

```text
WordPress
Version unavailable
Version conflict detected
```

Ne jamais afficher une version choisie arbitrairement comme certaine.

L'UI ne doit pas devenir un dashboard complexe.

---

# 21. Tests unitaires

Ajouter des tests couvrant au minimum :

### Extraction

```text
simple version
capture group
no match
invalid regex
empty match
oversized version
```

### Normalisation

```text
v3.7.1
3.7.1
version 3.7.1
```

### Consensus

```text
same version × 2
same version × 3
single strong observation
different versions
```

### Sources

```text
header
meta
script URL
resource URL
resource content
HTML/content
```

### Determinism

Même ensemble d'observations dans des ordres différents :

```text
result A === result B === result C
```

---

# 22. Tests négatifs

Ajouter de vrais near-misses :

```text
/jquery-foo.js
```

ne doit pas produire :

```text
jQuery version = foo
```

et :

```text
/assets/v2/app.js
```

ne doit pas devenir arbitrairement une version.

Tester aussi :

```text
"WordPress 6.8.2" dans un commentaire non fiable
```

si ce signal n'est pas déclaré comme source valide.

---

# 23. Tests d'intégration

Construire des snapshots réalistes :

### Case A

```text
WordPress
meta → 6.8.2
script URL → 6.8.2
```

Résultat :

```text
WordPress
version = 6.8.2
```

### Case B

```text
jQuery
resource URL → 3.7.1
resource content → 3.7.1
```

Résultat :

```text
jQuery
version = 3.7.1
```

### Case C

```text
technology
source A → 1.2.0
source B → 1.3.0
```

Résultat :

```text
version unavailable
conflict = true
```

### Case D

```text
technology
no version signal
```

Résultat :

```text
version undefined
```

---

# 24. Real-world regression

Conserver toutes les garanties précédentes :

```text
Step 64
Step 67
Step 68
Step 69
Step 70
Step 71
```

Les technologies déjà détectées doivent rester détectées.

Les versions doivent uniquement être enrichies lorsqu'un signal est réellement présent.

Ne pas changer les scores historiques uniquement pour rendre les versions plus fréquentes.

---

# 25. Performance

Le système de versioning doit rester négligeable devant :

```text
HTTP acquisition
```

Mesurer au minimum :

```text
small snapshot
medium snapshot
resource-heavy snapshot
```

Éviter :

* rescans répétés du même contenu ;
* regex exécutées inutilement plusieurs fois ;
* parsing complet de bundles ;
* structures O(n²) inutiles.

---

# 26. Catalogue

Étendre les validations existantes pour détecter :

* source inconnue ;
* pattern invalide ;
* capture group invalide ;
* version rule vide ;
* version rule sans source ;
* version rule impossible à utiliser.

Les règles invalides doivent être détectées au chargement du catalogue.

---

# 27. Documentation

Créer :

```text
docs/Step72-advanced-version-intelligence.md
```

Documenter :

1. problème ;
2. modèle d'observation ;
3. sources ;
4. extraction ;
5. normalisation ;
6. consensus ;
7. conflits ;
8. resource-content ;
9. persistence ;
10. API ;
11. UI ;
12. sécurité ;
13. déterminisme ;
14. performance ;
15. limitations.

Insister sur :

> DevLens reports observed versions, it does not infer versions that are not supported by evidence.

---

# 28. Security

Aucune nouvelle capacité réseau.

Le système de versioning :

* ne fait aucun fetch ;
* ne suit aucun lien ;
* n'exécute aucun code ;
* n'évalue aucun JavaScript ;
* analyse uniquement des données déjà présentes dans le snapshot.

Toutes les limites de Step 70/71 restent intactes.

---

# 29. Audit final obligatoire

Avant commit vérifier :

### Architecture

* un seul système de version extraction ;
* pas de deuxième moteur parallèle ;
* aucune modification inutile du crawler.

### Correctness

* aucune version inventée ;
* conflits visibles ;
* absence de signal = absence de version.

### Determinism

* ordre des observations sans influence ;
* consensus stable.

### Evidence

* toute version résolue est explicable.

### Persistence

* ancien format lisible ;
* nouveau format round-trip.

### API/UI

* version affichée seulement lorsqu'elle est fiable ;
* conflit non masqué.

### Performance

* pas de rescans inutiles.

### Security

* aucune nouvelle I/O.

### Git

```bash
git status
git diff --stat
git diff --cached --stat
```

Ne jamais utiliser :

```bash
git add -A
```

Ne jamais committer :

```text
.env*
.poolside/
settings.local.yaml
secrets
runtime artifacts
scratch files
```

Si un défaut réel est découvert pendant l'audit et appartient au scope de Step 72, le corriger avant commit.

---

# 30. Quality gates

Exécuter les scripts réels du repository :

```bash
pnpm typecheck
pnpm exec eslint .
pnpm exec prettier --check .
pnpm exec vitest run
pnpm build
```

Tous doivent être verts.

Rapporter les chiffres exacts :

```text
passed
failed
skipped
```

---

# 31. Commit

Une fois l'implémentation et l'audit terminés :

```text
Step 72: Advanced Version Intelligence
```

Le commit doit être strictement limité au Step 72.

---

# 32. Rapport final

Retourner :

```text
STEP 72 COMPLETE

Commit:
<hash>

Parent:
<hash>

Files:
<summary>

Version model:
<summary>

Sources supported:
<list>

Consensus:
<summary>

Conflict handling:
<summary>

Technologies enriched:
<list>

Resource-content versioning:
<summary>

Evidence:
<summary>

Persistence:
<summary>

API/UI:
<summary>

Tests:
<exact numbers>

Typecheck:
<result>

Lint:
<result>

Prettier:
<result>

Build:
<result>

Performance:
<result>

Security:
<result>

Self-audit:
<result>

Known limitations:
<genuine limitations only>

Commit scope:
<verified>
```

Ne pas déclarer Step 72 terminé si un gate échoue.
