# Step 77 — Detection Confidence & Evidence Quality Presentation

## Mission

Implémente le prochain step substantiel de DevLens.

Le Step 76 a ajouté `signalQuality`, une mesure descriptive de corroboration entre familles de sources indépendantes. Le Step 74 a ajouté le diff de détections entre scans.

Le Step 77 doit maintenant **exploiter ces informations dans la présentation et l'interprétation des détections**, afin que l'utilisateur comprenne rapidement :

* pourquoi une technologie est détectée ;
* à quel point les observations sont corroborées ;
* si la détection est directe ou dérivée ;
* comment interpréter une détection lors d'une comparaison de scans.

Le but n'est PAS de créer un nouveau score probabiliste.

---

# 1. Commencer par inspecter le dépôt

Avant toute modification, inspecte réellement :

* `Detection`
* `Evidence`
* `DetectionExplainability`
* `signal-quality.ts`
* `detection-explainability.ts`
* `DetectionItem`
* `ScanComparison`
* `comparison.ts`
* `detection-to-response.ts`
* `ScanOverview`
* `ScanDetailView`
* les tests UI existants
* les conventions CSS/design existantes.

Vérifie également précisément l'état actuel du Step 74/75 concernant :

* `comparison-api.test.ts`
* les tests de provenance `derived ↔ direct`.

Ne répare pas automatiquement ces éventuelles lacunes historiques dans le commit Step 77 sauf si elles sont strictement nécessaires au nouveau comportement.

---

# 2. Contraintes architecturales

NE PAS modifier :

* `ConfidenceScorer`
* le score `confidence`
* `DeduplicatingDetector`
* `RelationshipResolver`
* le catalogue
* les signatures
* le crawler
* la persistence DB
* le système de version
* le modèle de relations.

Le Step 77 est principalement une évolution de :

* explainability ;
* API response ;
* UI ;
* comparaison.

Aucune nouvelle capacité de collecte n'est nécessaire.

---

# 3. Principe produit

DevLens possède maintenant plusieurs dimensions différentes :

### Detection confidence

Score déterministe `0–100`.

Il reste un **ranking score**, jamais une probabilité.

### Signal quality

Corroboration descriptive :

* `no_evidence`
* `single_signal`
* `corroborated`
* `strong`

basée sur les familles de sources indépendantes.

### Provenance

* direct
* derived

### Evidence

Les observations concrètes expliquant la détection.

Le Step 77 doit rendre ces dimensions **complémentaires et lisibles**, sans les fusionner artificiellement dans un nouveau score.

---

# 4. Ajouter un modèle d'interprétation UI pur

Si l'architecture actuelle le justifie, crée un petit helper pur côté `apps/web`, par exemple :

`detection-presentation.ts`

ou un nom équivalent cohérent avec le dépôt.

Il doit transformer une `DetectionResponse` en informations de présentation déterministes.

Exemple conceptuel :

```ts
type DetectionPresentation = {
  confidenceLabel: string;
  signalQualityLabel: string;
  provenanceLabel: string;
  evidenceSummary: string;
};
```

Adapte les noms aux conventions existantes.

IMPORTANT :

Ce modèle ne doit PAS calculer un nouveau score numérique.

Il doit uniquement produire des informations descriptives.

---

# 5. Confidence : supprimer toute ambiguïté sémantique

Le UI doit continuer à afficher le score comme un score de confiance/ranking.

Il ne faut absolument pas revenir à :

* `%`
* probability
* likelihood
* certainty
* "95% sure"

Le wording doit clairement rester compatible avec la définition actuelle de DevLens.

Si le UI actuel affiche simplement `Confidence: 95`, conserve cette convention si elle est cohérente.

Ne transforme pas le score existant.

---

# 6. Présentation combinée

Dans `DetectionItem`, améliore la hiérarchie visuelle pour obtenir quelque chose du type :

```text
WordPress
Confidence 100 · Strong · Direct

Detected because
  Header — x-powered-by
  Meta — generator
  Script URL — /wp-includes/...

Version: 6.4.2
```

Pour une détection dérivée :

```text
React
Confidence 0 · Derived

Derived from Next.js
No direct evidence available
```

Pour une détection faible :

```text
SomeTechnology
Confidence 85 · Single signal · Direct
```

Les textes exacts doivent respecter le design system existant.

Ne pas ajouter de gros badges colorés ou de nouveau composant visuellement dominant.

---

# 7. Signal quality

Réutiliser **exactement** `explanation.signalQuality`.

Ne recalculer aucune qualité dans React.

Ne pas créer une seconde implémentation.

La UI doit seulement présenter :

* niveau ;
* nombre de sources ;
* éventuellement un résumé court.

Exemples :

```text
Strong · 3 sources
Corroborated · 2 sources
Single signal · 1 source
No direct evidence
```

Pour une détection dérivée :

```text
Derived · no direct evidence
```

La provenance doit rester prioritaire sur une qualité vide.

---

# 8. Evidence summary

Ajoute si utile un résumé compact indiquant combien de familles d'observation participent réellement à la détection.

Exemple :

```text
3 independent sources
```

Mais évite de répéter inutilement :

```text
Strong · 3 sources
3 independent sources
```

Si l'information est déjà parfaitement exprimée par `signalQualityLabel`, ne duplique pas.

Le résultat final doit rester compact.

---

# 9. Version

Conserver la présentation actuelle :

```text
Version: 6.4.2
```

ou :

```text
Version: unavailable — conflict detected
```

La version ne doit pas influencer `signalQuality`.

Une version connue n'implique pas une meilleure détection.

Une version conflictuelle ne dégrade pas la qualité de présence.

---

