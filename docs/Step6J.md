# Step 6J — LinkDetector

## Contexte

DevLens possède maintenant plusieurs `Detector` spécialisés :

- `HeaderDetector`
- `MetaTagDetector`
- `ScriptUrlDetector`
- `ResourceDetector`

`Step 6I — ResourceDetector` est terminé et validé.

Le prochain objectif est d'implémenter **`LinkDetector`**, un nouveau `Detector` responsable de détecter des technologies à partir des éléments HTML `<link>` déjà observés par le crawler.

Cette étape doit rester strictement locale :

- aucun réseau supplémentaire ;
- aucune DB ;
- aucune logique métier dans les routes ;
- aucune modification inutile de `CompositeDetector` ou `DeduplicatingDetector` ;
- réutiliser les abstractions existantes.

---

# Objectif

Implémenter `LinkDetector` afin qu'il analyse les `<link>` présents dans `SiteSnapshot.html` et produise des `Detection[]` à partir de signatures URL conservatrices.

Le detector doit fonctionner uniquement sur les données déjà présentes dans le snapshot.

Architecture cible :

```text
HTML crawler observation
        │
        ▼
     LinkTag[]
        │
        ▼
   LinkDetector
        │
        ├── signature matching
        ├── URL normalization / validation
        ├── confidence selection
        └── evidence generation
        │
        ▼
    Detection[]
        │
        ▼
 CompositeDetector
```

---

# 1. Examiner l'architecture existante avant toute modification

Commencer par inspecter le repository afin de comprendre précisément :

- `SiteSnapshot`
- les observations HTML existantes ;
- `ScriptTag` ;
- `ScriptUrlDetector` ;
- `ResourceDetector` ;
- `Detector` ;
- `Detection` ;
- `Evidence` ;
- `Url` ;
- `CompositeDetector` ;
- `DeduplicatingDetector` ;
- les tests existants ;
- le wiring Web API ;
- le wiring Worker.

Ne pas supposer les types existants.

Réutiliser les conventions déjà présentes dans le projet.

Avant d'écrire du code, déterminer notamment si les `<link>` sont déjà observés par le crawler.

---

# 2. Modèle HTML

Si l'observation des `<link>` existe déjà, la réutiliser telle quelle.

Sinon, introduire l'observation minimale nécessaire.

Modèle attendu :

```ts
export interface LinkTag {
  rel: string | null;
  href: string | null;
  content: string;
}
```

Adapter le modèle aux conventions réelles du repository si un type équivalent existe déjà.

Le crawler doit uniquement collecter les données nécessaires.

Ne pas ajouter de fetch spécifique pour les URLs découvertes.

---

# 3. LinkDetector

Créer :

```text
packages/detectors/src/link-detector.ts
```

ou l'emplacement correspondant aux conventions du repository.

Créer :

```ts
export class LinkDetector implements Detector
```

Le detector doit analyser :

```ts
snapshot.html.links;
```

ou le champ réellement retenu par le modèle.

Il doit retourner des `Detection[]`.

---

# 4. Signatures initiales

Commencer volontairement avec un nombre limité de signatures à forte valeur.

### WordPress

| Signature       | Technologie | Confidence |
| --------------- | ----------- | ---------: |
| `/wp-content/`  | WordPress   |         90 |
| `/wp-includes/` | WordPress   |         90 |
| `/wp-json/`     | WordPress   |         90 |

### Shopify

| Signature         | Technologie | Confidence |
| ----------------- | ----------- | ---------: |
| `cdn.shopify.com` | Shopify     |         95 |
| `shopifycdn.com`  | Shopify     |         95 |

### Google Fonts

| Signature              | Technologie  | Confidence |
| ---------------------- | ------------ | ---------: |
| `fonts.googleapis.com` | Google Fonts |         90 |

Ces signatures doivent être considérées comme des **signatures URL**, pas comme de simples recherches naïves avec `String.includes()`.

---

# 5. Matching URL robuste

Éviter les faux positifs évidents.

Ne pas faire simplement :

```ts
href.includes('shopifycdn.com');
```

Privilégier une analyse structurée de l'URL.

Exemples :

```text
https://cdn.shopify.com/...
```

→ Shopify

mais :

```text
https://shopifycdn.com.example.com/...
```

→ ne doit pas matcher Shopify.

De même :

```text
https://example.com/wp-content/
```

→ WordPress

mais :

```text
https://example.com/my-wp-content-like/
```

→ ne doit pas être considéré automatiquement comme WordPress si la signature attend un segment URL précis.

Respecter les types URL existants du projet.

---

# 6. Gestion de `rel`

Les `<link>` peuvent avoir plusieurs usages :

```html
<link rel="stylesheet" href="..." />
<link rel="icon" href="..." />
<link rel="canonical" href="..." />
<link rel="alternate" href="..." />
<link rel="preload" href="..." />
```

Le detector doit :

- ne pas supposer que chaque `<link>` est une ressource CSS ;
- ne pas détecter une technologie uniquement à cause de `rel` ;
- utiliser principalement `href` pour les signatures URL ;
- ignorer proprement les éléments sans `href`.

Si `rel` apporte une information utile à la signature, l'utiliser uniquement lorsqu'elle est explicitement nécessaire.

