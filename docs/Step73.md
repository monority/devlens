Tu travailles sur le monorepo DevLens.

## Step 73 — Detection Explainability & Evidence Graph

### Contexte

DevLens dispose maintenant de :

* pipeline de détection déterministe ;
* 54 technologies déclaratives ;
* plusieurs types d’evidence ;
* versioning avancé avec provenance et conflits ;
* relations `implies` / `requires` / `excludes` ;
* détections directes ou dérivées ;
* `derivedFrom` et `relationshipConflicts` ;
* UI/API exposant déjà une partie de ces informations.

Le problème restant est produit : DevLens sait détecter une technologie, mais l’explication de **pourquoi** elle est considérée comme présente reste dispersée entre `evidence`, `version`, `source`, `derivedFrom` et les relations.

Nous voulons maintenant une représentation d’explication **structurée, déterministe et réutilisable**.

Exemple cible :

```text
WordPress
Confidence: 100

Detected because:
  • Meta generator matched "WordPress 6.8.2"
  • Resource URL matched "/wp-includes/..."

Version:
  6.8.2
  Source: meta

Related:
  • WooCommerce requires WordPress
```

Pour une détection dérivée :

```text
React
Confidence: 0

Detected because:
  • Derived from Next.js through "implies"
  • Source detection: Next.js

Direct evidence:
  None
```

Pour un conflit de version :

```text
Version:
  unavailable — conflict detected

Conflict:
  • header → 18.2.0
  • script_url → 18.3.1
```

### Important

Avant toute modification :

1. inspecte réellement le repo ;
2. lis les types `Detection`, `Evidence`, versioning et relationships ;
3. inspecte `detection-explainability.ts` s’il existe déjà ;
4. inspecte les composants UI/API qui consomment ces données ;
5. identifie ce qui est déjà disponible afin de ne pas dupliquer inutilement les concepts.

Ne suppose pas la structure exacte du repo.

---

# Objectif architectural

Créer un modèle central d’explication de détection, construit à partir des données existantes.

Le modèle doit être :

* pur ;
* déterministe ;
* sérialisable ;
* indépendant de React ;
* indépendant de PostgreSQL ;
* utilisable par l’API ;
* utilisable par l’UI ;
* testable directement ;
* dérivé des faits existants plutôt que persisté.

Ne crée PAS une nouvelle base de données ou migration pour les explications.

L’explication doit pouvoir évoluer sans devoir migrer les anciennes lignes de scan.

---

# 1. Modèle d’explication

Conçois un modèle adapté au code réel, par exemple autour de :

```ts
DetectionExplanation
ExplanationReason
ExplanationGraph
```

Le nom exact peut être adapté à l’architecture existante.

Le modèle doit permettre de représenter au minimum :

### A. Evidence directe

Une raison correspondant à une evidence existante.

Exemple conceptuel :

```ts
{
  kind: "evidence",
  evidenceType: "meta",
  summary: "...",
  evidence: ...
}
```

Chaque evidence doit être reliée à la détection concernée.

### B. Détection dérivée

Pour une détection provenant d’une relation `implies` :

```ts
{
  kind: "relationship",
  relationshipType: "implies",
  sourceTechnology: "nextjs",
  targetTechnology: "react"
}
```

L’explication doit clairement distinguer :

* technologie directement observée ;
* technologie dérivée.

Ne transforme jamais une détection dérivée en evidence directe.

### C. Version

La version doit rester séparée de la preuve de présence.

Expose notamment :

* version résolue ;
* source ;
* evidence de version lorsque disponible ;
* conflit éventuel.

Une version observée ne doit pas être interprétée comme une nouvelle raison indépendante de présence si elle est déjà portée par la même evidence.

### D. Conflits

Représente explicitement :

* `versionConflict` ;
* `relationshipConflicts`.

Ne supprime aucune evidence pour "résoudre" un conflit.

Le modèle doit permettre à l’UI de dire clairement qu’un conflit existe.

### E. Absence d’evidence directe

Une détection peut exister sans evidence directe, notamment pour les détections dérivées.

