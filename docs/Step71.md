# DevLens — Step 71 — Advanced Resource-Based Detection

## 0. Mission

Step 70 a introduit une infrastructure HTTP Resource Intelligence déterministe, sécurisée et budgétée.

Step 71 doit maintenant **exploiter réellement les ressources secondaires observées/fetchées** pour améliorer la détection de technologies.

Objectif produit :

> DevLens doit détecter plus fiablement les technologies dont les signaux importants vivent dans des fichiers JavaScript/CSS externes, sans exécuter JavaScript, sans navigateur headless et sans transformer le crawler en moteur de rendu.

Le résultat attendu est une amélioration mesurable de la couverture et de la fiabilité sur des pages réalistes, tout en conservant les propriétés fondamentales du projet :

* déterminisme ;
* sécurité SSRF ;
* budgets HTTP ;
* architecture déclarative ;
* explicabilité ;
* absence de faux positifs évidents ;
* compatibilité avec les étapes précédentes.

---

# 1. Contexte architectural à respecter

Avant toute modification :

1. lire le code réel du repository ;
2. lire :

   * Step 68 ;
   * Step 69 ;
   * Step 70 ;
3. comprendre les contrats existants avant de coder ;
4. ne pas réinventer les abstractions déjà présentes.

Architecture actuelle à préserver :

```text
HTTP crawler
    ↓
SiteSnapshot
    ↓
CompositeDetector
    ↓
DeduplicatingDetector
    ↓
ScoringDetector
    ↓
RelationshipResolver
    ↓
Detection[]
```

Step 70 fournit désormais des ressources secondaires enrichies :

```text
SiteSnapshot.resources[]
```

avec notamment :

* URL ;
* type ;
* sourcePage ;
* acquisitionStatus ;
* responseHeaders ;
* bounded body/content lorsque disponible.

---

# 2. Problème concret à résoudre

Step 64 avait identifié plusieurs limites réelles :

* Angular/Vue/Svelte/Astro peuvent être présents principalement dans des bundles externes ;
* certaines technologies modernes sont difficiles à observer uniquement via :

  * HTML ;
  * headers ;
  * URLs de scripts ;
  * liens ;
  * metadata ;
* un scanner HTTP moderne doit pouvoir exploiter raisonnablement le contenu des ressources qu'il a déjà téléchargées.

Step 71 doit donc ajouter une nouvelle famille d'observation :

```text
resource content
```

Exemples :

```text
HTML
  └── <script src="/assets/app.js">
          ↓
      fetched resource
          ↓
      JS body signature
          ↓
      technology detection
```

et :

```text
HTML
  └── <link rel="stylesheet" href="/assets/app.css">
          ↓
      fetched resource
          ↓
      CSS body signature
          ↓
      technology detection
```

---

# 3. Scope strict

## À faire

Implémenter :

* détection déclarative dans les contenus de ressources ;
* au minimum JavaScript et CSS ;
* provenance explicite de la ressource ;
* intégration dans le pipeline existant ;
* déduplication avec les autres observables ;
* scoring compatible avec le système existant ;
* tests réalistes ;
* tests négatifs ;
* tests de collision ;
* tests de performance ;
* documentation.

## Ne PAS faire

Ne pas introduire :

* Playwright ;
* navigateur headless ;
* exécution JavaScript ;
* DOM runtime ;
* extraction dynamique ;
* cookies runtime ;
* DNS intelligence ;
* TLS fingerprinting ;
* browser APIs ;
* nouvelle architecture de scoring ;
* nouvelle architecture de relationships ;
* énorme expansion du catalogue ;
* téléchargement illimité ;
* téléchargement de ressources qui ne sont pas déjà autorisées par Step 70 ;
* analyse non bornée de fichiers ;
* parsing complet d'AST JavaScript ;
* bundler ;
* transpilation ;
* déminification complexe.

Step 71 est un **resource-content detector**, pas un navigateur.

---

# 4. Première étape obligatoire : audit du code réel

Avant d'écrire du code, inspecter précisément :

```text
src/domain/snapshot.ts
src/domain/detection.ts
src/application/*
src/infrastructure/http/*
src/features/detection/*
src/features/catalog/*
```

ainsi que les tests Step 68/69/70.

Identifier exactement :

