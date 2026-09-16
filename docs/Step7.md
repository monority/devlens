Step 6J est validé.

Passe maintenant à **Step 7 — Detection Scoring / Confidence Engine**.

## Objectif

Concevoir et implémenter un mécanisme de scoring permettant d'évaluer la confiance finale d'une technologie à partir de plusieurs `Detection` / `Evidence` indépendantes.

L'objectif n'est PAS de remplacer les detectors existants.

Le pipeline doit rester conceptuellement :

HeaderDetector
MetaTagDetector
ScriptUrlDetector
ContentScriptDetector
ResourceDetector
LinkDetector
↓
CompositeDetector
↓
DeduplicatingDetector
↓
Confidence / Scoring
↓
ScanResult

Avant toute implémentation, inspecte précisément le modèle actuel et les comportements existants.

---

## Principe fondamental

Le système actuel donne essentiellement à chaque detector une confidence locale.

Ces confidences représentent :

> "À quel point cette signature individuelle est-elle fiable ?"

Le scoring doit répondre à une question différente :

> "À quel point l'ensemble des preuves observées rend-il probable que cette technologie soit effectivement présente ?"

Il faut donc distinguer :

1. confidence d'une signature
2. agrégation de plusieurs evidences
3. score final d'une technologie

Ne mélange pas ces concepts.

---

## Contraintes

### 1. Pas de big-bang architectural

Ne pas refactorer les detectors existants inutilement.

Ne pas modifier leurs signatures simplement pour introduire le scoring.

Ne pas réécrire CompositeDetector.

Ne pas supprimer DeduplicatingDetector.

Le nouveau système doit s'intégrer autour des abstractions existantes.

### 2. Pas de machine learning

Aucun :

- ML
- modèle externe
- LLM
- probabilités statistiques non justifiées
- réseau externe

Le scoring doit être déterministe.

### 3. Pas de faux sentiment mathématique

Ne prétends pas que :

```text
85 + 90 + 90 = 265%
```

ou qu'une somme de confidences représente une probabilité réelle.

Le résultat final doit rester un **score de confiance interne à DevLens**, borné selon les conventions choisies.

Documente clairement ce que signifie ce score.

---

# 4. Étudier les données existantes

Avant de coder, inspecter :

- `Detection`
- `Evidence`
- toutes les variantes d'evidence
- `Technology`
- `Detector`
- `CompositeDetector`
- `DeduplicatingDetector`
- tous les detectors actuels
- tous les tests associés
- `ScanResult`
- persistence JSONB
- API response
- Worker pipeline

Identifier également si le domaine possède déjà des champs ou conventions permettant de stocker un score.

Ne crée pas un deuxième concept concurrent si un concept existant peut être réutilisé.

---

# 5. Concevoir le scoring

Le scoring doit être **monotone mais plafonné** :

- une preuve supplémentaire pertinente peut augmenter le score
- elle ne doit jamais faire dépasser le maximum
- les preuves faibles ne doivent pas écraser une preuve forte
- des preuves identiques ne doivent pas artificiellement multiplier le score

Exemple conceptuel acceptable :

```text
1 preuve forte      → score élevé
2 preuves fortes    → score supérieur
3 preuves fortes    → score encore supérieur mais plafonné
10 preuves fortes   → score plafonné
```

Mais ne choisis pas arbitrairement la formule.

Justifie-la.

---

# 6. Indépendance des preuves

Le point le plus important du scoring est d'éviter de considérer comme indépendantes des preuves qui proviennent en réalité de la même information.

Par exemple :

```text
/wp-content/
/wp-includes/
/wp-json/
```

sont trois URLs différentes mais peuvent toutes provenir du même fingerprint WordPress.

De même :

```text
next/router
__NEXT_DATA__
/_next/
```

sont plusieurs manifestations du même framework.

Le système doit donc réfléchir à la notion de :

```text
evidence source
```

ou équivalent.

Si le modèle actuel ne permet pas de distinguer proprement ces sources, concevoir l'extension minimale nécessaire.

Ne pas introduire une taxonomie énorme.

---

# 7. Déduplication

La déduplication actuelle doit rester correcte.

Le scoring ne doit pas recréer des doublons.

Pipeline attendu :

```text
raw detections
    ↓
CompositeDetector
    ↓
DeduplicatingDetector
    ↓
one Detection / technology
    ↓
Scoring
    ↓
final confidence / score
```

Si l'architecture actuelle rend ce placement incorrect, explique pourquoi avant de modifier.

---

# 8. API du scoring

Créer une abstraction minimale et testable, par exemple :

```ts
interface DetectionScorer {
  score(detection: Detection): Detection;
}
```

ou une forme équivalente adaptée au domaine existant.

Ne pas créer une architecture
