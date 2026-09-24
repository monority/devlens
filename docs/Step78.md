# Step 78 — Detection Coverage & Blind-Spot Intelligence

## Mission

Implémente le prochain step substantiel de DevLens.

Les Steps 65–77 ont progressivement construit :

* detection confidence ;
* technology versions ;
* relationship semantics ;
* secondary resource intelligence ;
* resource-content detection ;
* version provenance ;
* detection explainability ;
* scan diff ;
* signal corroboration ;
* detection presentation.

Le problème produit restant est important :

> **Une technologie non détectée ne signifie pas nécessairement qu'elle est absente du site.**

DevLens doit maintenant pouvoir distinguer factuellement :

1. ce qui a été observé ;
2. ce qui a été inspecté ;
3. ce qui n'a pas pu être inspecté ;
4. ce qui est observable mais sans signature correspondante.

Le but est de construire une première couche de **coverage / observability intelligence**.

IMPORTANT :

Ce step ne doit PAS transformer l'absence d'une détection en conclusion négative.

---

# 1. Inspecter le dépôt avant toute modification

Commence par comprendre réellement :

* `SiteSnapshot`
* `Resource`
* `ResourceAcquisitionStatus`
* `HttpCrawler`
* `ResourcePolicy`
* `resource-intelligence.ts`
* `Evidence`
* tous les detectors
* `DetectionExplainability`
* `DetectionResponse`
* `detection-to-response.ts`
* `ScanDetailView`
* `ScanOverview`
* `DetectionList`
* `EvidenceList`
* `DetectionItem`
* les tests crawler/resource existants.

Inspecte également les tests Step 70/71 concernant :

* resource discovery ;
* selected/fetched/failed/skipped ;
* SSRF ;
* timeout ;
* redirects ;
* deterministic ordering ;
* resource budgets.

Ne pars pas d'une hypothèse sur les structures existantes : adapte-toi au code réel.

---

# 2. Principe fondamental

Introduire une distinction explicite entre :

### Observed

Une surface a réellement été observée.

Exemples :

* HTTP headers ;
* HTML/meta ;
* inline scripts ;
* script URLs ;
* links ;
* fetched resource URLs ;
* fetched resource contents.

### Attempted

DevLens a essayé d'obtenir une ressource mais l'observation n'a pas abouti.

Exemples :

* timeout ;
* network failure ;
* HTTP failure ;
* oversized response ;
* redirect rejection.

### Skipped

Une ressource était connue/discovered mais n'a pas été téléchargée à cause de la politique ou du budget.

### Not observed

Une surface n'est simplement pas présente dans le snapshot actuel.

Cette dernière catégorie est très importante :

**absence d'observation ≠ absence de technologie.**

---

# 3. Ne pas sur-construire

Ne crée PAS un énorme système générique de telemetry.

Le résultat doit rester une couche pure et descriptive.

Si possible, créer un modèle compact du genre :

```ts
type ObservationCoverage = {
  discovered: number;
  selected: number;
  fetched: number;
  failed: number;
  skipped: number;
  sources: ObservationCoverageSource[];
};
```

Mais adapte précisément le modèle aux structures existantes.

Les noms peuvent être différents si le repo possède déjà une convention.

---

# 4. Source families

La couverture doit reprendre les familles réellement observables dans DevLens.

Au minimum, inspecter :

* header ;
* meta ;
* content ;
* script URL ;
* resource URL ;
* resource content ;
* link.

Ne crée pas artificiellement une famille si le crawler/detector ne possède pas réellement cette surface.

Important :

`resource_url` et `resource_content` doivent rester distincts.

Une ressource découverte n'implique pas que son contenu a été inspecté.

---

# 5. Resource acquisition coverage

Le Step 70 possède déjà :

```text
discovered
selected
fetched
failed
skipped
```

Réutilise ces informations.

Ne recrée pas un deuxième système parallèle de statut.

Le modèle de coverage doit être dérivé des `Resource` existantes.

Exemple conceptuel :

```text
3 resources discovered
2 selected
1 fetched
1 skipped
```

ou, si plus pertinent :

```text
Resource inspection
3 discovered · 2 fetched · 1 skipped
```

Les chiffres doivent venir des données réelles.

---

# 6. Pourquoi une ressource n'a pas été inspectée

Lorsque le modèle actuel contient une raison explicite :

```ts
failureReason
```

ou équivalent, conserve-la.

Ne transforme pas automatiquement chaque échec en un diagnostic technique précis si le modèle ne le permet pas.