* comment un Detector reçoit un SiteSnapshot ;
* comment les evidence sont construites ;
* comment `confidence` est calculée ;
* comment `n_types` est déterminé ;
* comment les ressources sont représentées ;
* comment les catalog signatures sont structurées ;
* comment les detectors sont composés ;
* comment les tests golden/real-world sont organisés.

**Ne pas modifier les contrats existants avant d'avoir compris leur implémentation réelle.**

---

# 5. Nouveau type d'observation

Introduire une notion explicite de contenu de ressource.

Le système doit distinguer au minimum :

```text
script content
stylesheet content
```

Ne pas réutiliser artificiellement `scriptUrl` ou `resourceUrl` pour représenter un contenu.

Le nouveau signal doit être identifiable comme un type d'observation distinct.

Par exemple conceptuellement :

```text
resource-content
```

ou une représentation équivalente cohérente avec l'architecture réelle.

Choisir le nom définitif en fonction des conventions existantes.

---

# 6. Signatures déclaratives

Les technologies doivent pouvoir déclarer des signatures de contenu.

L'architecture doit rester cohérente avec Step 68 :

```text
catalog/technologies/<id>.ts
```

et :

```text
TechnologyDefinition
```

Ajouter uniquement les champs nécessaires.

Conceptuellement :

```ts
resourceContentSignatures?: ResourceContentSignature[]
```

Une signature doit pouvoir exprimer au minimum :

```text
resource kind
pattern
confidence
```

et, si nécessaire :

```text
match mode
```

ou une contrainte équivalente.

Exemple conceptuel :

```ts
{
  kind: "script",
  pattern: /.../,
  confidence: 90
}
```

Mais **ne pas reprendre aveuglément cet exemple** : choisir la structure qui correspond réellement aux conventions du repository.

---

# 7. Règle fondamentale : pas de "string hunting" naïf

Le principal risque de cette étape est :

> trouver un mot dans un gros bundle et déclarer à tort une technologie.

Exemple à éviter :

```text
bundle.js contient "react"
→ React détecté
```

Cela est insuffisant.

Les signatures doivent donc être conçues comme des **signaux techniques plausibles**, pas comme de simples mots-clés génériques.

Privilégier des motifs tels que :

* runtime identifiers ;
* signatures de bootstrap ;
* API spécifiques ;
* structures caractéristiques ;
* commentaires de build lorsque leur valeur est réellement discriminante ;
* namespaces spécifiques ;
* fingerprints générés par les frameworks ;
* constructions CSS spécifiques lorsqu'elles sont réellement distinctives.

Éviter les signatures trop génériques :

```text
"component"
"router"
"render"
"state"
"app"
"react"
"vue"
"angular"
```

sauf si elles sont intégrées dans un contexte beaucoup plus discriminant.

---

# 8. Robustesse aux bundles réels

Les ressources peuvent être :

* minifiées ;
* compactées ;
* multi-lignes ;
* avec whitespace variable ;
* avec quotes différentes ;
* préfixées/suffixées par du code de bundler.

Les signatures doivent fonctionner raisonnablement sur ces variantes.

Ajouter des fixtures représentant au minimum :

```text
pretty JS
minified JS
pretty CSS
minified CSS
```

si pertinent pour les technologies sélectionnées.

Ne pas construire un moteur de normalisation massif.

Une normalisation légère et déterministe est acceptable si elle apporte un vrai bénéfice.

---

# 9. Technologie ciblée

Ne pas utiliser Step 71 pour ajouter 30 technologies.

Commencer par les technologies **déjà présentes dans le catalogue** pour lesquelles le contenu de ressources apporte un gain réel.

Priorité aux gaps identifiés précédemment :

* Angular ;
* Vue ;
* Svelte ;
* Astro ;

et éventuellement quelques technologies existantes où les ressources JS/CSS constituent un signal réellement utile.

Avant de modifier les signatures :

1. inspecter les définitions actuelles ;
2. déterminer lesquelles bénéficient réellement du resource-content ;
3. choisir un petit groupe représentatif ;
4. justifier ce choix dans la documentation.

Il est préférable d'avoir :

```text
5 technologies très bien fingerprintées
```

plutôt que :

```text
30 technologies avec des regex faibles.
```

---

# 10. Evidence et provenance

Chaque détection provenant d'un resource-content doit rester explicable.

Une evidence doit permettre de répondre à :