# 10. Derived detections

Pour une détection :

```ts
source === "relationship"
```

ou équivalent selon le modèle réel :

* ne jamais afficher `Strong`;
* ne jamais compter l'évidence de la technologie source ;
* ne jamais inventer une source ;
* conserver la relation existante.

Présentation attendue :

```text
Derived · no direct evidence
Derived from Next.js
```

Si une future détection dérivée possède réellement une evidence directe, le helper doit respecter les données réelles plutôt que supposer qu'une détection dérivée est toujours sans evidence.

---

# 11. Scan Comparison

Améliore également `ScanComparison` afin que les changements soient interprétables sans devoir ouvrir chaque détection.

Exemple conceptuel :

```text
WordPress
Version changed
6.4.1 → 6.4.2

Confidence
95 → 100

Evidence
2 → 3 sources
```

OU, si la comparaison actuelle ne permet pas de calculer proprement ce dernier élément :

ne l'ajoute pas.

Utilise uniquement les informations déjà présentes dans `DetectionChange`.

Pour les changements de provenance :

```text
Direct → Derived
```

ou l'inverse.

Pour les changements de signal quality, n'ajoute cette information que si les deux côtés disposent réellement de `signalQuality`.

IMPORTANT :

Ne créer aucune conclusion du type :

* "more reliable"
* "less reliable"
* "better detection"
* "worse detection"

à partir de ces changements.

Présente uniquement les faits observés.

---

# 12. API

`DetectionResponse.explanation.signalQuality` reste la source unique.

Ne créer aucun champ API redondant tel que :

```ts
signalQualityLevel
sourceCount
corroborationScore
```

si ces informations sont déjà contenues dans `explanation.signalQuality`.

Le helper de présentation doit fonctionner sur la réponse existante.

---

# 13. Accessibilité

Le nouveau rendu doit :

* fonctionner sans couleur ;
* être lisible au clavier ;
* ne pas dépendre uniquement d'un badge ;
* avoir un texte explicite ;
* conserver les labels accessibles existants.

Ne pas ajouter d'icônes uniquement décoratives si elles n'apportent rien.

---

# 14. Tests obligatoires

Ajoute des tests ciblés.

## Presentation helper

Tester au minimum :

1. direct + strong ;
2. direct + single signal ;
3. direct + corroborated ;
4. no evidence ;
5. derived detection ;
6. version présente ;
7. version conflictuelle ;
8. déterminisme.

## DetectionItem

Tester :

1. rendu confidence + signal quality ;
2. direct ;
3. derived ;
4. no direct evidence ;
5. version conflict ;
6. absence éventuelle de `signalQuality` pour legacy response.

## ScanComparison

Tester uniquement les nouveaux éléments réellement implémentés :

1. changement de provenance ;
2. changement de confidence ;
3. version change ;
4. éventuellement signal-quality change si les données le permettent.

Ne supprime aucune couverture existante.

---

# 15. Régression obligatoire

Prouver explicitement que le Step 77 ne modifie pas :

* technology IDs détectés ;
* confidence scores ;
* versions ;
* evidence ;
* relationship resolution.

Au minimum, les tests existants des Steps 63–76 doivent rester verts.

---

# 16. Performance

Le helper de présentation doit être :

* pur ;
* O(n) maximum par détection ;
* sans accès réseau ;
* sans accès DB ;
* sans mutation.

La UI ne doit pas recalculer les détections.

---

# 17. Validation

Exécute :

```bash
pnpm vitest run
pnpm typecheck
pnpm exec eslint .
pnpm exec prettier --check <tous les fichiers touchés>
pnpm build
```

Utilise les scripts/configuration réels du repo si les commandes diffèrent.

Fais également un audit ciblé du diff final.

Si un test échoue :

1. identifier la vraie cause ;
2. corriger ;
3. rerun le test ;
4. rerun les gates nécessaires.

Ne contourne jamais un test pour obtenir du vert.

---

# 18. Git hygiene

Commit uniquement les fichiers du Step 77.

NE PAS utiliser :

```bash
git add -A
```

NE PAS committer :

* `.poolside/`
* `settings.local.yaml`
* `.env*`
* secrets
* runtime artifacts
* scratch files
* `docs/Step*.md`
* les modifications préexistantes sans rapport.

Commit exact :

```text
Step 77: Detection Interpretation & Presentation
```

Après le commit :

```bash
git status
```

Puis vérifie que seuls les éléments préexistants restent.

---

# 19. Final report

Retourne un rapport structuré :

```text
STATUS

COMMIT

ARCHITECTURE

PRESENTATION MODEL

DETECTION ITEM

SCAN COMPARISON

API

ACCESSIBILITY

TESTS

REGRESSION

VALIDATION

GIT HYGIENE

LIMITATIONS
```

Indique précisément :

* fichiers modifiés ;
* nouveaux helpers ;
* nouveaux tests ;
* nombre total de tests ;
* résultat typecheck ;
* ESLint ;
* Prettier ;
* build ;
* commit SHA ;
* éventuelles limitations réelles.

Ne prétends pas avoir effectué une vérification que tu n'as pas réellement exécutée.

## Critère de réussite

Le Step 77 est réussi si un utilisateur peut regarder une détection et comprendre immédiatement, sans interprétation statistique :

1. **quel score DevLens lui attribue ;**
2. **si plusieurs familles de signaux la corroborent ;**
3. **si elle est directe ou dérivée ;**
4. **quelles observations la justifient ;**
5. **quelle version est observée, si disponible ;**
6. et, dans une comparaison, **quels faits ont changé entre les scans**.

Le moteur de détection lui-même doit rester strictement inchangé.
