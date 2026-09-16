# DevLens — Step 10 — Confidence Calibration & Detection Ranking

## Context

DevLens est un monorepo TypeScript strict de détection de technologies web.

Pipeline actuel :

```text
Snapshot
    ↓
CompositeDetector
    ↓
DeduplicatingDetector
    ↓
ScoringDetector(ConfidenceScorer)
    ↓
ScanResult
    ↓
Persistence
```

Après Step 8 et Step 9 :

- le catalogue technologique est centralisé ;
- les détecteurs utilisent `getTechnology(id)` ;
- les preuves sont structurées et typées ;
- les preuves sont dédupliquées de manière canonique ;
- l'ordre des preuves est déterministe ;
- `ConfidenceScorer` préserve les preuves ;
- les résultats sont persistés en JSONB ;
- les tests couvrent intégration, déterminisme et persistence.

État de référence :

```text
pnpm typecheck → 0 errors
pnpm test      → 557 passed / 9 skipped
pnpm lint      → OK
pnpm build     → OK
madge          → no circular dependency
```

## Mission

Implémenter **Step 10 — Confidence Calibration & Detection Ranking**.

L'objectif est de rendre le score de confiance :

1. cohérent ;
2. explicable ;
3. déterministe ;
4. comparable entre technologies ;
5. robuste face aux preuves multiples et contradictoires.

Le résultat final doit permettre de répondre à :

> "Pourquoi cette technologie est-elle classée devant une autre ?"

---

# 1. Audit obligatoire avant modification

Avant d'écrire du code, inspecter :

- `ConfidenceScorer` ;
- `ScoringDetector` ;
- `Detection` ;
- `Evidence` et ses 8 variantes ;
- tous les détecteurs existants ;
- toutes les tables de signatures ;
- `technology-catalog.ts` ;
- les tests de scoring existants ;
- les tests d'intégration ;
- la persistence des `Detection` ;
- tous les endroits où `confidence` est consommé.

Identifier précisément :

```text
Current scoring formula
Current confidence range
Evidence weighting
Duplicate handling
Thresholds
Tie-breaking
Detection ordering
Persistence behavior
```

Ne rien modifier avant d'avoir compris le scoring actuel.

---

# 2. Principe fondamental

**Ne pas réécrire le système de scoring sans nécessité.**

Cette étape est une calibration/refactorisation ciblée.

Si le scoring actuel est déjà correct sur certains aspects, les conserver.

Le but n'est pas de créer artificiellement un système complexe.

Éviter :

- machine learning ;
- LLM ;
- probabilités pseudo-scientifiques ;
- statistiques inventées ;
- dizaines de coefficients ;
- configuration dynamique prématurée.

Le scoring doit rester lisible dans le code.

---

# 3. Définir explicitement le contrat de confidence

Le score doit avoir un contrat clair.

Documenter précisément :

```ts
confidence: number;
```

avec :

```text
0 ≤ confidence ≤ 1
```

Définir ce que représentent :

```text
0
0.25
0.5
0.75
1
```

Ne pas prétendre que le score représente une probabilité statistique réelle si aucune calibration statistique ne le justifie.

Le terme "confidence" doit représenter une **force de preuve déterministe**.

---

# 4. Identifier les niveaux de force des preuves

Auditer les 8 variantes d'Evidence existantes et déterminer si certaines constituent naturellement des signaux :

- forts ;
- moyens ;
- faibles.

Exemple conceptuel uniquement :

```text
Strong:
  exact technology-specific signature

Medium:
  technology-specific URL/resource

Weak:
  generic contextual signal
```

Ne pas inventer de nouveaux types d'evidence.

Ne pas modifier la sémantique d'une evidence uniquement pour faciliter le scoring.

Documenter la classification dans le code si elle est nécessaire.

---

# 5. Éviter le piège "plus de preuves = toujours meilleur score"

Le score ne doit pas augmenter indéfiniment simplement parce qu'une page contient beaucoup de signaux faibles.

Exemple problématique :

```text
1 strong evidence
```

contre :

```text
15 weak evidences
```

Le moteur doit conserver une hiérarchie raisonnable.

Le scoring doit donc éviter :

```text
confidence = evidenceCount * weight
```

sans plafond ni normalisation.

Privilégier une formule bornée et monotone.

---

# 6. Convergence des preuves

Lorsqu'une technologie possède plusieurs preuves indépendantes :