> Pourquoi DevLens pense que cette technologie est présente ?

Il faut pouvoir retrouver :

```text
technology
resource URL
resource type
matching signal
```

Ne jamais stocker un bundle complet dans une evidence.

Les contenus sont potentiellement volumineux.

L'evidence doit contenir uniquement une représentation bornée :

* URL ;
* type ;
* valeur/signature ;
* snippet borné si l'architecture actuelle le permet ;
* ou une référence équivalente.

Respecter le système d'identité canonique des evidences introduit précédemment.

---

# 11. Taille des contenus

Le detector ne doit jamais supposer que le body d'une ressource est illimité.

Respecter strictement :

```text
Step 70 resource budget
```

Si une ressource est :

```text
failed
skipped
oversized
```

elle ne doit évidemment pas être analysée comme un contenu complet disponible.

Si Step 70 expose une information permettant de distinguer :

```text
body complet
body tronqué
```

respecter cette distinction.

Ne jamais transformer artificiellement un contenu tronqué en preuve forte sans le documenter.

---

# 12. ResourceContentDetector

Créer un detector dédié, ou une abstraction équivalente cohérente avec le repository.

Responsabilité :

```text
SiteSnapshot.resources
        ↓
resource-content signatures
        ↓
Detection[]
```

Il doit être :

* pur ;
* déterministe ;
* sans I/O ;
* indépendant du crawler ;
* testable isolément.

Il ne doit pas :

* faire de HTTP ;
* modifier le snapshot ;
* exécuter du JavaScript ;
* consulter un état global ;
* dépendre de l'ordre des ressources pour changer son résultat.

---

# 13. Déterminisme

Pour un snapshot identique :

```text
detect(snapshot)
```

doit toujours produire le même résultat.

Tester explicitement :

```text
run 1 === run 2 === run 3
```

Même si :

```text
resources[]
```

arrive dans un ordre différent, le résultat final doit rester stable lorsque les données observées sont équivalentes.

Utiliser un ordre canonique lorsque nécessaire :

```text
resource URL
technology id
signature id / pattern
```

selon les conventions du projet.

---

# 14. Interaction avec DeduplicatingDetector

Le resource-content detector doit être intégré **avant** la déduplication/scoring.

Architecture attendue conceptuellement :

```text
CompositeDetector[
  HeaderDetector,
  MetaDetector,
  ScriptUrlDetector,
  ContentScriptDetector,
  ResourceDetector,
  LinkDetector,
  ResourceContentDetector
]
        ↓
DeduplicatingDetector
        ↓
ScoringDetector
```

Ne pas contourner :

* `DeduplicatingDetector`
* `ScoringDetector`
* `RelationshipResolver`

Le resource-content est une nouvelle source de preuve directe.

Ce n'est PAS une relation.

Donc :

```text
source = direct
```

ou absence du champ selon le contrat existant.

Ne pas utiliser :

```text
source = relationship
```

pour ce mécanisme.

---

# 15. Scoring

Ne pas réinventer le ConfidenceScorer.

Les signatures doivent fournir les informations nécessaires au scorer existant.

Le principe actuel doit rester intact :

```text
confidence = ranking score
```

et non une probabilité statistique.

Le resource-content doit simplement devenir un nouveau type d'observation pouvant contribuer au score selon les règles existantes.

Vérifier soigneusement le cas :

```text
same technology
header evidence
+ script URL evidence
+ resource-content evidence
```

La combinaison doit être dédupliquée correctement.

Tester aussi :

```text
resource-content seul
```

et :

```text
resource-content + direct signal
```

---

# 16. Versioning

Step 67 a introduit le versioning.

Step 71 doit **préserver** cette capacité.

Mais ne pas transformer cette étape en refonte du versioning.

Si une version peut déjà être extraite proprement depuis un resource-content signal via l'abstraction existante, l'intégrer.

Sinon :

```text
ne pas inventer un second système de version extraction.
```

Documenter simplement la limitation et réserver les extensions avancées à une étape ultérieure.

---

# 17. Relations Step 69

Ne pas modifier le moteur de relations.

Les nouvelles detections passent naturellement ensuite par :

```text
RelationshipResolver
```

Exemple :

```text
resource-content → Next.js
```

peut ensuite déclencher la relation existante :

```text
Next.js implies React
```

Mais le resource detector lui-même ne doit pas dériver React.

