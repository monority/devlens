# DevLens — Step 9 — Detection Explainability & Evidence Quality

## Context

DevLens est un monorepo TypeScript strict dédié à la détection de technologies web.

Le pipeline actuel est :

```text
CompositeDetector
    ↓
DeduplicatingDetector
    ↓
ScoringDetector(ConfidenceScorer)
    ↓
ScanResult
```

Le projet dispose maintenant d'un catalogue centralisé :

```text
technology-catalog.ts
```

qui constitue la source unique de vérité pour :

```ts
{
  (id, name, category);
}
```

Les détecteurs utilisent désormais `getTechnology(id)` au lieu de dupliquer les métadonnées.

La Step 8 a également ajouté une couverture importante sur :

- catalogue des technologies ;
- intégration du pipeline ;
- déterminisme ;
- qualité des preuves ;
- persistance round-trip ;
- sérialisation JSON.

État de référence :

```text
pnpm typecheck → 0 errors
pnpm test      → 509 passed / 9 skipped
pnpm lint      → OK
pnpm build     → OK
madge          → no circular dependency
```

## Mission

Implémenter **Step 9 — Detection Explainability & Evidence Quality**.

L'objectif est de rendre chaque détection :

1. compréhensible ;
2. traçable ;
3. déterministe ;
4. sérialisable ;
5. exploitable par l'API et le futur frontend DevLens.

Une détection doit permettre de répondre clairement à :

> "Pourquoi DevLens pense que cette technologie est présente ?"

---

# 1. Audit préalable obligatoire

Avant toute modification :

- inspecter le modèle `Detection` actuel ;
- inspecter `Evidence` et tous ses sous-types ;
- inspecter `ScanResult` ;
- inspecter `ConfidenceScorer` ;
- inspecter `ScoringDetector` ;
- inspecter tous les détecteurs existants ;
- inspecter la persistance PostgreSQL/Drizzle ;
- inspecter les tests existants autour des détections ;
- rechercher toutes les sérialisations JSON des détections.

Ne modifier aucun contrat existant sans nécessité démontrée.

Le rapport final devra commencer par un court résumé :

```text
Current Detection model
Current Evidence model
Current persistence model
Required changes
```

---

# 2. Définir un modèle d'évidence explicite

L'évidence doit être suffisamment structurée pour être affichée ou exploitée par une API sans avoir à parser des chaînes arbitraires.

Conserver les preuves spécialisées existantes.

Par exemple :

```ts
type ScriptUrlEvidence = {
  type: 'script_url';
  url: Url;
};
```

Ne pas remplacer brutalement les types existants par un objet générique du type :

```ts
{
  message: string;
}
```

Les preuves doivent rester **machine-readable**.

Si nécessaire, introduire une abstraction commune minimale :

```ts
interface Evidence {
  readonly type: string;
}
```

Puis conserver les variantes spécialisées :

```ts
ScriptUrlEvidence;
HeaderEvidence;
HtmlMetaEvidence;
ResourceEvidence;
ContentEvidence;
```

Utiliser les types déjà présents dans le repository lorsque ceux-ci existent.

---

# 3. Ajouter une représentation explicable de la détection

La détection doit pouvoir exposer au minimum :

```ts
{
  (technology, confidence, evidence);
}
```

Ne pas introduire prématurément :

- descriptions marketing ;
- texte généré par LLM ;
- explications non déterministes ;
- scoring complexe supplémentaire.

L'explicabilité doit être une projection déterministe des données existantes.

Exemple conceptuel :

```ts
Detection {
  technology: Technology
  confidence: number
  evidence: Evidence[]
}
```

Si cette structure existe déjà, **ne pas la réinventer**.

Dans ce cas, Step 9 doit principalement améliorer sa qualité et son contrat.

---

# 4. Garantir la traçabilité de chaque score

Une détection produite par `ScoringDetector` doit permettre de relier :

```text
Technology
    ↓
Evidence
    ↓
Score / confidence
```

Le système doit éviter toute situation où :

```text
confidence = 0.93
```

mais aucune preuve permettant de comprendre ce score n'est disponible.

Ajouter les invariants nécessaires :

### Invariant A

Une détection valide possède au moins une evidence.

### Invariant B

Une evidence possède un type explicite.

### Invariant C

Les preuves sont conservées lors du scoring.

### Invariant D

Le scoring ne modifie pas le contenu sémantique des preuves.

### Invariant E

Le même snapshot produit exactement la même détection.

---

# 5. Déterminisme des preuves

Garantir que l'ordre des preuves est stable.

Deux exécutions identiques doivent produire :

```ts
JSON.stringify(resultA) === JSON.stringify(resultB);
```

si les snapshots sont identiques.

Si nécessaire :

- trier les preuves ;
- dédupliquer les preuves ;
- normaliser les URLs ;
- utiliser un ordre stable basé sur `type` puis sur leur contenu canonique.

Ne pas utiliser :

- timestamps ;
- random ;
- ordre dépendant d'une structure non déterministe ;
- identifiants générés aléatoirement.

---

# 6. Déduplication des preuves

Une même technologie peut être détectée par plusieurs détecteurs ou plusieurs signatures.

Garantir qu'une preuve identique n'apparaisse pas plusieurs fois.

Exemple :

```text
Next.js
 ├─ script_url: /_next/static/chunks/app.js
 ├─ script_url: /_next/static/chunks/app.js
```

doit devenir :

```text
Next.js
 └─ script_url: /_next/static/chunks/app.js
```

La déduplication doit être :

- déterministe ;
- générique ;
- indépendante de la technologie ;
- indépendante de l'ordre d'arrivée.

Créer une stratégie de canonicalisation adaptée aux types existants.

Éviter un simple :

```ts
JSON.stringify(evidence);
```

