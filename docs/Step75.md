Tu travailles sur le monorepo DevLens.

# Step 75 — Detection Change Intelligence & Scan Diff

## Contexte

DevLens possède maintenant une chaîne de détection mature :

* catalogue déclaratif ;
* 6+ sources d’observation ;
* détection de contenu de ressources ;
* versioning et provenance ;
* version conflicts ;
* relations `implies` / `requires` / `excludes` ;
* détections directes ou dérivées ;
* modèle `DetectionExplainability` ;
* API structurée ;
* page de comparaison `/scans/compare`.

Le Step 73 a rendu les détections explicables.

Le prochain problème produit est désormais :

> **Qu’est-ce qui a réellement changé entre deux scans ?**

La comparaison actuelle existe déjà, mais elle doit devenir une vraie couche de **Detection Change Intelligence**, capable de distinguer les changements significatifs des simples différences de représentation.

Exemple cible :

```text
Scan A                         Scan B

WordPress 6.4.2        →      WordPress 6.5.1
Cloudflare              →      Cloudflare
jQuery                  →      jQuery
Google Analytics        →      —
Vercel                  →      Vercel
                         +      Next.js
```

Et produire quelque chose comme :

```text
Changes

Added
  Next.js

Removed
  Google Analytics

Version changed
  WordPress
    6.4.2 → 6.5.1

Unchanged
  Cloudflare
  jQuery
  Vercel
```

Le but est de transformer `/scans/compare` en outil d’analyse réellement utile, sans refaire le pipeline de détection.

---

# 1. Commence par inspecter le repo

Avant de modifier quoi que ce soit :

1. inspecte la structure réelle ;
2. lis `ScanComparison` ;
3. lis les types actuels de scan/detection ;
4. lis `DetectionExplainability` ;
5. lis les tests de comparaison existants ;
6. identifie comment les deux scans sont actuellement comparés ;
7. identifie si une logique de diff existe déjà partiellement.

Ne duplique pas une abstraction existante.

---

# 2. Créer un modèle de diff de détections

Introduis un modèle de domaine/application pur, selon l’architecture réelle, par exemple :

```ts
DetectionChange
DetectionDiff
DetectionChangeKind
```

Les noms peuvent être adaptés au repo.

Le modèle doit distinguer au minimum :

```text
added
removed
version_changed
confidence_changed
unchanged
```

Mais ne produis pas automatiquement un `confidence_changed` pour chaque petite variation numérique.

Définis une règle claire et déterministe.

---

# 3. Identité d'une technologie

La comparaison doit se faire par **technology ID**, pas par nom affiché.

Exemple :

```text
wordpress → wordpress
```

Même si le nom de présentation change dans le futur.

Ne compare jamais les objets `Detection` par égalité structurelle brute.

---

# 4. Added / Removed

### Added

Une technologie existe dans le nouveau scan mais pas dans l’ancien.

```ts
{
  technologyId: "nextjs",
  kind: "added",
  after: Detection
}
```

### Removed

Une technologie existe dans l’ancien mais pas dans le nouveau.

```ts
{
  technologyId: "google-analytics",
  kind: "removed",
  before: Detection
}
```

Les deux cas doivent conserver suffisamment d’informations pour permettre à l’UI d’afficher l’explication correspondante.

---

# 5. Version changes

Une technologie présente dans les deux scans peut avoir changé de version.

Exemple :

```text
WordPress
6.4.2 → 6.5.1
```

Produit :

```ts
{
  technologyId: "wordpress",
  kind: "version_changed",
  beforeVersion: "6.4.2",
  afterVersion: "6.5.1"
}
```

### Important

Respecte les règles du Step 72 :

* version absente ≠ version `"unknown"` ;
* version conflict ≠ version normale ;
* ne fabrique jamais une transition lorsqu’un côté est en conflit ;
* ne considère pas une différence de `versionSource` seule comme un changement de version.

Définis explicitement le comportement pour :

```text
6.4.2 → 6.5.1
6.4.2 → null
null → 6.5.1
conflict → 6.5.1
6.4.2 → conflict
conflict → conflict
```

Le comportement doit être testé et documenté.

---

# 6. Confidence changes

La confiance est un **deterministic ranking score**, pas une probabilité.