Par exemple :

```text
1 resource failed
```

est préférable à :

```text
1 resource blocked by CORS
```

si DevLens ne sait pas réellement que CORS est la cause.

Ne jamais inventer une raison.

---

# 7. Budget / policy awareness

Une ressource `skipped` est différente d'une ressource `failed`.

La première signifie :

> DevLens ne l'a pas téléchargée.

La seconde signifie :

> DevLens a essayé mais n'a pas obtenu une observation exploitable.

Conserve cette distinction partout :

* domain ;
* API ;
* UI ;
* tests.

---

# 8. Coverage model pur

Le calcul doit être :

* pur ;
* déterministe ;
* sérialisable ;
* O(n) ;
* sans IO ;
* sans DB ;
* sans accès à React.

Créer un helper dans le package architecturalement correct.

Si cette information concerne directement le snapshot observable et qu'elle peut être utile ailleurs que dans `apps/web`, envisage son placement dans `packages/core`.

Mais **ne force pas un déplacement architectural** si le repo montre que la notion est purement web/presentation.

Le critère est :

> la coverage décrit-elle le snapshot/domaine, ou uniquement la manière dont l'UI le présente ?

Décide à partir du code existant.

---

# 9. Coverage status

Créer un petit vocabulaire descriptif.

Par exemple :

```text
unobserved
observed
partial
blocked
```

Mais ne fixe pas ces noms sans inspecter les données.

Les états doivent avoir une sémantique factuelle.

IMPORTANT :

Ne jamais produire :

```text
technology absent
technology not installed
technology not used
```

à partir de la coverage.

Le système ne mesure que l'observabilité de DevLens.

---

# 10. Detection explainability

Étendre `DetectionExplainability` uniquement si cela apporte une information réellement utile.

Une détection individuelle peut éventuellement indiquer sa provenance/coverage, mais ne duplique pas inutilement tout le snapshot.

Le modèle doit éviter quelque chose comme :

```ts
DetectionExplainability.coverage
DetectionResponse.coverage
ScanResponse.coverage
```

avec trois sources de vérité.

Privilégie :

```text
Scan → observationCoverage
Detection → explanation
```

si cette séparation correspond au modèle actuel.

---

# 11. API

Expose la coverage au niveau approprié.

Le candidat naturel est la réponse du scan / snapshot, car la coverage concerne l'ensemble de l'observation.

Avant de modifier l'API, inspecte les types existants.

Objectif conceptuel :

```ts
type ObservationCoverageResponse = {
  ...
};
```

La réponse doit rester :

* JSON serializable ;
* backward compatible ;
* déterministe.

Ne créer aucune information probabiliste.

---

# 12. UI

Ajoute un résumé discret dans la vue de scan, proche du résumé global plutôt que dans chaque `DetectionItem`.

Exemple conceptuel :

```text
Observation coverage

HTML · observed
Headers · observed
Scripts · observed
Resources · 4 discovered · 3 fetched · 1 skipped
```

Ou une forme plus compacte adaptée au design existant.

Le but est que l'utilisateur comprenne immédiatement :

> « DevLens a observé X, mais certaines surfaces/resources n'ont pas été inspectées. »

---

# 13. Empty detection state

C'est une partie importante du step.

Si un scan possède zéro détection, l'UI ne doit pas simplement dire :

```text
No technologies detected.
```

Cette formulation est trop forte.

Préférer une formulation factuelle du type :

```text
No observable technologies were detected.
```

Puis, si la coverage montre des limitations :

```text
Some resources could not be inspected, so the result may be incomplete.
```

IMPORTANT :

Ne prétends jamais qu'un scan est incomplet si la couverture ne montre aucune limitation pertinente.

Le message doit être conditionnel aux données réelles.

---

# 14. Partial observation warning

Si des ressources ont :

* `failed`
* `skipped`

l'UI peut afficher une indication discrète :

```text
Some resources were not inspected.
```

avec éventuellement le détail :

```text
1 failed · 2 skipped
```

Mais :

* pas d'alerte dramatique ;
* pas de couleur agressive ;
* pas de modal ;
* pas de nouveau gros composant.

Réutilise les patterns visuels existants.

---

# 15. Do not infer absence

Tester explicitement les cas suivants :

### Case A

```text
0 detections
0 failed
0 skipped
```

Résultat :

```text
No observable technologies were detected.
```

mais aucune affirmation :

```text
No technologies are used.
```

### Case B

```text
0 detections
2 skipped
```

Résultat :

