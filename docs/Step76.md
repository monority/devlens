Tu travailles sur le monorepo DevLens.

# Step 76 — Detection Corroboration & Signal Quality

## Contexte

DevLens dispose maintenant d’une chaîne de détection relativement complète :

* catalogue déclaratif ;
* signatures sur plusieurs sources d’observation ;
* détection HTTP ;
* resource intelligence ;
* `resource_content` ;
* version extraction + consensus ;
* relations `implies` / `requires` / `excludes` ;
* détections directes ou dérivées ;
* `DetectionExplainability` ;
* comparaison de scans ;
* diff added / removed / version / provenance / confidence.

Les Steps 73–74 permettent maintenant de répondre :

> pourquoi cette technologie est-elle détectée ?

et :

> qu’est-ce qui a changé entre deux scans ?

Le prochain problème produit est la **qualité du signal**.

Deux détections ayant toutes les deux un score de 90 ne signifient pas nécessairement la même chose :

```text
Technology A
  header signature
  resource URL signature
  meta signature

Technology B
  une seule signature faible
```

Le moteur actuel sait déjà compter les signaux dans son score, mais il ne représente pas explicitement la **corroboration entre sources indépendantes**.

L’objectif de ce step est donc d'ajouter une couche de **signal quality / corroboration** qui décrit la solidité observable d'une détection, sans changer le scoring existant.

---

# 1. Commence par inspecter le repo

Avant toute modification :

1. inspecte la structure réelle ;
2. lis `Detection`, `Evidence` et les types associés ;
3. lis `ConfidenceScorer` ;
4. lis `DeduplicatingDetector` ;
5. lis `DetectionExplainability` ;
6. lis `detection-explainability.ts` ;
7. lis les signatures/catalogue ;
8. cherche s’il existe déjà une notion de source, strength, confidence, evidence count ou signal quality ;
9. lis les tests correspondants.

Ne crée aucune abstraction parallèle si une couche existante peut être étendue proprement.

---

# 2. Principe fondamental

**Ne change PAS le score actuel.**

Le `confidence` actuel reste exactement ce qu’il est :

> un deterministic ranking score, pas une probabilité.

Step 76 ajoute une information complémentaire.

Exemple :

```text
WordPress
Confidence: 100

Signal quality:
  Strong
  3 evidence sources
```

Cela ne signifie PAS :

```text
100% certain
```

et ne doit jamais être présenté comme tel.

---

# 3. Définir la notion de source indépendante

Le premier travail est de déterminer les sources réellement présentes dans le modèle actuel.

Les sources peuvent notamment correspondre à :

```text
header
meta
script_url
resource_url
resource_content
content
link
```

Utilise les types réellement présents dans le repo.

Ne crée pas une nouvelle taxonomie si les types existants suffisent.

Une même source peut produire plusieurs evidences.

Exemple :

```text
meta #1
meta #2
meta #3
```

Cela doit compter comme **une source corroborante**, pas trois sources indépendantes.

À l'inverse :

```text
header
meta
script_url
```

représentent trois familles d'observation distinctes.

---

# 4. Modèle de qualité

Crée un modèle pur et sérialisable, par exemple :

```ts
SignalQuality
Corroboration
SignalQualityLevel
```

Les noms exacts doivent suivre l’architecture réelle.

Le modèle devrait permettre d’exposer au minimum :

```ts
{
  level: ...,
  evidenceCount: number,
  sourceCount: number,
  sources: [...],
  corroborated: boolean
}
```

Adapte la forme au code existant.

### Important

Ne transforme pas `sourceCount` en score probabiliste.

Il s'agit uniquement d'un résumé de l'observabilité.

---

# 5. Niveaux de qualité

Définis un nombre **petit et justifiable** de niveaux.

Par exemple :

```text
single_signal
corroborated
strong
```

ou une nomenclature plus claire adaptée au produit.

Ne crée pas 5–10 niveaux artificiels.

Les niveaux doivent être déterministes et documentés.

Une règle raisonnable pourrait être :

```text
single_signal
→ une seule famille de source observable

corroborated
→ au moins deux familles de source indépendantes

strong
→ plusieurs familles indépendantes + diversité suffisante
```

Mais **ne copie pas aveuglément cet exemple**.

Inspecte le catalogue et les données réelles avant de fixer les seuils.

Le but est que les niveaux correspondent à des propriétés réellement observables.

---

# 6. Cas particuliers

### A. Détection dérivée