Séparation stricte :

```text
observation
→ direct detection
→ scoring
→ relationships
```

---

# 18. False positives : exigence élevée

Créer des tests négatifs réalistes.

Pour chaque technologie ciblée, au minimum :

```text
positive fixture
negative fixture
near-miss fixture
```

Exemples conceptuels :

```text
real Vue runtime fingerprint
vs
application containing generic "vue" text
```

ou :

```text
real Angular runtime fingerprint
vs
bundle containing an unrelated variable named angular
```

Le test négatif doit être crédible.

Éviter :

```text
empty string
```

comme seul test de faux positif.

---

# 19. Collision tests

Tester plusieurs technologies dans le même snapshot.

Exemples :

```text
Next.js + React
Vue + generic libraries
Angular + unrelated framework-like code
```

Vérifier que :

* les détections directes sont conservées ;
* les évidences restent attribuées à la bonne technologie ;
* la déduplication fonctionne ;
* les relations Step 69 restent correctes.

---

# 20. Ressources dupliquées

Tester :

```text
/resources/app.js
/resources/app.js
```

et :

```text
https://example.com/app.js
https://EXAMPLE.com/app.js
```

si la canonicalisation existante les considère équivalentes.

Une même ressource ne doit pas produire artificiellement plusieurs signaux indépendants.

Réutiliser les abstractions de canonicalisation du Step 70 plutôt que d'en créer une seconde.

---

# 21. Ressources externes

Respecter strictement la politique Step 70.

Le detector doit pouvoir analyser une ressource externe **si elle est déjà présente comme ressource acquise par le crawler**.

Il ne doit jamais décider :

> cette URL est externe → je vais moi-même la télécharger.

Aucun I/O.

---

# 22. Performance

Le resource-content detector sera potentiellement appelé sur plusieurs bundles.

Mesurer :

* snapshot avec peu de ressources ;
* snapshot avec le budget maximal de ressources ;
* plusieurs gros contenus bornés ;
* déterminisme sur plusieurs runs.

L'objectif n'est pas une micro-optimisation prématurée, mais vérifier qu'on ne crée pas accidentellement un coût quadratique ou une regex pathologique.

Éviter les regex connues pour provoquer du catastrophic backtracking.

Si nécessaire, ajouter une validation de signatures au chargement du catalogue.

---

# 23. Validation du catalogue

Étendre les validations Step 68 si nécessaire.

Détecter au minimum :

* signature malformée ;
* confidence invalide ;
* kind invalide ;
* pattern invalide ;
* technologie sans signature valide ;
* doublons manifestes.

Conserver le principe :

> les erreurs du catalogue sont détectées tôt et déterministement.

---

# 24. Golden fixtures

Étendre les golden fixtures.

Pour chaque technologie ciblée :

```text
resource-content positive
```

doit être représentée.

Le test doit démontrer :

```text
snapshot
→ resource content
→ detection
→ expected technology
→ expected evidence
```

Ne pas seulement tester le detector isolé.

Il faut au moins quelques tests de pipeline complet.

---

# 25. Real-world fixtures

Ajouter des fixtures réalistes inspirées de vrais patterns de production, mais déterministes et sans dépendance réseau.

Au minimum :

1. framework chargé depuis bundle externe ;
2. bundle minifié ;
3. page avec plusieurs frameworks/librairies ;
4. page avec faux signal ;
5. ressources externes ;
6. ressource inaccessible/failed ;
7. ressource skipped.

Le but est de vérifier le comportement du produit, pas seulement l'algorithme.

---

# 26. Test de non-régression ON/OFF

Conserver le principe Step 70 :

```text
resource intelligence OFF
```

doit continuer à produire les détections historiques.

Puis démontrer que :

```text
resource intelligence ON
```

peut ajouter de nouvelles détections **uniquement lorsque les ressources acquises apportent réellement une information supplémentaire**.

Le test doit montrer explicitement que l'ajout du detector ne dégrade pas les anciennes détections.

---

# 27. Documentation

Créer :

```text
docs/Step71-resource-content-detection.md
```

Documenter :

### A. Motivation

Pourquoi Step 70 seul ne suffisait pas.

### B. Architecture

```text
resource acquisition
→ resource content detector
→ dedup
→ scoring
→ relationships
```

### C. Signature model

