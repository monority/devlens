# Step 6J — LinkDetector — Rapport final

## 1. Objectif

Implémenter `LinkDetector`, un nouveau `Detector` qui analyse les
balises HTML `<link>` déjà observées par le crawler (dans
`SiteSnapshot.html.links`) et produit des `Detection[]` à partir de
signatures URL conservatrices.

Le detector doit rester strictement local :

- Aucun réseau supplémentaire
- Aucune base de données
- Aucune modification de `CompositeDetector` ou `DeduplicatingDetector`
- Réutilisation des abstractions existantes du domaine

La contrainte centrale est l'absence de **faux positifs** évidents :
les signatures URL doivent être analysées de manière structurée, pas
via de simples `String.includes()`.

## 2. Architecture

```text
HTML crawler observation (extractHtml)
        │
        ▼
     LinkTag[]  (rel, href, content)
        │
        ▼
   LinkDetector.detect(snapshot)
        │
        ├── URL resolution (new URL(href, pageUrl))
        ├── signature matching (hostname exact match / path-segment match)
        ├── confidence selection (best per technology)
        └── evidence generation (LinkEvidence)
        │
        ▼
    Detection[]
        │
        ▼
 CompositeDetector (with HeaderDetector, MetaTagDetector,
   ScriptUrlDetector, ContentScriptDetector, ResourceDetector,
   LinkDetector)
        │
        ▼
 DeduplicatingDetector (cross-detector dedup)
```

Le `LinkDetector` suit exactement le même pattern que `ResourceDetector`
pour l'agrégation interne :

1. Itère les signatures dans l'ordre du tableau `SIGNATURES`
2. Pour chaque signature, trouve le **premier** `<link>` dont l'URL
   résolue correspond