Ne transforme donc pas une variation minuscule en événement important.

Définis une règle raisonnable après inspection du produit existant.

Par exemple, tu peux distinguer :

```text
confidence_changed
```

uniquement lorsque les valeurs diffèrent réellement et que la technologie reste présente.

Mais ne crée pas une UI bruyante avec :

```text
WordPress 100 → 95
jQuery 85 → 90
...
```

pour chaque scan.

Si le modèle conserve la variation de confidence, l’UI peut la rendre secondaire.

Ne change surtout pas le calcul du score lui-même.

---

# 7. Unchanged

Une technologie présente dans les deux scans et ne présentant aucun changement significatif doit être :

```text
unchanged
```

Mais évite de générer inutilement une énorme liste d’éléments inchangés.

Le modèle peut les représenter pour permettre une vue complète, tandis que l’UI peut les masquer par défaut.

---

# 8. Evidence / Explainability changes

Le Step 73 permet maintenant d’expliquer une détection.

Exploite cette capacité.

Une technologie peut rester présente tout en changeant de justification :

```text
Scan A
WordPress
  meta generator

Scan B
WordPress
  resource_content
```

Ne transforme pas automatiquement chaque changement d’evidence en :

```text
technology changed
```

La technologie est toujours la même.

En revanche, le modèle de diff peut exposer un changement secondaire :

```ts
evidenceChanged?: boolean
```

ou une structure équivalente si cela est réellement utile.

### Règle importante

Ne compare pas naïvement les objets d’evidence sérialisés.

Utilise les identités canoniques existantes (`getEvidenceKey`) et les structures déjà présentes.

---

# 9. Relationship / derived changes

Les détections dérivées doivent être correctement prises en compte.

Exemple :

```text
Scan A
Next.js
React (derived from Next.js)

Scan B
Next.js
React (direct evidence)
```

La technologie `react` n'est pas :

```text
added
```

ni :

```text
removed
```

Elle est toujours présente.

Le diff peut éventuellement exposer :

```text
provenance_changed
```

si cette information est réellement utile et facile à rendre déterministe.

Mais ne crée pas une explosion de catégories.

Privilégie :

```text
added
removed
version_changed
confidence_changed
provenance_changed
unchanged
```

uniquement si ces catégories sont justifiées par les données existantes.

---

# 10. Déterminisme

Le diff doit être totalement déterministe.

Définis un ordre explicite.

Par exemple :

1. added
2. removed
3. version_changed
4. provenance_changed
5. confidence_changed
6. unchanged

Puis ordre secondaire :

```text
technology.id ASC
```

ou une règle plus pertinente si l’UI existante en possède déjà une.

Deux appels avec les mêmes scans doivent produire exactement le même résultat.

Ajoute un test d’invariance à l’ordre des détections d’entrée.

---

# 11. API

Si `/api/scans/...` ou l’architecture actuelle possède déjà une réponse de comparaison :

* expose le diff structuré ;
* conserve les réponses existantes compatibles ;
* ne duplique pas les types entre route et domaine.

Si aucune API de comparaison n’existe encore, crée uniquement le minimum nécessaire.

Le mapping doit rester pur.

Exemple conceptuel :

```ts
{
  scanBefore: "...",
  scanAfter: "...",
  changes: [
    {
      technologyId: "wordpress",
      kind: "version_changed",
      beforeVersion: "6.4.2",
      afterVersion: "6.5.1"
    }
  ]
}
```

Les noms exacts doivent suivre l’architecture réelle.

---

# 12. UI — Scan Comparison

Améliore `/scans/compare`.

L’objectif est une lecture immédiate.

Structure cible :

```text
Scan Comparison

3 changes

Added
  + Next.js

Removed
  − Google Analytics

Version changes
  WordPress
  6.4.2 → 6.5.1

Unchanged
  Cloudflare
  jQuery
  Vercel
```

### Contraintes

* ne pas refaire toute l’interface ;
* réutiliser les composants existants ;
* conserver les badges existants ;
* conserver l’explication Step 73 lorsqu’on consulte une détection ;
* ne pas transformer la page en dashboard surchargé ;
* ne pas afficher les changements de confidence comme s’ils étaient des changements de version ;
* distinguer visuellement les catégories sans utiliser des couleurs arbitraires si le système de design existant ne les prévoit pas.

