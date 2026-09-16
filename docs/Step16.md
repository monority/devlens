# Step 16 — API Contract & Integration Hardening

## Contexte

DevLens dispose maintenant d'un moteur de détection stable et déterministe ainsi que d'un lifecycle de scan correctement modélisé.

Architecture actuelle :

```text
POST /api/scans
    ↓
route.ts
    ↓
handler.ts
    ↓
executeScan()
    ↓
runScan()
    ↓
Crawler
    ↓
SiteSnapshot
    ↓
ProductionDetector
    ↓
ScanResult
    ↓
persistResult()
```

Le Worker utilise le même pipeline de production.

Les Steps 8–15 ont stabilisé :

- catalog centralisé ;
- evidence key canonique ;
- déduplication ;
- scoring ;
- production detector ;
- crawler/snapshot ;
- golden fixtures ;
- lifecycle `pending → running → completed/failed` ;
- timestamps ;
- error mapping ;
- repository semantics ;
- idempotence ;
- Web/Worker parity.

## Objectif

Faire un **audit approfondi de la frontière API/integration** afin de garantir que le comportement observable de DevLens est :

- cohérent ;
- explicitement contractuel ;
- correctement validé ;
- stable entre succès et échec ;
- indépendant des détails internes du domaine ;
- correctement sérialisé ;
- testable sans dépendre d'implémentations accidentelles.

> **Le moteur de scan est stable. Maintenant, rendre son contrat externe tout aussi fiable.**

---

# 1. Audit de `POST /api/scans`

Inspecter précisément :

- `apps/web/src/app/api/scans/route.ts`
- `handler.ts`
- validation d'entrée ;
- création du `ScanTarget` ;
- appel à `executeScan()` ;
- mapping HTTP ;
- sérialisation de la réponse.

Documenter le contrat réel actuel avant toute modification.

Vérifier notamment :

### Input

Déterminer précisément :

- forme JSON attendue ;
- champ URL ;
- comportement lorsqu'il manque ;
- comportement lorsque le JSON est invalide ;
- comportement lorsqu'un champ inattendu est fourni ;
- types incorrects ;
- URL vide ;
- URL whitespace-only ;
- protocoles non autorisés ;
- URL malformée.

Ne pas introduire une nouvelle couche de validation si une validation existante suffit.

---

# 2. Audit du mapping HTTP

Établir explicitement le comportement pour chaque catégorie :

| Situation                        |                  HTTP attendu | Body              |
| -------------------------------- | ----------------------------: | ----------------- |
| requête valide + scan réussi     |                           2xx | résultat de scan  |
| validation invalide              |                           4xx | erreur structurée |
| crawler/domain failure           | comportement actuel documenté | scan failed       |
| erreur infrastructure inattendue |                           5xx | erreur structurée |
| erreur de persistance            |    5xx ou comportement actuel | erreur structurée |

Ne pas changer arbitrairement les status codes.

Si le comportement actuel est cohérent avec l'architecture, le conserver et le verrouiller par des tests.

---

# 3. Contract de réponse

Auditer le JSON retourné par l'API.

Vérifier :

- champs présents ;
- champs optionnels ;
- `null` vs absence ;
- dates sérialisées correctement ;
- URL sérialisée correctement ;
- technologies ;
- detections ;
- evidence ;
- confidence ;
- score ;
- statut ;
- erreurs.

Identifier les détails internes qui seraient accidentellement exposés.

Le contrat API ne doit pas dépendre inutilement de classes ou d'implémentations internes du domaine.

Ne pas créer un système DTO complexe si le modèle actuel est déjà suffisamment stable.

---

# 4. Error contract

Auditer toutes les erreurs visibles par l'API.

Identifier les catégories réellement existantes :

- validation ;
- URL ;
- crawl ;
- scan ;
- unexpected/infrastructure ;
- persistence.

Vérifier que les réponses d'erreur sont :

- structurées ;
- déterministes ;
- non ambiguës ;
- dépourvues de stack trace ;
- dépourvues de détails internes inutiles ;
- cohérentes entre les différents chemins.

Ne pas exposer :

- erreurs SQL brutes ;
- stack traces ;
- secrets ;
- headers sensibles ;
- détails internes du crawler.

Si un error code existe déjà, le réutiliser plutôt que d'en créer un second système.

---

# 5. Tests d'intégration API

Ajouter uniquement les tests nécessaires pour verrouiller le contrat.

Couvrir au minimum :

### Validation

- body absent/invalide ;
- URL absente ;
- URL vide ;
- URL malformée ;
- protocole interdit.

### Success

- requête valide ;
- scan complété ;
- detections présentes lorsqu'attendues ;
- réponse correctement sérialisée.