3. Groupe les matches par `technologyId`
4. Pour chaque groupe, sélectionne la **meilleure confidence** (les
   ties sont résolus par l'ordre du tableau) et fusionne les evidence
   en supprimant les doublons exacts (via `JSON.stringify`)
5. Produit un `Detection` par technologie via `createDetection`

## 3. Observation HTML

Les `<link>` tags **n'étaient pas encore observés** de manière
comprehensive par le crawler. Le crawler ne conservait que
`stylesheetLinks` (href des `<link rel="stylesheet">`) et
`manifestLink` (href du premier `<link rel="manifest">`).

Pour Step 6J, l'observation a été étendue pour capturer **tous** les
balises `<link>` :

### Modèle `LinkTag` (`packages/core/src/domain/snapshot.ts`)

```typescript
export interface LinkTag {
  readonly rel: string | null;
  readonly href: string | null;
  readonly content: string;
}
```

- `rel` : valeur de l'attribut `rel` (ou `null` si absent)
- `href` : valeur de l'attribut `href` (ou `null` si absent)
- `content` : texte brut complet de la balise `<link ...>` (pour le
  contexte et le débogage)

Le champ a été ajouté à `HtmlObservation` :

```typescript
export interface HtmlObservation {
  readonly title: string;
  readonly description: string | null;
  readonly metaTags: ReadonlyArray<MetaTag>;
  readonly scripts: ReadonlyArray<ScriptTag>;
  readonly links: ReadonlyArray<LinkTag>; // ← Step 6J
}
```

### Extraction (`packages/crawler/src/html-parser.ts`)

Une fonction `extractLinkTags(html: string): LinkTag[]` a été ajoutée
au `HtmlExtract` et appelée par `extractHtml()`. La fonction utilise
le même regex `<link\b([^>]*)>` que `extractStylesheetLinks` et
`extractManifestLink` (qui ont été conservés tels quels — ils filtrent
par `rel`).

Le crawler `HttpCrawler.crawl()` propage maintenant `linkTags` depuis
`extractHtml()` vers `HtmlObservation.links` dans le `SiteSnapshot`.

## 4. LinkDetector

Fichier : `packages/detectors/src/link-detector.ts`

```typescript
export class LinkDetector implements Detector {
  detect(snapshot: SiteSnapshot): Detection[];
}
```

Le detector lit `snapshot.html.links` — un tableau de `LinkTag` — et
applique les signatures URL de manière structurée. Il n'effectue aucune
requête réseau, ne réanalyse pas le HTML, et ne consulte pas la base de
données.

## 5. Signatures

| Match kind     | Match value            | Technology   | Category    | Confidence |
| -------------- | ---------------------- | ------------ | ----------- | ---------- |
| `path_segment` | `wp-content`           | WordPress    | `cms`       | 90         |
| `path_segment` | `wp-includes`          | WordPress    | `cms`       | 90         |
| `path_segment` | `wp-json`              | WordPress    | `cms`       | 90         |
| `hostname`     | `cdn.shopify.com`      | Shopify      | `ecommerce` | 95         |
| `hostname`     | `shopifycdn.com`       | Shopify      | `ecommerce` | 95         |
| `hostname`     | `fonts.googleapis.com` | Google Fonts | `fonts`     | 90         |

Les signatures WordPress utilisent `matchKind: 'path_segment'`. Les
signatures Shopify et Google Fonts utilisent `matchKind: 'hostname'`.

Les noms de technologie suivent les conventions établies :

- `wordpress` → WordPress (cms)
- `shopify` → Shopify (ecommerce)
- `google-fonts` → Google Fonts (fonts)

## 6. URL matching (structuré, pas `String.includes`)

### Hostname matching (Shopify, Google Fonts)

```typescript
function matchesHostname(href: string, expected: string): boolean {
  try {
    const parsed = new URL(href);
    return parsed.hostname === expected; // exact equality
  } catch {
    return false;
  }
}
```

Utilise `new URL(href).hostname` et compare avec `===`. Cela garantit :

- `https://cdn.shopify.com/...` → hostname `cdn.shopify.com` → **Shopify ✓**
- `https://shopifycdn.com.example.com/...` → hostname
  `shopifycdn.com.example.com` ≠ `shopifycdn.com` → **pas Shopify ✓**
- `https://cdn.shopify.com.example.com/...` → hostname
  `cdn.shopify.com.example.com` ≠ `cdn.shopify.com` → **pas Shopify ✓**
- `https://fonts.googleapis.com.example.com/...` → hostname
  `fonts.googleapis.com.example.com` ≠ `fonts.googleapis.com` → **pas Google Fonts ✓**

### Path-segment matching (WordPress)

```typescript
function matchesPathSegment(href: string, segment: string): boolean {
  try {
    const parsed = new URL(href);
    const segments = parsed.pathname.split('/');
    return segments.includes(segment); // exact segment match
  } catch {
    return false;
  }
}
```

Découpe le `pathname` en segments délimités par `/` et cherche une
correspondance **exacte** :

- `https://example.com/wp-content/...` → segments `['', 'wp-content', ...]`
  → contient `wp-content` → **WordPress ✓**
- `https://example.com/my-wp-content/` → segments
  `['', 'my-wp-content', '']` → ne contient pas `wp-content` → **pas WordPress ✓**
- `https://example.com/wp-content-like/` → segments
  `['', 'wp-content-like', '']` → ne contient pas `wp-content` → **pas WordPress ✓**
- `https://example.com/wp/` → segments `['', 'wp', '']` → ne contient
  pas `wp-content` → **pas WordPress ✓**

### Résolution des URLs relatives

Chaque `href` est résolu contre `snapshot.url` via
`new URL(link.href, snapshot.url)` avant le matching. Cela permet de
gérer correctement :

- URLs absolues (`https://cdn.shopify.com/...`)
- URLs protocole-relatives (`//cdn.shopify.com/...`)
- URLs racine-relatives (`/wp-content/style.css`)
- URLs relatives (`wp-content/style.css`)

## 7. Evidence

Un nouveau type d'evidence `LinkEvidence` a été ajouté à
`packages/core/src/domain/evidence.ts` :

```typescript
export interface LinkEvidence {
  readonly type: 'link';
  readonly url: Url;
}
```

Il a été ajouté à l'union `Evidence`. L'`url` est la version résolue de
l'`href` du `<link>` (via `createUrl()`).

Exemple d'evidence produit :

```typescript
{
  type: 'link',
  url: 'https://example.com/wp-content/themes/style.css',
}
```

## 8. Confidence / merge

Le `LinkDetector` suit exactement le pattern de `ResourceDetector` :

- **Meilleure confidence conservée** : si plusieurs signatures
  détectent la même technologie, la confidence la plus élevée l'est
  conservée. En cas d'égalité, la première signature dans l'ordre du
  tableau l'est.
- **Fusion déterministe des evidence** : toutes les evidence des
  signatures correspondantes sont fusionnées dans l'ordre du tableau.
- **Suppression des doublons exacts** : les evidence identiques (via
  `JSON.stringify`) sont supprimées. Par exemple, si une seule URL
  correspond à la fois à `wp-content` et `wp-includes`, un seul
  `LinkEvidence` est conservé.
- **Cross-detector deduplication** : gérée par `DeduplicatingDetector`
  (non modifié).

## 9. Tests

### `link-detector.test.ts` — 41 tests

| Catégorie              | Nombre | Description                                                                                                                                                                                                                            |
| ---------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WordPress positives    |      6 | `/wp-content/`, `/wp-includes/`, `/wp-json/`, URL relative, premier segment, segment intermédiaire                                                                                                                                     |
| Shopify positives      |      3 | `cdn.shopify.com`, `shopifycdn.com`, URL protocole-relative                                                                                                                                                                            |
| Google Fonts positives |      1 | `fonts.googleapis.com`                                                                                                                                                                                                                 |
| Faux positifs          |     12 | `my-wp-content`, `wp-content-like`, `wp`, `shopify` (sans `.com`), `shopifycdn.com.example.com`, `myshopify.com`, `cdn.shopify.com.example.com`, `fonts.googleapis.com.example.com`, `wp-content` en query string, `shopify` dans path |
| Confidence & merge     |      5 | Une detection par tech, ties, dédup, multi-tech, multi-CDN                                                                                                                                                                             |
| Edge cases             |     14 | href null, href vide, href espace, rel null, rel inconnu, rel multiple tokens, URL relative sans slash, URL protocole-relative, URL malformée, doublons, empty links, invalid URLs                                                     |

### `evidence.test.ts` — 2 tests ajoutés

- `creates LinkEvidence` — vérifie la création et la discrimation
- `supports LinkEvidence in the discriminated union` — vérifie le
  narrowing via `type`

### `html-parser.test.ts` — 12 tests ajoutés

Bloc `describe('link tag extraction (Step 6J)')` couvrant :

- Extraction d'un seul `<link>` avec `rel` et `href`
- Extraction de plusieurs `<link>` dans l'ordre du document
- `rel = null`, `href = null`, pas d'attributs
- Case-insensitivity, guillemets simples/et non quotés
- Attributs supplémentaires (`media`, `sizes`, `as`)
- `rel` à valeurs multiples (`preload stylesheet`)
- Doublons préservés, empty links, contenu vide
- Extraction conjointe avec d'autres éléments HTML

Total des tests : **431 passés, 9 skipped** (les 9 skips sont les tests
PostgreSQL et d'intégration qui nécessitent une base de données).

## 10. Intégration

### `@devlens/detectors` — `index.ts`

`LinkDetector` a été exporté :

```typescript
export { LinkDetector } from './link-detector.js';
```

### Web API — `apps/web/src/app/api/scans/route.ts`

`LinkDetector` a été ajouté au `CompositeDetector` dans
`createDependencies()` :

```typescript
new CompositeDetector([
  new HeaderDetector(),
  new MetaTagDetector(),
  new ScriptUrlDetector(),
  new ContentScriptDetector(),
  new ResourceDetector(),
  new LinkDetector(),           // ← Step 6J
]),
```

### Worker — `apps/worker/src/main.ts`

`LinkDetector` a été ajouté au `CompositeDetector` dans `main()` :

```typescript
new CompositeDetector([
  new HeaderDetector(),
  new MetaTagDetector(),
  new ScriptUrlDetector(),
  new ContentScriptDetector(),
  new ResourceDetector(),
  new LinkDetector(),           // ← Step 6J
]),
```

L'ordre d'exécution respecte l'ordre existant : `LinkDetector` est
placé après `ResourceDetector` (le plus proche en terme d'observation du
snapshot HTML). `DeduplicatingDetector` reste inchangé.

## 11. Validation

Toutes les commandes suivantes passent sur le workspace complet :

```bash
pnpm typecheck       ✅ 10 projects, 0 errors
pnpm test            ✅ 431 passed, 9 skipped
pnpm lint            ✅ 0 errors (ESLint + Prettier)
pnpm build           ✅ all 10 packages + 2 apps
npx madge --circular  ✅ 81 files, 0 cycles
```

## 12. Fichiers créés

| Fichier                                        | Description                                                 |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `packages/detectors/src/link-detector.ts`      | `LinkDetector` class + signature table + matching functions |
| `packages/detectors/src/link-detector.test.ts` | 41 tests (positifs, négatifs, faux positifs, edge cases)    |
| `docs/Step6J-report.md`                        | Ce rapport                                                  |

## 13. Fichiers modifiés

### Domaine (`@devlens/core`)

| Fichier                                     | Modification                                                        |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `packages/core/src/domain/snapshot.ts`      | Ajout de l'interface `LinkTag` + champ `links` à `HtmlObservation`  |
| `packages/core/src/domain/evidence.ts`      | Ajout de `LinkEvidence` à l'union `Evidence`                        |
| `packages/core/src/domain/evidence.test.ts` | +2 tests pour `LinkEvidence`                                        |
| `packages/core/src/domain/snapshot.test.ts` | Ajout de `links: []` aux constructions `HtmlObservation` + Prettier |

### Crawler (`@devlens/crawler`)

| Fichier                                    | Modification                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `packages/crawler/src/html-parser.ts`      | Ajout de `extractLinkTags()` + `linkTags` à `HtmlExtract` + mise à jour de `extractHtml()` |
| `packages/crawler/src/html-parser.test.ts` | +12 tests pour l'extraction de `<link>` tags                                               |
| `packages/crawler/src/http-crawler.ts`     | Propagation de `linkTags` vers `HtmlObservation.links`                                     |

### Détecteurs (`@devlens/detectors`)

| Fichier                                                  | Modification                             |
| -------------------------------------------------------- | ---------------------------------------- |
| `packages/detectors/src/index.ts`                        | Export de `LinkDetector`                 |
| `packages/detectors/src/resource-detector.test.ts`       | Ajout de `links: []` au `makeSnapshot()` |
| `packages/detectors/src/script-url-detector.test.ts`     | Ajout de `links: []` au `makeSnapshot()` |
| `packages/detectors/src/content-script-detector.test.ts` | Ajout de `links: []` au `makeSnapshot()` |
| `packages/detectors/src/header-detector.test.ts`         | Ajout de `links: []` au `makeSnapshot()` |
| `packages/detectors/src/composite-detector.test.ts`      | Ajout de `links: []` au `makeSnapshot()` |
| `packages/detectors/src/deduplicating-detector.test.ts`  | Ajout de `links: []` au `makeSnapshot()` |
| `packages/detectors/src/meta-tag-detector.test.ts`       | Ajout de `links: []` au `makeSnapshot()` |

### Application + apps

| Fichier                                             | Modification                                            |
| --------------------------------------------------- | ------------------------------------------------------- |
| `apps/web/src/app/api/scans/route.ts`               | Ajout de `LinkDetector` au `CompositeDetector` + import |
| `apps/web/src/app/api/scans/route.test.ts`          | Ajout de `links: []` au `makeSnapshot()`                |
| `apps/worker/src/main.ts`                           | Ajout de `LinkDetector` au `CompositeDetector` + import |
| `apps/worker/src/main.test.ts`                      | Ajout de `links: []` au `makeSnapshot()`                |
| `packages/application/src/execute-scan.test.ts`     | Ajout de `links: []` au `makeSnapshot()`                |
| `packages/application/src/orchestrator.test.ts`     | Ajout de `links: []` au `makeSnapshot()`                |
| `packages/application/src/repository.test.ts`       | Ajout de `links: []` au `makeSnapshot()`                |
| `packages/crawler/src/crawler.test.ts`              | Ajout de `links: []` au `makeSnapshot()`                |
| `packages/database/src/repository.test.ts`          | Ajout de `links: []` au `makeSnapshot()`                |
| `packages/database/src/postgres-repository.test.ts` | Ajout de `links: []` au `makeSnapshot()`                |

### Documentation

| Fichier                          | Modification                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/detectors.md` | Ajout de la section `LinkDetector` (signatures, matching, evidence, limitations) + mise à jour de la section "File Structure" + "Production wiring" |
| `docs/architecture/overview.md`  | Mise à jour "nine exports" + liste détaillée de `LinkDetector` + mise à jour de la section "Worker boundary"                                        |
| `docs/architecture/crawler.md`   | Ajout de la section "HTML extraction" décrivant l'extraction de `<link>` tags                                                                       |
| `docs/Step6J.md`                 | Formatage Prettier                                                                                                                                  |

## 14. Limites connues

- **Signature set restreint** : seulement 6 signatures sur 3 technologies
  (WordPress, Shopify, Google Fonts). L'extension à d'autres technologies
  est prévue mais délibérément non inclus dans cette étape.
- **Hostname exact uniquement** : le matching de hostname est une
  comparaison exacte. `cdn.shopify.com` matche, mais un sous-domaine comme
  `assets.cdn.shopify.com` ne matche pas. C'est une décision
  délibérée (conservatisme) pour éviter les faux positifs.
- **Path-segment uniquement** : le matching WordPress vérifie les segments
  de chemin (`wp-content`), mais une URL comme
  `https://shopify.com/wp-content-assets/` ne détectera pas WordPress car
  `wp-content-assets` n'est pas le segment `wp-content`.
- **Pas de résolution DNS** : le detector ne résout pas les domaines. Un
  hostname matchant `shopifycdn.com` matche même si le domaine n'est pas
  réellement propriété de Shopify.
- **Pas de détection basée sur `rel`** : le `rel` est stocké mais jamais
  utilisé pour le matching. Une balise `<link rel="preconnect"
href="https://cdn.shopify.com">` sera détectée comme Shopify.
- **URL relative** : les URLs relatives sont résolues contre
  `snapshot.url`. Si `snapshot.url` est mal formée, la résolution peut
  échouer — mais cela ne provoque pas d'erreur (le `<link>` est ignoré).
- **`content` field du `LinkTag`** : contient le texte brut de la balise
  `<link ...>`. Ce n'est pas utilisé pour le matching, mais conservé pour
  le débogage et une future extension.

## 15. Prochaine étape recommandée

**Step 6K** — Intégration des tests E2E et de la validation du pipeline
complet. Les prochaines priorités seraient :

1. **Étendre le jeu de signatures** : ajouter des signatures pour
   d'autres plateformes e-commerce (BigCommerce, Squarespace, Wix),
   ainsi que pour les CDNs de fonts (Cloudflare, jsDelivr) et frameworks
   (React, Vue, Angular) identifiables via leurs CDN.
2. **Tests d'intégration E2E** : créer un test Playwright qui crawl une
   page réelle contenant des `<link>` Shopify/WordPress et vérifie que
   les détections apparaissent correctement dans le `ScanResult`.
3. **Pipeline `analyzer`** : connecter le `LinkDetector` au pipeline
   d'analyse (`@devlens/analyzer`) pour l'agrégation de résultats de
   scan.
4. **Tests de performance** : mesurer le temps de détection sur des
   snapshots avec un grand nombre de `<link>` tags (page de test
   synthétique).