Ne fabrique aucune evidence.

Expose plutôt explicitement l’état :

```text
No direct evidence available.
```

ou un équivalent typé.

---

# 2. Evidence Graph

Si l’architecture existante s’y prête, représente l’explication comme un petit graphe normalisé.

Exemple conceptuel :

```text
Detection(react)
      ↑
 derived_from
      |
Detection(nextjs)
      ↑
 supported_by
      |
Evidence(script_url)
```

et :

```text
Detection(wordpress)
      ↑
 supported_by
      |
Evidence(meta)
```

Le graphe doit rester léger.

Ne crée PAS :

* graph database ;
* nouveau moteur de graph ;
* abstraction générique inutile ;
* système de règles parallèle au système de relationships.

Il s’agit d’une représentation d’explication dérivée des données existantes.

Si un graphe explicite apporte trop de complexité par rapport aux données actuelles, utilise plutôt une structure normalisée équivalente et documente ce choix.

---

# 3. Déterminisme

Toutes les explications doivent être parfaitement déterministes.

Définis des règles d’ordre explicites.

Par exemple :

1. evidence ;
2. relation ;
3. version ;
4. conflits ;

ou un ordre plus pertinent si le code existant impose autre chose.

À l’intérieur d’une même catégorie :

* ordre stable ;
* aucune dépendance à l’ordre d’insertion ;
* aucune dépendance à l’ordre d’un Set/Map ;
* aucun timestamp ;
* aucun random.

Deux appels sur la même `Detection` doivent produire exactement la même structure.

Ajoute des tests d’ordre.

---

# 4. Déduplication

Deux raisons identiques ne doivent pas être produites deux fois.

Réutilise les identités d’evidence existantes lorsque possible, notamment `getEvidenceKey`.

Ne crée pas une seconde définition concurrente de l’identité d’une evidence.

---

# 5. API

Expose l’explication via la réponse API des détections.

Exemple conceptuel :

```ts
{
  technology: "wordpress",
  confidence: 100,
  evidence: [...],
  version: "6.8.2",
  versionSource: "meta",
  explanation: {
    ...
  }
}
```

L’explication doit être calculée à partir des données déjà disponibles.

Ne persiste pas l’explication comme un blob supplémentaire si elle peut être reconstruite de manière fiable.

Préserve la compatibilité avec les anciennes données.

Teste notamment :

* direct detection ;
* derived detection ;
* version resolved ;
* version conflict ;
* relationship conflict ;
* absence d’evidence.

---

# 6. UI

Utilise le modèle central d’explication dans l’UI existante.

Le but n’est pas de refaire le design de DevLens.

Améliore `DetectionItem` / le composant réellement responsable après inspection.

Pour une détection directe, afficher clairement une section du type :

```text
Detected because
• Meta generator matched "WordPress 6.8.2"
• Resource URL matched "/wp-includes/..."
```

Pour une détection dérivée :

```text
Detected because
• Derived from Next.js (implies)
```

Puis, si disponible :

```text
Version
6.8.2 · meta
```

Et pour les conflits :

```text
Conflict
Version evidence is inconsistent
```

Le wording exact peut être adapté au design existant.

### Contraintes UI

* ne pas afficher `confidence` comme un pourcentage ;
* ne pas inventer d’information ;
* ne pas transformer une absence d’evidence en "not detected" ;
* ne pas afficher des détails techniques inutiles par défaut ;
* conserver la lisibilité de la liste de détections ;
* respecter les composants/styles existants.

Si une section expandable/collapsible est déjà disponible ou naturelle dans le design, elle peut être utilisée.

---

# 7. Explainability utility existante

Si `detection-explainability.ts` existe déjà :

* commence par comprendre son rôle ;
* conserve les API utiles ;
* fais-en le point central si elle constitue déjà le bon emplacement ;
* évite de créer un second système parallèle.

Si elle est actuellement trop limitée, fais une évolution cohérente plutôt qu’une duplication.

---

# 8. Tests

Ajoute une couverture substantielle mais ciblée.

Minimum :

### Direct detection

