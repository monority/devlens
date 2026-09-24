# Step 80 — Detection Explainability & Provenance

## Objectif

Step 79 a renforcé la qualité du résultat de scan.

DevLens dispose maintenant d'un résultat de détection plus fiable, mais il manque encore une propriété essentielle pour un produit d'analyse :

> **Chaque détection doit pouvoir expliquer pourquoi elle existe.**

L'utilisateur ne doit pas seulement voir :

```text
Next.js
95%
```

mais pouvoir déterminer de manière fiable :

```text
Next.js
95%

Evidence
├── script_content
│   └── __NEXT_DATA__
├── script_url
│   └── /_next/
└── meta_tag
    └── generator
```

Step 80 introduit donc une **provenance explicite et déterministe des détections**.

Le but n'est pas de créer un nouveau moteur de détection.

Le but est de rendre le résultat actuel :

* explicable ;
* traçable ;
* stable ;
* exploitable par l'UI ;
* exploitable par les comparaisons ;
* exploitable par de futures API ;
* testable sans navigateur.

---

# 1. État actuel

Le pipeline DevLens est conceptuellement :

```text
SiteSnapshot
    ↓
detectors
    ↓
Detection[]
    ↓
deduplication
    ↓
quality / scoring
    ↓
ScanResult
```

Les détections possèdent déjà des éléments d'evidence.

Le problème est que la provenance reste principalement implicite dans la structure actuelle.

Il faut pouvoir répondre de manière programmatique à :

```text
Pourquoi cette technologie a-t-elle été détectée ?
Quels signaux ont contribué ?
Quels types de preuves ont été observés ?
Quelle preuve est la plus forte ?
Combien de sources indépendantes corroborent la détection ?
```

Step 80 formalise ces réponses.

---

# 2. Principe architectural

Ne pas créer :

```text
ExplainabilityAI
DetectionAI
ReasoningEngine
DetectionNarrator
ConfidenceAI
```

Il ne faut aucune IA dans cette étape.

La provenance doit être une conséquence directe des données déjà disponibles.

Architecture souhaitée :

```text
raw detections
      ↓
deduplication
      ↓
quality
      ↓
provenance
      ↓
ScanResult
```

La provenance est une **projection déterministe du résultat**, pas une nouvelle source de vérité.

---

# 3. Nouvelle notion : Detection Provenance

Introduire un modèle explicite représentant la provenance d'une détection.

Conceptuellement :

```ts
interface DetectionProvenance {
  readonly evidenceCount: number;
  readonly evidenceTypes: readonly EvidenceType[];
  readonly strongestEvidenceType: EvidenceType;
}
```

Le modèle exact doit être adapté aux types existants.

Ne pas recopier inutilement toute l'evidence originale.

La provenance doit référencer ou dériver les données existantes.

---

# 4. Evidence Type

Utiliser les types d'evidence déjà présents dans le domaine.

Par exemple :

```text
header
meta_tag
script_url
script_content
resource
```

Ne pas créer une seconde enum parallèle si le discriminant `Evidence['type']` existe déjà.

La source de vérité doit rester le modèle `Evidence`.

Exemple :

```ts
type EvidenceType = Evidence['type'];
```

ou l'équivalent naturel dans l'architecture actuelle.

---

# 5. Evidence Count

Une détection doit exposer le nombre de preuves distinctes qui la soutiennent.

Exemple :

```text
Next.js

evidenceCount = 3
```

pour :

```text
script_content
script_url
meta_tag
```

Ce compteur doit correspondre exactement aux preuves conservées après déduplication.

Ne pas compter :

```text
detector count
```

comme evidence count.

Deux détecteurs peuvent produire la même preuve logique.

La métrique doit représenter les preuves réellement présentes dans la détection finale.

---

# 6. Evidence Types

Exposez les types présents sous forme déterministe.

Exemple :

```ts
[
  'meta_tag',
  'script_content',
  'script_url'
]
```

L'ordre doit être stable.

Ne jamais dépendre de :

* ordre d'exécution des détecteurs ;
* ordre des Promises ;
* ordre d'insertion accidentel ;
* ordre du runtime.

Définir une règle canonique.

Par exemple :

```text
header
meta_tag
script_url
script_content
resource
```

Si certains types n'existent pas encore, ils ne doivent évidemment pas être ajoutés uniquement pour Step 80.

---

# 7. Strongest Evidence