---

# 7. Evidence

Réutiliser le modèle d'evidence existant.

Introduire uniquement le type nécessaire, par exemple :

```ts
export interface LinkEvidence {
  type: 'link';
  url: Url;
}
```

Adapter exactement cette structure au modèle actuel du repository.

L'evidence doit permettre de comprendre pourquoi la technologie a été détectée.

Ne pas ajouter de données inutiles.

---

# 8. Confidence et fusion

Suivre le comportement déjà établi par les detectors précédents.

Si plusieurs signatures détectent la même technologie dans différents `<link>` :

- conserver la meilleure confidence ;
- fusionner les evidence de manière déterministe ;
- supprimer les doublons exacts ;
- conserver l'ordre déterministe des signatures / observations selon les conventions existantes.

Ne pas réimplémenter `DeduplicatingDetector`.

Le detector reste responsable uniquement de sa propre agrégation interne si c'est déjà le pattern utilisé par `ResourceDetector`.

---

# 9. Cas à éviter

Le detector doit être conservateur.

Ne pas détecter WordPress à partir de :

```text
wp
wpblock
wp-content-like
my-wp-content
```

Ne pas détecter Shopify à partir de :

```text
shopify
shopifycdn
shopifycdn.com.example.com
```

si le hostname réel ne correspond pas à la signature attendue.

Ne pas détecter Google Fonts à partir de :

```text
fonts.googleapis.com.example.com
```

Ne pas effectuer de résolution DNS.

Ne pas effectuer de requête HTTP.

Ne pas télécharger les ressources référencées.

---

# 10. Tests

Créer :

```text
link-detector.test.ts
```

ou suivre la convention existante.

Prévoir au minimum :

## Positifs

- WordPress via `/wp-content/`
- WordPress via `/wp-includes/`
- WordPress via `/wp-json/`
- Shopify via `cdn.shopify.com`
- Shopify via `shopifycdn.com`
- Google Fonts via `fonts.googleapis.com`

## Négatifs

Tester notamment :

```text
/wp-content-like/
/my-wp-content/
/wp/
/shopify/
/shopifycdn/
/shopifycdn.com.example.com/
/fonts.googleapis.com.example.com/
```

## Edge cases

Tester :

- `href = null`
- `href = ""`
- URL relative
- URL absolue
- URL malformée
- plusieurs `<link>` identiques
- plusieurs signatures pour la même technologie
- plusieurs technologies dans le même snapshot
- `rel = null`
- `rel` inconnu
- contenu HTML sans `<link>`

## Faux positifs

Ajouter explicitement plusieurs tests démontrant que des URLs simplement similaires ne produisent aucune détection.

---

# 11. Intégration

Après implémentation :

- exporter `LinkDetector` depuis l'index approprié ;
- ajouter le detector au `CompositeDetector` Web API ;
- ajouter le detector au `CompositeDetector` Worker ;
- ne modifier aucune autre pipeline inutilement.

Vérifier que l'ordre d'exécution respecte les conventions actuelles.

---

# 12. Documentation

Mettre à jour uniquement la documentation réellement concernée :

- `detectors.md`
- structure des fichiers si nécessaire ;
- overview / exports si le projet les maintient explicitement ;
- créer `Step6J-report.md`.

Le rapport final doit documenter :

1. problème ;
2. architecture ;
3. modèle `LinkTag` ;
4. signatures ;
5. matching URL ;
6. evidence ;
7. agrégation/confidence ;
8. tests ;
9. intégration ;
10. validations ;
11. fichiers créés ;
12. fichiers modifiés ;
13. limites connues ;
14. prochaine étape recommandée.

---

# 13. Contraintes architecturales

Ne pas :

- refactorer les detectors existants sans nécessité ;
- modifier `CompositeDetector` ;
- modifier `DeduplicatingDetector` ;
- introduire un moteur générique de signatures URL ;
- introduire une nouvelle abstraction prématurée ;
- ajouter des dépendances ;
- effectuer des requêtes réseau ;
- accéder directement à la DB ;
- déplacer la logique métier dans les routes ;
- ajouter des signatures spéculatives simplement pour augmenter le nombre de détections.

Le code doit rester simple, lisible et cohérent avec `ScriptUrlDetector` et `ResourceDetector`.

---

# 14. Validation obligatoire

À la fin :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular .
```

Adapter uniquement la dernière commande au périmètre/configuration réellement utilisé par le repository si nécessaire.

Tous les tests doivent passer.

Aucune erreur TypeScript.

Aucune erreur ESLint/Prettier.

Aucune dépendance circulaire.

---

# 15. Rapport final

Ne pas simplement dire "Step 6J terminé".

Fournir un rapport structuré comprenant :

```text
Step 6J — LinkDetector — Rapport final

1. Objectif
2. Architecture
3. Observation HTML
4. LinkDetector
5. Signatures
6. URL matching
7. Evidence
8. Confidence / merge
9. Tests
10. Intégration
11. Validation
12. Fichiers créés
13. Fichiers modifiés
14. Limites
15. Prochaine étape recommandée
```

Indiquer les commandes exécutées et leurs résultats exacts.

Ne considérer l'étape comme terminée que si l'ensemble du repository reste vert.