* plusieurs evidences ;
* une evidence ;
* aucune evidence ;
* déduplication.

### Ordering

* entrée dans ordre différent → même explication ;
* evidences triées de manière déterministe.

### Derived detection

* `implies` ;
* `derivedFrom` ;
* source technology ;
* distinction direct/derived.

### Version

* version résolue ;
* provenance ;
* version conflict ;
* evidence de version.

### Relationships

* `requires` conflict ;
* `excludes` conflict ;
* plusieurs conflits ;
* aucune mutation de la détection source.

### Serialization

Si le modèle API est séparé du modèle domaine :

* mapping complet ;
* champs absents correctement omis ;
* backward compatibility.

### UI

Teste les cas importants avec le système de test React déjà présent :

* evidence directe affichée ;
* derived reason affichée ;
* version conflict affiché ;
* absence d’evidence directe correctement représentée.

Ne crée pas Playwright/E2E si le repo n’en possède toujours pas.

---

# 9. Non-objectifs

NE PAS faire dans ce step :

* nouveau crawler ;
* nouveaux types de ressources ;
* nouveau scoring ;
* modification de `ConfidenceScorer` ;
* refonte de `RelationshipResolver` ;
* expansion massive du catalogue ;
* nouvelles règles de détection juste pour alimenter l’UI ;
* nouvelle migration SQL ;
* export complet CSV/JSON ;
* système de graph database ;
* Playwright/E2E ;
* changement du sens de `confidence`.

Le score reste un **deterministic ranking score**, jamais une probabilité.

---

# 10. Régression

Les résultats de détection existants doivent rester identiques.

En particulier :

* golden fixtures ;
* real-world fixtures ;
* production detector ;
* Step 68 catalog tests ;
* Step 69 relationship tests ;
* Step 70 resource intelligence ;
* Step 71 resource-content detection ;
* Step 72 version consensus.

Ce step ajoute de l’explication, il ne doit pas changer les décisions de détection.

Si un test existant échoue uniquement parce qu’il attend une ancienne forme d’API et que le changement est réellement nécessaire, adapte-le proprement et documente pourquoi.

Ne modifie pas un résultat métier pour faire passer un test.

---

# 11. Validation finale

À la fin :

1. tests ciblés ;
2. Vitest complet ;
3. typecheck ;
4. ESLint ;
5. Prettier sur les fichiers touchés ;
6. build ;
7. audit manuel du modèle d’explication ;
8. vérification qu’aucune explication n’invente de preuve ;
9. vérification de déterminisme ;
10. vérification de compatibilité API ;
11. vérification UI réelle si possible via les tests de rendu existants.

Corrige les problèmes réellement trouvés pendant cet audit.

Ne fais pas d’audit spéculatif interminable.

---

# 12. Git

À la fin :

* commit uniquement les fichiers réellement liés au Step 73 ;
* aucun `git add -A` ;
* ne commit jamais `.poolside/`, `settings.local.yaml`, `.env*`, secrets, runtime/scratch files ;
* ne commit pas les anciennes specs `docs/Step*.md` si elles servent uniquement d’input local ;
* laisse les changements préexistants hors scope intacts.

Commit :

```text
Step 73: Detection Explainability & Evidence Graph
```

---

# 13. Rapport final obligatoire

Retourne un rapport synthétique avec :

```text
STATUS: COMPLETE / BLOCKED

ARCHITECTURE
- modèle ajouté/modifié
- emplacement
- pourquoi

EXPLAINABILITY
- evidence
- derived detection
- versions
- conflicts
- ordering/dedup

API
- changements

UI
- changements

TESTS
- nouveaux tests
- résultat Vitest

VALIDATION
- typecheck
- ESLint
- Prettier
- build

REGRESSION
- golden
- real-world
- production pipeline

GIT
- commit hash
- fichiers inclus
- fichiers volontairement exclus

LIMITATIONS
- uniquement les limitations réelles
```

Ne prétends pas qu’un test ou une validation a été exécuté s’il ne l’a pas été.

Commence maintenant par inspecter le repo et implémente le Step 73 de bout en bout.