Comment les technologies déclarent leurs fingerprints.

### D. Evidence

Comment la provenance est conservée.

### E. False positives

Pourquoi les signatures choisies ne sont pas de simples mots-clés.

### F. Performance

Coût et limites.

### G. Security

Aucune nouvelle capacité réseau.

### H. Limitations

Notamment :

* pas d'exécution JS ;
* pas de DOM ;
* pas de runtime inspection ;
* pas d'AST ;
* contenu borné ;
* dépendance aux ressources réellement observables.

### I. Technologies couvertes

Lister précisément les technologies enrichies et pourquoi.

---

# 28. Audit obligatoire avant commit

Après implémentation :

## Repository

```bash
git status
git diff --stat
git diff --cached --stat
```

Vérifier qu'aucun fichier hors scope n'est inclus.

Ne jamais faire :

```bash
git add -A
```

Ne jamais committer :

```text
.env*
settings.local.yaml
.poolside/
secrets
scratch files
runtime artifacts
```

---

# 29. Quality gates

Exécuter les checks réels du repository :

```bash
pnpm typecheck
pnpm lint
pnpm prettier:check
pnpm test
pnpm build
```

Adapter uniquement si les scripts exacts diffèrent.

Tous les tests doivent être verts.

Rapporter précisément :

```text
passed
failed
skipped
```

Ne jamais dire "all tests pass" sans chiffre.

---

# 30. Architecture audit

Avant commit, vérifier explicitement :

### Purity

Le ResourceContentDetector ne fait aucun I/O.

### Security

Aucune nouvelle surface SSRF.

### Determinism

Même snapshot → même résultat.

### Evidence

Chaque nouveau signal est explicable.

### Scoring

Aucun changement implicite du ConfidenceScorer.

### Relationships

Aucune duplication de la logique Step 69.

### Persistence

Les nouvelles evidences restent sérialisables et compatibles avec les mappings existants.

### Backward compatibility

Les snapshots existants sans resource content restent valides.

---

# 31. Performance audit

Mesurer au minimum :

```text
small snapshot
medium resource set
large/budget resource set
```

Comparer :

```text
without resource-content detection
vs
with resource-content detection
```

Si une régression importante apparaît :

1. identifier la cause ;
2. corriger si elle est réellement liée au Step 71 ;
3. documenter la mesure.

Ne pas inventer une optimisation sans mesure.

---

# 32. Final self-audit

Avant de déclarer COMPLETE, répondre réellement à ces questions :

1. Le crawler a-t-il été modifié inutilement ?
2. Le detector fait-il du réseau ?
3. Les ressources sont-elles bornées ?
4. Les contenus sont-ils analysés sans exécution ?
5. Les signatures sont-elles suffisamment discriminantes ?
6. Les faux positifs réalistes sont-ils testés ?
7. Les bundles minifiés sont-ils testés ?
8. Les evidences indiquent-elles la ressource source ?
9. La déduplication fonctionne-t-elle ?
10. Le scoring existant est-il inchangé ?
11. Les relationships Step 69 restent-elles inchangées ?
12. Les snapshots legacy fonctionnent-ils ?
13. Le résultat est-il déterministe ?
14. La performance est-elle acceptable ?
15. Le catalogue reste-t-il validé ?
16. Aucun fichier hors scope n'a-t-il été committé ?

**Si un défaut réel est trouvé pendant cet audit, le corriger avant le commit.**

Ne pas simplement le documenter comme "future work" lorsqu'il est directement dans le scope du Step 71.

---

# 33. Commit

Une fois tout validé :

```text
Step 71: Advanced Resource-Based Detection
```

Le commit doit contenir uniquement le travail Step 71.

---

# 34. Rapport final obligatoire

Retourner un rapport structuré :

```text
STEP 71 COMPLETE

Commit:
<hash>

Parent:
<hash>

Files:
<summary>

Architecture:
<summary>

Technologies enriched:
<list>

New resource-content signals:
<summary>

Evidence:
<summary>

False-positive protection:
<summary>

Scoring:
<summary>

Relationships:
<summary>

Persistence:
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
<only genuine limitations>

Commit scope:
<verified>
```

Ne pas déclarer Step 71 terminé tant que les gates ne sont pas vertes.

L'objectif est un **vrai incrément produit senior**, pas simplement une nouvelle classe et quelques tests.