Si une technologie a été ajoutée :

→ permettre d’accéder à son explication.

Si une technologie a été supprimée :

→ permettre d’accéder à l’ancienne explication si les données du scan précédent sont disponibles.

---

# 13. Tests

Ajoute une vraie couverture du diff.

Minimum :

### Added

* une technologie ajoutée ;
* plusieurs technologies ajoutées ;
* ordre indépendant.

### Removed

* une technologie supprimée ;
* plusieurs supprimées.

### Version

Tester :

```text
6.4.2 → 6.5.1
6.4.2 → null
null → 6.5.1
conflict → 6.5.1
6.4.2 → conflict
conflict → conflict
```

### Confidence

* changement réel ;
* valeur identique ;
* comportement déterministe.

### Evidence

* evidence identique ;
* evidence différente ;
* même technologie malgré evidence différente.

### Relationships

* derived → derived ;
* derived → direct ;
* direct → derived ;
* technologie toujours présente.

### Ordering

Permuter les tableaux d’entrée et vérifier l’égalité exacte du résultat.

### Empty

Tester :

```text
scan A vide
scan B vide
```

et :

```text
aucun changement
```

### API

Tester le mapping de comparaison.

### UI

Ajouter des tests de rendu pour :

* added ;
* removed ;
* version changed ;
* unchanged ;
* empty diff.

Ne crée pas Playwright/E2E si le repo n’en possède toujours pas.

---

# 14. Non-objectifs

NE PAS faire :

* modifier le crawler ;
* modifier les detectors ;
* modifier le scorer ;
* modifier le version consensus ;
* modifier RelationshipResolver ;
* ajouter massivement des technologies ;
* créer une base de données de changements ;
* créer une migration SQL ;
* créer un système d’analytics ;
* créer des graphiques ;
* créer des tendances temporelles multi-scans ;
* créer un dashboard historique complet.

Ce step porte uniquement sur le **diff entre deux scans**.

---

# 15. Régression

Les résultats de détection eux-mêmes doivent rester strictement inchangés.

Vérifie notamment :

* golden fixtures ;
* real-world fixtures ;
* production detector ;
* Step 68 ;
* Step 69 ;
* Step 70 ;
* Step 71 ;
* Step 72 ;
* Step 73.

Si les tests existants vérifient les listes de détection, ils doivent continuer à produire exactement les mêmes résultats.

---

# 16. Validation

À la fin :

1. tests ciblés ;
2. Vitest complet ;
3. typecheck ;
4. ESLint ;
5. Prettier sur les fichiers touchés ;
6. build ;
7. audit manuel du diff ;
8. vérification des cas de version conflict ;
9. vérification du déterminisme ;
10. vérification de l’UI de comparaison.

Corrige les vrais problèmes rencontrés.

Ne fais pas d’audit spéculatif interminable.

---

# 17. Git

Commit uniquement les fichiers réellement liés au Step 74.

Ne jamais utiliser :

```bash
git add -A
```

Ne jamais committer :

* `.poolside/`
* `settings.local.yaml`
* `.env*`
* secrets
* runtime/scratch files
* anciennes specs `docs/Step*.md`
* changements préexistants hors scope

Commit :

```text
Step 74: Detection Change Intelligence & Scan Diff
```

---

# 18. Rapport final obligatoire

Retourne :

```text
STATUS: COMPLETE / BLOCKED

ARCHITECTURE
- modèle de diff
- emplacement
- logique d’identité

CHANGE INTELLIGENCE
- added
- removed
- version changes
- confidence
- provenance/evidence si implémenté
- unchanged

API
- changements

UI
- changements

TESTS
- nouveaux tests
- total Vitest

VALIDATION
- typecheck
- ESLint
- Prettier
- build

REGRESSION
- résultats

GIT
- commit hash
- fichiers inclus
- fichiers exclus

LIMITATIONS
- uniquement les limitations réelles
```

Ne prétends jamais qu’une validation a été exécutée si elle ne l’a pas été.

Commence par inspecter le repo, puis implémente le Step 74 de bout en bout.