```text
Technology A
 ├─ strong evidence
 ├─ medium evidence
 └─ weak evidence
```

le score doit refléter une convergence plus forte.

Mais :

```text
same evidence duplicated 5 times
```

ne doit pas artificiellement augmenter la confiance.

Step 9 garantit déjà la déduplication.

Step 10 doit exploiter cette propriété.

---

# 7. Preuves contradictoires

Tester explicitement les cas où plusieurs technologies sont plausibles.

Exemple :

```text
React
Next.js
```

Une page Next.js peut naturellement produire des indices React.

Le moteur ne doit pas conclure :

```text
React = 0.91
Next.js = 0.91
```

uniquement parce que Next.js utilise React.

Le ranking doit permettre à une signature spécifique de Next.js de dominer un signal générique React.

Important :

> Ne pas ajouter de logique spécifique "React vs Next.js" dans le scorer.

La préférence doit découler de la force/spécificité des preuves.

Si le modèle actuel ne permet pas cela proprement, documenter le gap au lieu d'introduire un hack.

---

# 8. Normalisation

Garantir que toutes les confidence values sont normalisées :

```ts
0 <= confidence <= 1;
```

Créer si nécessaire une fonction interne :

```ts
clampConfidence(value);
```

ou équivalent.

Elle doit :

- être déterministe ;
- gérer les limites ;
- éviter `NaN` ;
- éviter `Infinity` ;
- éviter les valeurs négatives ;
- éviter les valeurs > 1.

Ajouter des tests explicites.

---

# 9. Ranking final

Définir un ordre déterministe pour `Detection[]`.

Le ranking primaire doit être :

```text
confidence DESC
```

Mais le cas d'égalité doit également être déterministe.

Définir un tie-break stable.

Préférence :

```text
confidence DESC
technology.id ASC
```

ou un mécanisme équivalent compatible avec les conventions actuelles.

Ne jamais dépendre de l'ordre d'insertion d'un `Map`, d'un objet ou de l'ordre des détecteurs pour départager deux résultats.

---

# 10. Seuil de détection

Auditer le comportement actuel concernant les scores très faibles.

Déterminer s'il existe déjà :

```text
minimum confidence threshold
```

Si oui :

- le documenter ;
- tester sa stabilité ;
- ne pas le modifier sans justification.

Si aucun seuil n'existe et qu'un seuil est réellement nécessaire, choisir une valeur conservatrice et documenter clairement pourquoi.

Ne pas supprimer des détections uniquement pour rendre l'UI plus propre.

Le moteur de détection doit rester fidèle aux preuves.

---

# 11. Architecture

Préserver les responsabilités :

```text
Detector
  → produit des preuves

DeduplicatingDetector
  → fusionne les preuves

ConfidenceScorer
  → calcule la confidence

ScoringDetector
  → applique le scoring au résultat

ScanResult
  → contient les détections finales
```

Ne pas déplacer le scoring dans les détecteurs.

Ne pas faire calculer la confidence dans les tables de signatures.

Ne pas mettre de scoring dans :

```text
API routes
database repository
React/UI
```

---

# 12. Tests unitaires du scorer

Ajouter une suite dédiée :

```text
confidence-scorer.test.ts
```

Couvrir au minimum :

### A — No evidence

Impossible ou explicitement rejeté selon le contrat existant.

### B — Single strong evidence

Doit produire un score supérieur à un signal faible équivalent.

### C — Single medium evidence

Score intermédiaire cohérent.

### D — Single weak evidence

Score faible mais non arbitrairement nul.

### E — Multiple independent evidence

Le score augmente de manière monotone.

### F — Duplicate evidence

Les doublons n'augmentent pas le score.

### G — Strong + weak

Le signal fort reste dominant.

### H — Many weak signals

Une quantité excessive de signaux faibles ne doit pas dépasser arbitrairement une preuve forte.

### I — Bounds

Toujours :

```text
0 <= confidence <= 1
```

### J — NaN / Infinity

Le scorer ne doit jamais produire :

```text
NaN
Infinity
-Infinity
```

### K — Determinism

Même evidence set → même score.

### L — Monotonicity

Ajouter une preuve réellement supplémentaire ne doit pas diminuer la confidence, sauf si le modèle actuel prévoit explicitement des preuves négatives.

---

# 13. Tests de ranking

Créer :

```text
detection-ranking.test.ts
```

Tester :

### Scenario A