La provenance doit pouvoir indiquer quelle preuve est considérée comme la plus forte.

Attention :

Step 80 ne doit pas inventer une nouvelle confidence.

La notion de force doit réutiliser les informations déjà établies par Step 79.

Si Step 79 possède déjà une notion de qualité ou de poids :

```text
quality
weight
strength
confidence
```

celle-ci doit être utilisée.

Ne pas créer un deuxième système concurrent.

Exemple :

```text
Next.js

script_content   → 95
script_url       → 90
meta_tag         → 85

strongestEvidenceType = script_content
```

Si aucune notion de force par evidence n'existe encore, rester plus simple :

```text
strongestEvidenceType
```

peut être dérivé de l'evidence associée au score représentant déjà la détection.

Ne pas modifier le scoring uniquement pour obtenir cette information.

---

# 8. Provenance Must Be Deterministic

Pour un même snapshot :

```text
same input
    ↓
same detections
    ↓
same provenance
```

Il ne doit jamais être possible d'obtenir :

```text
run A:
script_content, script_url

run B:
script_url, script_content
```

si l'ordre fait partie de l'API exposée.

Même principe pour :

* evidence count ;
* evidence types ;
* strongest evidence ;
* provenance serialization.

---

# 9. No Duplicate Evidence

Une preuve identique ne doit pas être comptée deux fois.

Exemple :

```text
Next.js
  script_url /_next/
  script_url /_next/
```

doit produire :

```text
evidenceCount = 1
```

si les deux entrées représentent exactement la même preuve logique.

Cependant :

```text
script_url /_next/
script_content __NEXT_DATA__
```

doit produire :

```text
evidenceCount = 2
```

La règle de déduplication doit réutiliser la logique existante lorsque celle-ci existe déjà.

Ne pas introduire une troisième implémentation de déduplication si `DeduplicatingDetector` possède déjà cette responsabilité.

---

# 10. Provenance Is Not Narrative

Step 80 ne doit pas générer de phrases artificielles telles que :

```text
"We are highly confident that this website uses Next.js because..."
```

Pas de génération de texte.

La couche métier doit produire des données structurées.

L'UI pourra éventuellement transformer ces données en texte plus tard.

Le domaine reste :

```text
facts
```

et non :

```text
generated explanation
```

---

# 11. Public Domain Contract

La provenance doit être accessible depuis le résultat public de détection de manière cohérente avec les contrats existants.

Exemple conceptuel :

```ts
interface Detection {
  readonly technologyId: TechnologyId;
  readonly technologyName: string;
  readonly category: TechnologyCategory;
  readonly confidence: number;
  readonly evidence: readonly Evidence[];
  readonly provenance: DetectionProvenance;
}
```

Mais :

**ne pas copier aveuglément cette forme.**

Avant modification :

1. inspecter le `Detection` actuel ;
2. inspecter le scoring Step 79 ;
3. inspecter le mapping persistence ;
4. inspecter les consommateurs UI/API ;
5. choisir le plus petit changement compatible.

Si la provenance peut être dérivée sans être stockée dans le modèle persistant, préférer cette solution.

---

# 12. Persistence

Ne pas ajouter une nouvelle colonne PostgreSQL uniquement pour Step 80 si la provenance est entièrement dérivable depuis :

```text
Detection.evidence
Detection.confidence
```

Principe :

```text
persist source facts
derive provenance
```

plutôt que :

```text
persist source facts
persist derived provenance
```

Cela évite la divergence :

```text
evidenceCount = 3
storedProvenance.evidenceCount = 2
```

La persistence ne doit changer que si le modèle actuel ne permet réellement pas de reconstruire la provenance.

---

# 13. API / Serialization

Le résultat exposé par l'application doit rester stable.

Si `Detection` est directement sérialisé vers l'API :

```text
API
 ↓
Detection
```

vérifier précisément l'impact.

La nouvelle propriété doit :

* être déterministe ;
* être sérialisable ;
* ne pas contenir de classe runtime ;
* ne pas contenir de référence circulaire ;
* ne pas exposer des objets HTTP ;
* ne pas exposer le HTML complet ;
* ne pas exposer de secrets ;
* ne pas exposer de contenu inutilement volumineux.

---

# 14. UI

Step 80 peut rendre la provenance visible dans l'interface, mais de manière minimale.

Ajouter uniquement ce qui est nécessaire pour vérifier que le nouveau contrat est réellement consommable.

Exemple :