Une détection `implies` sans evidence directe ne doit pas être artificiellement appelée "strong".

Exemple :

```text
Next.js
  direct evidence

React
  derived from Next.js
  no direct evidence
```

React doit avoir une qualité qui reflète :

```text
derived
no direct evidence
```

et non :

```text
strong
```

simplement parce que Next.js est fortement détecté.

La qualité du signal doit rester attachée à **la détection concernée**.

---

### B. Version evidence

Une evidence utilisée pour extraire une version compte comme evidence de la technologie uniquement si elle constitue effectivement une observation de présence.

Ne compte pas deux fois une même evidence parce qu’elle sert à la fois :

* détection ;
* version.

Réutilise `getEvidenceKey` lorsque pertinent.

---

### C. Evidence identique

Deux evidences avec la même identité canonique doivent être comptées une seule fois.

---

### D. Plusieurs matches dans une même source

Exemple :

```text
script_url:
  /jquery.js
  /jquery.min.js
  /jquery-3.7.1.js
```

Cela peut produire plusieurs evidences mais seulement :

```text
sourceCount = 1
```

---

### E. Resource content

`resource_content` doit être correctement intégré.

Une observation :

```text
resource_content
```

constitue une famille de source distincte.

Elle ne doit pas être confondue avec :

```text
resource_url
```

---

### F. Conflits de version

Un conflit de version ne doit pas automatiquement dégrader la qualité de présence.

Exemple :

```text
WordPress
  meta evidence
  resource_url evidence
  version conflict
```

La présence peut rester fortement corroborée malgré le conflit de version.

Version quality et detection quality doivent rester deux concepts distincts.

---

# 7. Déterminisme

Le résultat doit être entièrement déterministe.

Même entrée :

→ même `SignalQuality`.

L'ordre des evidences ne doit pas changer le résultat.

L'ordre des sources doit être stable.

Par exemple :

```text
sources: ["header", "meta", "script_url"]
```

plutôt que l'ordre d'arrivée.

Ajoute des tests où les evidences sont volontairement permutées.

---

# 8. Explainability

Intègre la qualité au modèle du Step 73.

Exemple :

```text
WordPress
Confidence: 100

Signal quality
Strong · 3 sources

Detected because
• Meta generator matched ...
• Header matched ...
• Resource URL matched ...
```

Le modèle d'explication doit donc pouvoir exposer quelque chose comme :

```ts
explanation.signalQuality
```

ou une structure équivalente.

Ne duplique pas les evidences.

La qualité doit être dérivée des mêmes données.

---

# 9. API

Expose la qualité via `DetectionResponse`.

Exemple conceptuel :

```ts
{
  technology: "wordpress",
  confidence: 100,
  explanation: {
    ...
    signalQuality: {
      level: "strong",
      evidenceCount: 3,
      sourceCount: 3,
      sources: [...]
    }
  }
}
```

Si l'architecture existante justifie également un champ top-level, fais-le seulement si cela évite réellement une duplication.

Privilégie une seule source de vérité.

Le mapping doit rester pur.

Teste :

* direct ;
* derived ;
* single source ;
* multi-source ;
* empty evidence ;
* resource_content ;
* duplicate evidence ;
* version conflict.

---

# 10. UI

Intègre le résultat dans `DetectionItem`.

Le rendu doit rester discret.

Exemple :

```text
WordPress
Confidence: 100
Strong · 3 sources

Detected because
• ...
• ...
```

Pour une détection simple :

```text
jQuery
Confidence: 85
Single signal · 1 source
```

Pour une détection dérivée :

```text
React
Confidence: 0
Derived · no direct evidence
```

### Contraintes

* pas de pourcentage ;
* pas de langage probabiliste ;
* pas de gros badge dominant ;
* pas de couleurs arbitraires ;
* réutiliser le design system existant ;
* ne pas rendre la liste de détections beaucoup plus haute qu’actuellement ;
* si nécessaire, utiliser une ligne secondaire compacte.

Le but est de donner une information supplémentaire, pas de transformer `DetectionItem` en panneau d'administration.

---

# 11. Cas "no evidence"

Une détection sans evidence directe doit être représentée honnêtement.

Exemple :

```text
Derived · no direct evidence
```

Ne lui attribue pas :

```text
Single signal
```

car cela laisserait entendre qu'un signal direct existe.

---

# 12. Relationship semantics

Ne modifie PAS `RelationshipResolver`.

Utilise simplement ses résultats existants :