```text
Next.js = 0.90
React   = 0.70
```

Résultat :

```text
Next.js
React
```

### Scenario B

Égalité :

```text
A = 0.80
B = 0.80
```

Résultat déterministe selon le tie-break.

### Scenario C

Ordre d'entrée inversé :

```text
[A, B]
```

et :

```text
[B, A]
```

doivent produire le même classement.

### Scenario D

Plusieurs technologies détectées.

Le classement doit être stable.

### Scenario E

Deux technologies avec des preuves de force différente.

La technologie bénéficiant du signal plus spécifique doit pouvoir être classée devant l'autre sans logique hardcodée propre à leur identité.

---

# 14. Tests d'intégration

Ajouter ou compléter :

```text
confidence-integration.test.ts
```

Scénarios obligatoires :

## Next.js

Vérifier que les preuves spécifiques dominent les signaux génériques.

## WordPress

Plusieurs preuves doivent converger correctement.

## Shopify

Vérifier le ranking et la stabilité.

## React vs Next.js

Vérifier qu'une détection Next.js correctement fingerprintée ne se retrouve pas artificiellement au même niveau que React simplement à cause de signaux génériques.

## Noise

Les signaux faibles/bruités ne doivent pas créer des scores artificiellement élevés.

## No fingerprint

Aucune détection artificielle.

---

# 15. Persistence

Ne modifier le schéma DB que si absolument nécessaire.

Le round-trip doit continuer à conserver exactement :

```text
technology.id
technology.name
technology.category
confidence
evidence
```

Tester :

```text
scan
 ↓
score
 ↓
persist
 ↓
retrieve
```

Le classement et les scores doivent rester identiques après persistence.

---

# 16. API compatibility

Vérifier que l'API existante conserve sa forme.

Ne pas exposer de nouvelles propriétés publiques uniquement parce qu'elles sont disponibles en interne.

Si une nouvelle donnée est réellement nécessaire pour expliquer le ranking, justifier son ajout.

---

# 17. Documentation

Mettre à jour :

```text
detectors.md
overview.md
```

uniquement dans les sections concernées.

Documenter :

- définition de confidence ;
- stratégie de scoring ;
- bornes ;
- ranking ;
- tie-break ;
- comportement face aux preuves multiples ;
- comportement face aux doublons.

Créer :

```text
Step10-report.md
```

avec :

```text
# Executive Summary

# Current Scoring Audit

# Confidence Contract

# Evidence Weighting

# Normalization

# Ranking

# Tie-breaking

# Tests

# Persistence

# Architectural Decisions

# Deferred Work
```

---

# 18. Ce qui est explicitement hors scope

NE PAS implémenter :

- nouveaux détecteurs ;
- nouvelles technologies ;
- machine learning ;
- LLM ;
- scoring probabiliste ;
- apprentissage automatique ;
- système de réputation ;
- historique des scans ;
- UI de visualisation ;
- modification majeure de la persistence ;
- système de règles spécifique à chaque paire de technologies ;
- logique spéciale `React vs Next.js` codée en dur.

Step 10 doit améliorer **le moteur générique**, pas résoudre chaque conflit manuellement.

---

# 19. Validation finale

Exécuter :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular packages apps
```

Tous doivent passer.

Rapporter :

```text
Typecheck:
Tests:
Lint:
Build:
Circular dependencies:
```

Comparer également le nombre total de tests avec l'état précédent :

```text
Step 9:
557 passed / 9 skipped
```

---

# 20. Rapport final obligatoire

Le rapport final doit répondre clairement à ces questions :

1. Quelle était exactement la formule de scoring avant Step 10 ?
2. Qu'est-ce qui a été conservé ?
3. Qu'est-ce qui a changé ?
4. Comment une evidence influence-t-elle maintenant la confidence ?
5. Comment les preuves multiples sont-elles combinées ?
6. Comment les doublons sont-ils traités ?
7. Comment les égalités sont-elles départagées ?
8. Le résultat est-il totalement déterministe ?
9. Quels cas restent volontairement hors scope ?
10. Quels travaux sont recommandés pour Step 11 ?

## Principe directeur

> **A confidence score should express evidence strength, not evidence quantity.**

Commencer par l'audit du repository.

Ne modifier le code qu'après avoir identifié précisément les limites du scoring actuel.

Privilégier le changement minimal permettant d'obtenir un scoring cohérent, borné, déterministe et explicable.