```text
No observable technologies were detected.
Some resources were not inspected.
```

### Case C

```text
WordPress detected
3 evidence sources
1 skipped resource
```

La détection WordPress reste exactement identique.

La coverage n'altère pas la détection.

---

# 16. Detection engine must remain untouched

NE PAS modifier :

* `ConfidenceScorer`
* `DeduplicatingDetector`
* `ScoringDetector`
* `RelationshipResolver`
* catalog signatures
* detection signatures
* version extraction
* detector ordering.

Le Step 78 est une couche d'observation et de présentation.

---

# 17. Resource intelligence must remain authoritative

Ne recrée pas la logique de :

* selection ;
* acquisition ;
* SSRF ;
* redirects ;
* timeout ;
* budget.

La coverage doit consommer les statuts déjà produits par Step 70.

Aucun nouveau fetch.

Aucun nouveau réseau.

Aucune modification des budgets.

---

# 18. Tests obligatoires

## Coverage unit tests

Tester au minimum :

1. empty snapshot ;
2. headers/meta/content observables ;
3. discovered resource ;
4. selected resource ;
5. fetched resource ;
6. failed resource ;
7. skipped resource ;
8. mixed resource statuses ;
9. deterministic ordering ;
10. permutation invariance ;
11. failureReason preservation ;
12. resource_url vs resource_content distinction.

## API tests

Tester :

1. coverage présente ;
2. empty coverage ;
3. backward compatibility ;
4. deterministic serialization.

## UI tests

Tester :

1. normal coverage ;
2. partial resource coverage ;
3. failed resource;
4. skipped resource ;
5. zero detections + complete observation ;
6. zero detections + incomplete observation ;
7. existing successful detection unchanged.

## Regression

Prouver que :

* technologies détectées inchangées ;
* confidence inchangée ;
* versions inchangées ;
* evidence inchangées ;
* relationship resolution inchangée.

---

# 19. Performance

Le calcul doit être O(n) sur :

```text
number of resources + number of observable surfaces
```

Aucun traitement quadratique.

Aucun accès réseau.

Aucune dépendance UI dans le modèle.

---

# 20. Validation

Exécute les commandes réelles du repo :

```bash
pnpm vitest run
pnpm typecheck
pnpm exec eslint .
pnpm exec prettier --check <tous les fichiers touchés>
pnpm build
```

Ajoute les tests ciblés avant le full suite.

Inspecte ensuite le diff final.

Vérifie particulièrement :

* aucune modification du moteur de détection ;
* aucune modification de `confidence` ;
* aucun nouveau fetch ;
* aucun nouveau statut concurrent ;
* aucun texte affirmant l'absence d'une technologie.

---

# 21. Git hygiene

Commit uniquement les fichiers réellement nécessaires au Step 78.

NE PAS utiliser :

```bash
git add -A
```

Ne committer aucun :

* `.poolside/`
* `settings.local.yaml`
* `.env*`
* secret
* runtime artifact
* scratch file
* `docs/Step*.md`
* travail préexistant sans rapport.

Commit exact :

```text
Step 78: Detection Coverage & Blind-Spot Intelligence
```

Après commit :

```bash
git status
```

Vérifie que les seules modifications restantes sont préexistantes et hors scope.

---

# 22. Final report

Retourne :

```text
STATUS

COMMIT

ARCHITECTURE

COVERAGE MODEL

RESOURCE COVERAGE

API

UI

EMPTY DETECTION BEHAVIOR

TESTS

REGRESSION

VALIDATION

GIT HYGIENE

LIMITATIONS
```

Donne :

* fichiers modifiés ;
* placement architectural du modèle ;
* états de coverage retenus ;
* comment les ressources sont agrégées ;
* exemple de JSON/API ;
* comportement UI ;
* tests ajoutés ;
* total Vitest ;
* typecheck ;
* ESLint ;
* Prettier ;
* build ;
* SHA du commit ;
* limitations éventuelles.

Ne prétends pas avoir vérifié quelque chose qui ne l'a pas été.

---

# Critère de réussite

Après Step 78, DevLens doit pouvoir communiquer factuellement :

> **« Voici ce que DevLens a réellement observé pendant ce scan, voici ce qui n'a pas pu être observé, et voici les technologies détectées à partir de ces observations. »**

Il ne doit jamais transformer :

```text
not observed
failed
skipped
no matching signature
```

en :

```text
technology absent
```

Le step doit donc améliorer la **transparence de l'observation**, pas modifier la capacité de détection elle-même.