```text
Next.js
95%

3 signals
script content
script URL
meta tag
```

ou un équivalent cohérent avec l'UI actuelle.

Ne pas créer :

* nouveau dashboard ;
* nouvelle page ;
* nouveau système de filtres ;
* graphique ;
* heatmap ;
* timeline ;
* redesign global ;
* nouveau composant de visualisation complexe.

La priorité est le contrat métier.

---

# 15. Explainability UX

Si une détection est affichée dans l'UI, l'utilisateur doit pouvoir comprendre rapidement :

```text
Detected
```

et :

```text
Why
```

sans ouvrir une énorme structure JSON.

Exemple conceptuel :

```text
Next.js  95%

Detected from 3 signals
• Inline script
• Script URL
• Meta tag
```

Les libellés doivent être dérivés du type d'evidence.

Ne pas dupliquer manuellement les noms dans plusieurs composants.

---

# 16. Tests Domain

Ajouter des tests unitaires couvrant au minimum :

### Test 1 — single evidence

```text
one detection
one evidence

→ count = 1
→ one evidence type
```

### Test 2 — multiple evidence types

```text
three evidence items

→ count = 3
→ three unique types
```

### Test 3 — duplicate evidence

```text
same logical evidence twice

→ count = 1
```

### Test 4 — deterministic ordering

Deux inputs contenant les mêmes preuves dans des ordres différents doivent produire la même provenance.

### Test 5 — strongest evidence

Lorsque le système dispose déjà d'une force/qualité par evidence :

```text
95 > 90 > 85

→ strongest = 95 evidence
```

### Test 6 — no mutation

La construction de provenance ne doit pas muter :

```text
Detection
Evidence[]
```

### Test 7 — empty evidence

Le comportement doit être explicitement défini.

Exemple :

```text
evidenceCount = 0
evidenceTypes = []
strongestEvidenceType = null
```

ou le type équivalent.

Ne pas inventer une valeur comme :

```text
unknown
```

si le modèle ne la prévoit pas.

---

# 17. Integration Tests

Tester au moins un scénario réel du pipeline :

```text
snapshot
 ↓
CompositeDetector
 ↓
DeduplicatingDetector
 ↓
quality
 ↓
provenance
 ↓
final Detection[]
```

Exemple :

```text
Next.js

meta tag      85
script URL    90
script content 95
```

Résultat :

```text
one Detection

confidence = existing Step 79 result

evidenceCount = 3

evidenceTypes =
[
  meta_tag,
  script_url,
  script_content
]

strongest =
script_content
```

Le test doit vérifier que la provenance représente bien le résultat final, et non les résultats intermédiaires.

---

# 18. Regression Tests

Vérifier explicitement :

```text
existing technology detections
existing confidence
existing evidence
existing categories
existing ordering
```

ne changent pas sans raison.

Step 80 ne doit pas modifier le résultat du scoring.

Un test avant/après doit pouvoir démontrer :

```text
confidence unchanged
evidence unchanged
technology identity unchanged
```

La nouvelle propriété est additive.

---

# 19. Architecture Constraints

Step 80 ne doit pas :

* modifier les signatures existantes ;
* modifier les fingerprints existants ;
* ajouter de nouveaux détecteurs ;
* modifier le crawler ;
* modifier la collecte des ressources ;
* modifier le scoring Step 79 ;
* modifier la déduplication sauf bug directement nécessaire à la provenance ;
* introduire une dépendance circulaire ;
* ajouter de l'IA ;
* ajouter un service externe ;
* ajouter une nouvelle base ;
* ajouter une nouvelle abstraction repository ;
* déplacer le domaine pour des raisons cosmétiques.

---

# 20. Anti-Patterns

Ne pas faire :

```ts
const explanation = `Detected ${technology.name} because...`;
```

Ne pas faire :

```ts
provenance.confidence = detection.confidence;
```

si cela duplique une information déjà présente.

Ne pas faire :

```ts
evidenceCount = detectors.length;
```

Ne pas faire :

```ts
evidenceTypes = [...new Set(...)]
```

sans définir un ordre canonique.

Ne pas faire :

```ts
JSON.stringify(evidence)
```

comme nouvelle identité universelle si le projet possède déjà une stratégie de déduplication.

Ne pas stocker une information dérivable dans PostgreSQL sans nécessité.

---

# 21. Documentation

Mettre à jour uniquement les documents concernés.

Au minimum, si présents :