si cela crée des dépendances fragiles à l'ordre des propriétés.

---

# 7. Evidence identity

Introduire si nécessaire une fonction interne de canonicalisation :

```ts
getEvidenceKey(evidence): string
```

Elle doit produire une clé stable.

Exemples conceptuels :

```text
script_url|https://example.com/_next/static/chunks/app.js

header|server|nginx

html_meta|generator|Next.js
```

La clé est un mécanisme technique de déduplication.

Elle ne doit pas être exposée comme une nouvelle donnée publique sauf si le modèle actuel le justifie réellement.

---

# 8. Ne pas dégrader le scoring

Le Step 9 ne doit pas modifier arbitrairement les scores du Step 7/8.

Conserver :

```text
ConfidenceScorer
ScoringDetector
```

comme source du score.

Si des modifications sont nécessaires pour conserver les preuves, elles doivent être minimales.

Le résultat attendu est :

```text
Detector
  → Detection + Evidence

DeduplicatingDetector
  → unique Detection/Evidence

ScoringDetector
  → Detection + Evidence + confidence
```

---

# 9. API / persistence

Vérifier que les preuves restent correctement persistées.

Le round-trip :

```text
Detection
  ↓
DB
  ↓
Detection
```

doit conserver :

- technology id ;
- technology name ;
- technology category ;
- confidence ;
- evidence ;
- evidence type ;
- evidence payload.

Si le schéma DB stocke déjà les preuves en JSONB, privilégier l'utilisation du contrat existant.

Ne pas créer une table relationnelle dédiée aux preuves à ce stade.

---

# 10. Tests obligatoires

Ajouter des tests ciblés.

## A — Evidence presence

Une détection sans evidence doit être rejetée ou impossible selon le contrat retenu.

## B — Evidence deduplication

Deux preuves identiques :

```text
A + A
```

doivent donner :

```text
A
```

## C — Different evidence

```text
A + B
```

doit conserver :

```text
A + B
```

## D — Deterministic ordering

```text
[A, B]
```

et :

```text
[B, A]
```

doivent produire le même résultat canonique.

## E — Scoring preservation

Vérifier que la phase de scoring ne supprime aucune evidence.

## F — Persistence round-trip

Vérifier :

```text
scan
→ persist
→ retrieve
```

avec conservation exacte des preuves.

## G — Multiple detectors

Une technologie détectée par plusieurs détecteurs doit produire une représentation cohérente et sans doublons.

## H — JSON serialization

Le résultat doit être sérialisable sans perte d'information.

## I — Existing regression suite

Tous les tests existants doivent continuer à passer.

---

# 11. Tests d'intégration à privilégier

Ajouter au minimum ces scénarios :

### Scenario A — Next.js

Plusieurs signatures convergent vers Next.js.

Vérifier :

```text
Next.js
confidence > 0
evidence.length >= 1
no duplicate evidence
```

### Scenario B — WordPress

Plusieurs fingerprints WordPress.

Vérifier que les preuves restent distinctes lorsqu'elles représentent des observations différentes.

### Scenario C — No fingerprint

Aucune technologie détectée.

Vérifier :

```text
detections = []
```

sans artefact.

### Scenario D — Noise

Des observations non pertinentes ne doivent pas générer d'evidence artificielle.

### Scenario E — Persistence

Vérifier que le résultat récupéré depuis PostgreSQL est équivalent au résultat avant persistance.

---

# 12. Architecture

Respecter strictement les frontières actuelles :

```text
packages/core
packages/detectors
apps/web
apps/worker
```

Les règles métier doivent rester dans les packages appropriés.

Ne pas déplacer la logique métier dans :

```text
Next.js route handlers
React components
database adapters
```

Ne pas créer de dépendance circulaire.

---

# 13. API publique

Toute nouvelle fonction publique doit être intentionnelle.

Avant d'exporter :

```ts
getEvidenceKey();
normalizeEvidence();
deduplicateEvidence();
```

vérifier si elle est réellement nécessaire à plusieurs packages.

Préférer une fonction interne si son utilisation reste locale.

---

# 14. Backward compatibility

Ne pas casser inutilement les contrats existants.

Si une modification de type est nécessaire :

- expliquer pourquoi ;
- mettre à jour les consumers ;
- mettre à jour les tests ;
- conserver autant que possible la structure existante.

Ne pas effectuer de refactoring hors sujet.

---

# 15. Validation finale

Exécuter :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular packages apps
```

Tous doivent passer.

Rapporter explicitement :

```text
Typecheck:
Tests:
Lint:
Build:
Circular dependencies:
```

---

# 16. Rapport final

Créer :

```text
Step9-report.md
```

Le rapport doit contenir :

## Executive Summary

## Audit Findings

## Detection Model

## Evidence Model

## Evidence Canonicalization

## Deduplication

## Determinism

## Persistence

## Tests Added

## Validation

## Files Changed

## Architectural Decisions

## Deferred Work

La section `Deferred Work` doit notamment identifier les améliorations qui ne doivent PAS être implémentées dans cette étape.

---

# Contraintes importantes

- Pas de LLM.
- Pas de réseau supplémentaire.
- Pas de nouveau fingerprint opportuniste.
- Pas de modification arbitraire du scoring.
- Pas de duplication du catalogue technologique.
- Pas de logique dans les route handlers.
- Pas de refactoring massif.
- Pas de dépendance supplémentaire sans justification.
- Pas de modification visuelle/frontend.
- Pas de nouvelle technologie détectée uniquement pour augmenter le nombre de détections.

Le principe directeur est :

> **Make every detection explainable without making the detector less conservative.**

Commencer par l'audit du repository, puis implémenter uniquement les changements nécessaires.

À la fin, fournir un rapport précis des modifications et des validations.