### Domain failure

- crawler failure ;
- scan `failed` ;
- erreur correctement représentée.

### Unexpected failure

Simuler une erreur inattendue et vérifier :

- HTTP 5xx ;
- body contrôlé ;
- aucune fuite d'information interne.

### Persistence failure

Si le design actuel permet de l'injecter proprement, vérifier le comportement API.

Ne pas ajouter de mocking excessif.

Privilégier les tests proches du véritable handler et des vrais contrats.

---

# 6. Validation / SSRF boundary

Ré-auditer la frontière URL/API avec ce qui a été établi au Step 14.

Vérifier que la validation API et les protections du crawler ont des responsabilités claires.

Ne pas dupliquer inutilement :

```text
API validation
      ↓
ScanTarget
      ↓
Crawler security checks
```

Le fait qu'une URL soit syntaxiquement valide ne doit pas être considéré comme une preuve qu'elle est sûre à crawler.

Préserver les protections existantes :

- HTTP/HTTPS uniquement ;
- blocage des hostnames interdits ;
- protections crawler existantes ;
- limitation DNS-rebinding déjà documentée.

Ne pas introduire de pseudo-solution DNS complexe dans ce Step.

---

# 7. Web / Worker contract parity

Vérifier que Web et Worker continuent d'utiliser :

```text
createProductionDetector()
runScan()
```

et les mêmes contrats de domaine.

Identifier toute divergence accidentelle concernant :

- lifecycle ;
- error mapping ;
- snapshot ;
- detections ;
- scoring ;
- persistence.

Ajouter un test uniquement si une divergence réelle ou un risque contractuel est identifié.

---

# 8. Serialization audit

Auditer particulièrement :

- `Date` ;
- branded/value-object types ;
- `URL` ;
- evidence ;
- nested arrays ;
- `undefined` ;
- `null`.

Vérifier qu'un résultat retourné par l'API est un JSON contractuel propre et stable.

Attention aux objets qui peuvent fonctionner en mémoire mais produire un JSON différent après `JSON.stringify()`.

Ajouter des tests de sérialisation si nécessaire.

---

# 9. API boundary architecture

Vérifier les dépendances :

```text
route
  ↓
handler
  ↓
application
  ↓
domain
```

Le handler doit rester responsable de l'adaptation HTTP.

Le route handler ne doit pas contenir :

- logique métier ;
- détection ;
- scoring ;
- persistence logic ;
- crawler logic.

Ne pas déplacer du code uniquement pour respecter une architecture théorique : ne modifier que ce qui constitue réellement un problème.

---

# 10. Documentation

Mettre à jour uniquement les documents concernés.

Au minimum, si nécessaire :

- `docs/architecture/overview.md`
- `docs/architecture/application.md`
- `docs/architecture/persistence.md`
- documentation API existante.

Créer :

```text
docs/Step16-report.md
```

Le rapport doit contenir :

1. Executive Summary
2. API contract actuel
3. Input validation
4. HTTP mapping
5. Response serialization
6. Error contract
7. SSRF boundary
8. Integration tests
9. Web/Worker parity
10. Architecture findings
11. Changes made
12. Deferred findings
13. Validation results

---

# Contraintes strictes

## Ne pas faire

- pas de nouvelle architecture API ;
- pas de GraphQL ;
- pas de tRPC ;
- pas de nouvelle librairie HTTP ;
- pas de nouvelle librairie de validation si l'existante suffit ;
- pas de DTO framework généralisé ;
- pas de middleware complexe ;
- pas de changement du moteur de détection ;
- pas de nouveau detector ;
- pas de nouvelle technologie ;
- pas de nouvelle evidence ;
- pas de changement du scoring ;
- pas de changement du lifecycle métier sauf bug démontré ;
- pas de queue ;
- pas de retry framework ;
- pas d'observability platform ;
- pas de refactor massif.

## Principe

**Audit first, change second.**

Une architecture déjà correcte doit être conservée.

Chaque modification doit être justifiée par :

- un bug ;
- une incohérence ;
- un contrat non testé ;
- une fuite d'implémentation ;
- ou un risque d'intégration concret.

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

Le Step 16 est terminé uniquement si toutes les validations passent.

Le rapport final doit préciser :

- nombre de tests avant/après ;
- fichiers modifiés ;
- bugs réellement corrigés ;
- comportements volontairement inchangés ;
- findings différés ;
- confirmation de l'absence de changement du moteur de détection.

## Critère de réussite

À la fin du Step 16, un consommateur externe doit pouvoir considérer `POST /api/scans` comme un contrat fiable, sans avoir besoin de connaître les détails internes de `@devlens/core`, `@devlens/crawler` ou `@devlens/detectors`.