```text
source
derivedFrom
relationship type
```

Pour les détections dérivées, la qualité doit refléter les observations réellement disponibles.

Exemple :

```text
Next.js
  2 direct sources

React
  derived from Next.js
  0 direct sources
```

La qualité de React ne doit pas hériter mécaniquement des 2 sources de Next.js.

---

# 13. Tests

Ajoute une couverture ciblée et substantielle.

### Source counting

Tester :

```text
1 evidence / 1 source
3 evidences / 1 source
2 evidences / 2 sources
4 evidences / 3 sources
```

### Duplicate evidence

Même `getEvidenceKey` :

→ une seule evidence comptée.

### Ordering

Permutation des evidences :

→ résultat identique.

### Source ordering

Résultat toujours stable.

### resource_content

Tester qu'il constitue bien une source distincte.

### Derived

Tester :

```text
derived + no evidence
derived + direct evidence
```

### Version conflict

Tester :

```text
multi-source + version conflict
```

et vérifier que le conflit n'écrase pas la qualité de présence.

### Explainability

Tester `DetectionExplainability` avec :

* single source ;
* multi-source ;
* derived ;
* no evidence.

### API

Tester le mapping.

### UI

Tester au minimum :

* single signal ;
* multi-source ;
* derived/no direct evidence.

---

# 14. Régression critique

Les résultats de détection doivent être **strictement identiques**.

En particulier :

* aucun changement à `ConfidenceScorer` ;
* aucun changement à `DeduplicatingDetector` sauf si nécessaire pour exposer une donnée déjà existante ;
* aucun changement aux relations ;
* aucun changement au catalogue juste pour créer des fixtures artificielles.

Les golden/real-world tests doivent continuer à produire les mêmes technologies, scores et versions.

Step 76 ajoute une métrique descriptive ; il ne change pas la décision de détection.

---

# 15. Performance

Le calcul doit rester léger.

Il s'agit d'un parcours des evidences existantes.

Ne :

* refais aucun scan ;
* ne fais aucun réseau ;
* ne parcours pas le catalogue global ;
* n'ajoute aucune base de données ;
* ne crée aucun cache global complexe.

Complexité attendue :

```text
O(number of evidences)
```

par détection.

---

# 16. Non-objectifs

NE PAS faire :

* nouveau crawler ;
* nouveau detector ;
* nouveau scoring ;
* modification de `ConfidenceScorer` ;
* nouveau système de poids ;
* probabilité de détection ;
* machine learning ;
* expansion massive du catalogue ;
* nouveau système de relationships ;
* migration SQL ;
* analytics ;
* historique ;
* dashboard ;
* E2E/Playwright.

---

# 17. Validation finale

À la fin :

1. tests ciblés ;
2. Vitest complet ;
3. typecheck ;
4. ESLint ;
5. Prettier sur les fichiers touchés ;
6. build ;
7. vérification du déterminisme ;
8. vérification que les scores n'ont pas changé ;
9. vérification que les technologies détectées n'ont pas changé ;
10. vérification UI.

Corrige les vrais problèmes trouvés.

Ne fais pas d'audit spéculatif interminable.

---

# 18. Git

Commit uniquement les fichiers réellement liés au Step 76.

Ne jamais utiliser :

```bash
git add -A
```

Ne jamais committer :

* `.poolside/`
* `settings.local.yaml`
* `.env*`
* secrets ;
* runtime/scratch files ;
* `docs/Step*.md` ;
* changements préexistants hors scope.

Commit exact :

```text
Step 76: Detection Corroboration & Signal Quality
```

---

# 19. Rapport final

Retourne exactement une synthèse de ce type :

```text
STATUS: COMPLETE / BLOCKED

ARCHITECTURE
- modèle de signal quality
- emplacement
- règles de calcul

CORROBORATION
- source counting
- dedup
- niveaux
- derived detections
- version conflicts

EXPLAINABILITY
- intégration

API
- changements

UI
- changements

TESTS
- nouveaux tests
- total Vitest

REGRESSION
- technologies
- confidence
- versions

VALIDATION
- typecheck
- ESLint
- Prettier
- build

GIT
- commit hash
- fichiers inclus
- fichiers exclus

LIMITATIONS
- uniquement les limitations réelles
```

Ne prétends jamais qu'une validation a été exécutée si elle ne l'a pas été.

Commence maintenant par inspecter le repo puis implémente le **Step 76 de bout en bout**.