```text
docs/architecture/detection.md
docs/architecture/overview.md
```

Documenter :

```text
Detection
 ├── confidence
 ├── evidence
 └── provenance
```

et expliquer clairement :

> Provenance is derived from the final detection evidence and does not constitute an independent source of truth.

---

# 22. Browser Validation

Si l'UI de détection est modifiée :

```text
pnpm dev
```

ou le mécanisme de preview existant.

Vérifier dans le navigateur :

1. une détection connue apparaît ;
2. le nombre de signaux est correct ;
3. les types de preuves sont lisibles ;
4. aucune donnée brute excessive n'est affichée ;
5. aucune erreur console liée au changement ;
6. les routes existantes fonctionnent toujours ;
7. aucun layout existant n'est cassé.

Si le projet dispose déjà de Playwright / browser tooling, l'utiliser.

Ne pas créer une nouvelle infrastructure E2E uniquement pour Step 80.

---

# 23. Performance

La provenance doit être peu coûteuse.

Éviter :

```text
O(detections × detectors × evidence × serialization)
```

si une simple projection de `Detection.evidence` suffit.

La construction doit idéalement être :

```text
O(total evidence)
```

et ne doit pas effectuer :

* réseau ;
* accès DB ;
* parsing HTML ;
* lecture de fichiers ;
* recherche externe.

---

# 24. Non-objectifs

Step 80 ne doit PAS implémenter :

* nouveau detector ;
* nouveau fingerprint ;
* nouveau crawler ;
* nouveau resource fetch ;
* nouveau scoring system ;
* Bayesian inference ;
* machine learning ;
* LLM explanation ;
* AI-generated explanations ;
* probability calibration ;
* historical confidence tracking ;
* scan comparison redesign ;
* dashboard redesign ;
* user feedback loop ;
* automatic false-positive learning ;
* authentication ;
* billing ;
* queues ;
* distributed processing.

---

# 25. Definition of Done

Step 80 est terminé lorsque :

* `Detection` possède une provenance exploitable ou une projection équivalente ;
* la provenance est entièrement déterministe ;
* elle représente les preuves du résultat final ;
* les preuves identiques ne sont pas comptées plusieurs fois ;
* les types d'evidence sont ordonnés de manière canonique ;
* la preuve la plus forte est identifiable lorsque l'information existe déjà ;
* aucun nouveau système de scoring concurrent n'est créé ;
* aucune donnée dérivée inutile n'est persistée ;
* le modèle reste sérialisable ;
* les résultats existants ne changent pas ;
* les tests unitaires couvrent les cas nominaux et limites ;
* un test d'intégration couvre le pipeline réel ;
* l'UI, si modifiée, affiche une explication concise et lisible ;
* aucune régression API n'est introduite ;
* `pnpm typecheck` passe ;
* `pnpm lint` passe ;
* `pnpm test` passe ;
* `pnpm build` passe ;
* `npx madge --circular` ne révèle aucune nouvelle circularité ;
* la validation navigateur passe lorsque l'UI a été modifiée.

---

# 26. Validation Commands

Exécuter :

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
npx madge --circular
```

Puis, si l'UI est modifiée :

```bash
pnpm test:e2e
```

ou l'outil navigateur existant du projet.

Le rapport final doit distinguer :

```text
Domain / contract validation
Integration validation
API / serialization validation
Browser validation
Infrastructure limitations
```

---

# 27. Expected Result

Avant :

```text
Next.js
95%
```

Après :

```text
Next.js
95%

3 signals
├── meta tag
├── script URL
└── script content

Strongest signal
└── script content
```

Mais le modèle métier doit rester essentiellement :

```text
Detection
    ↓
evidence
    ↓
derived provenance
```

et non :

```text
Detection
    ↓
AI explanation
```

---

# 28. Guiding Principle

Step 79 :

```text
Make the result better.
```

Step 80 :

```text
Make the result explainable.
```

La chaîne devient :

```text
Observation
    ↓
Detection
    ↓
Deduplication
    ↓
Quality
    ↓
Provenance
    ↓
Explainable Result
```

DevLens doit progressivement passer de :

```text
"We detected Next.js."
```

à :

```text
"We detected Next.js,
and here are the concrete signals supporting that result."
```

La provenance doit rester **factuelle, déterministe et dérivée des preuves existantes**.

La complexité du produit doit venir de la richesse des observations, pas d'une couche opaque de raisonnement.
