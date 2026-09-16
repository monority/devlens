# Detector Architecture

## Overview

The `@devlens/detectors` package defines the **Detector boundary** —
the contract between the `SiteSnapshot` produced by the crawler and the
`Detection` objects that describe which technologies were found.

```text
SiteSnapshot
    ↓
Detector.detect(snapshot) → Detection[]
    ↓
ScanResult { scan, snapshot, detections }
```

The application layer (`@devlens/application`) calls `detector.detect(snapshot)`
after a successful crawl. The `Detector` implementation is injected, making
the pipeline fully testable without real detection logic.

## Contracts

### `Detector` interface

```typescript
interface Detector {
  detect(snapshot: SiteSnapshot): Detection[];
}
```

- **Input**: an immutable `SiteSnapshot` (HTTP headers, HTML, resources).
- **Output**: an array of `Detection` objects (possibly empty).
- **Failure**: a throwing detector propagates to `runScan`, which
  translates it to a `ScanError` (code `'UNKNOWN_ERROR'`) and marks the
  scan as `failed`.

### `NullDetector`

A no-op `Detector` that always returns `[]`. Implements the Null Object
pattern — used as a safe default when no concrete detectors are configured.

### `CompositeDetector`

A `Detector` that runs an ordered collection of sub-detectors against the
same `SiteSnapshot` and aggregates their `Detection[]` results into a single
flat array. This is the standard composition entry point for production
wiring (web API and worker).

#### Ordering

Detections from the first sub-detector appear before detections from the
second, and so on. No re-sorting is performed.

#### Error policy

If any sub-detector throws, the `CompositeDetector` propagates the error
immediately — it does **not** catch and swallow failures, and it does not
continue executing remaining sub-detectors. This matches the existing
`runScan` convention: a `Detector` throwing causes the entire scan to fail
via `toScanError` → `ScanError{ code: 'UNKNOWN_ERROR' }`.

#### Deduplication

The `CompositeDetector` performs **no deduplication** across sub-detectors.
The domain model (`Detection`) does not define a unique identity field. Two
detections with the same `technology.id` but different evidence or
confidence are legitimately distinct and are both preserved. Individual
sub-detectors are responsible for their own internal deduplication (e.g.
`HeaderDetector` deduplicates by technology ID within itself).

## HeaderDetector

The first concrete `Detector` implementation. It inspects HTTP response
headers already present in `SiteSnapshot.http.headers` and matches them
against a table of known signatures.

### Supported signatures

| Header         | Value contains  | Technology | Category    | Confidence |
| -------------- | --------------- | ---------- | ----------- | ---------- |
| `Server`       | `nginx`         | nginx      | `server`    | 95         |
| `Server`       | `apache`        | Apache     | `server`    | 95         |
| `Server`       | `microsoft-iis` | IIS        | `server`    | 95         |
| `X-Powered-By` | `express`       | Express    | `framework` | 90         |
| `X-Powered-By` | `php`           | PHP        | `language`  | 90         |
| `Server`       | `cloudflare`    | Cloudflare | `cdn`       | 95         |

### Matching rules

- **Header name**: matched case-insensitively (`Server`, `server`,
  `SERVER` are equivalent).
- **Header value**: matched case-insensitively using substring matching
  (e.g. `nginx/1.21.6 (Ubuntu)` matches the `nginx` signature).
- **Deduplication**: if the same technology ID would be detected more
  than once, only one `Detection` is produced.
- **Empty/missing headers**: produces no errors — simply returns `[]` or
  skips the signature.

### Evidence

Each detection includes exactly one `HttpHeaderEvidence` item referencing
the actual header name and value that triggered the match:

```typescript
{
  type: 'http_header',
  name: 'Server',      // the original header name as received
  value: 'nginx/1.21.6', // the original header value as received
}
```

### Limitations / false-positive considerations

- **Signature-based, not semantic**: `HeaderDetector` matches substrings
  in header values. It does **not** parse structured header values or
  claim that every infrastructure header represents an application
  technology. For example, a `Server: some-unknown-server/1.0` header
  produces no detection.
- **Substring matching**: a header value containing `php` as a substring
  of a longer word (e.g. `X-Powered-By: SomePHPFramework`) would trigger
  a PHP detection. This is acceptable for the `X-Powered-By` header but
  could produce false positives in other contexts.
- **Spoofable headers**: both `Server` and `X-Powered-By` can be set or
  removed by the application operator. They are infrastructure hints,
  not guarantees.
- **No version parsing**: the detector records the raw header value as
  evidence but does not extract version information for matching.

## MetaTagDetector

The second concrete `Detector` implementation. It inspects `<meta>` tags
already extracted into `SiteSnapshot.html.metaTags` and matches them
against a table of known CMS/builder signatures.

The crawler's `extractHtml()` function extracts all `<meta name="..."`
` content="...">` tags from the HTML response body during crawling.
These are stored as `{ name: string, content: string }` pairs in
`HtmlObservation.metaTags`.

### Supported signatures

| Meta tag name | Content contains | Technology | Category    | Confidence |
| ------------- | ---------------- | ---------- | ----------- | ---------- |
| `generator`   | `WordPress`      | WordPress  | `cms`       | 90         |
| `generator`   | `Hugo`           | Hugo       | `cms`       | 85         |
| `generator`   | `Jekyll`         | Jekyll     | `cms`       | 85         |
| `generator`   | `Ghost`          | Ghost      | `cms`       | 85         |
| `generator`   | `Next.js`        | Next.js    | `framework` | 85         |
| `generator`   | `Gatsby`         | Gatsby     | `framework` | 85         |
| `generator`   | `Nuxt.js`        | Nuxt.js    | `framework` | 85         |
| `generator`   | `PrestaShop`     | PrestaShop | `cms`       | 90         |

### Matching rules

- **Meta tag name**: matched case-insensitively (`generator`,
  `GENERATOR`, `Generator` are equivalent).
- **Meta tag content**: matched case-insensitively using substring matching
  (e.g. `WordPress 6.4.2` matches the `WordPress` signature).
- **Deduplication**: if the same technology ID would be detected more
  than once (e.g. two `<meta name="generator">` tags both mention
  WordPress), only one `Detection` is produced.
- **Empty/missing meta tags**: produces no errors — simply returns `[]`
  or skips the signature.

### Evidence

Each detection includes exactly one `MetaTagEvidence` item referencing
the actual meta tag name and content that triggered the match:

```typescript
{
  type: 'meta_tag',
  name: 'generator',          // the original meta tag name as found
  content: 'WordPress 6.4.2', // the original meta tag content as found
}
```

### Limitations

- **Signature-based**: only the `generator` meta tag is inspected for
  technology signatures. Other meta tags (e.g. `description`,
  `viewport`) are extracted but not matched against technology
  signatures.
- **Substring matching**: content matching uses case-insensitive substring
  matching. A content value containing `ghost` as a substring of a longer
  word could trigger a false positive (unlikely but possible).

## ScriptUrlDetector

The third concrete `Detector` implementation. It inspects `<script src="...">`
URLs already extracted into `SiteSnapshot.html.scripts` and matches them
against a table of known technology signatures.

The crawler's `extractHtml()` function extracts all `<script>` tags from the
HTML response body during crawling. Each script is stored as `{ src: string,
content: string }` — `src` is the `src` attribute value (or `null` for
inline scripts), and `content` is the text between the tags.
`ScriptUrlDetector` reads these already-captured URLs; it does not re-parse
HTML or make network requests.

### Supported signatures

| Script src contains | Technology          | Category    | Confidence |
| ------------------- | ------------------- | ----------- | ---------- |
| `wp-content`        | WordPress           | `cms`       | 90         |
| `wp-includes`       | WordPress           | `cms`       | 90         |
| `/_next/`           | Next.js             | `framework` | 90         |
| `/_nuxt/`           | Nuxt.js             | `framework` | 90         |
| `gatsby`            | Gatsby              | `framework` | 85         |
| `jquery`            | jQuery              | `library`   | 85         |
| `bootstrap.`        | Bootstrap           | `framework` | 80         |
| `lodash`            | Lodash              | `library`   | 80         |
| `woocommerce`       | WooCommerce         | `ecommerce` | 85         |
| `google-analytics`  | Google Analytics    | `analytics` | 85         |
| `plausible.io`      | Plausible Analytics | `analytics` | 90         |

### Matching rules

- **Script src URL**: matched case-insensitively using substring matching
  (e.g. `https://example.com/_next/static/chunks/main-abc123.js` matches the
  `/_next/` signature).
- **Inline scripts**: scripts without a `src` attribute (or with an empty
  `src`) are ignored — they are not suitable for URL-fingerprint-based
  detection.
- **Deduplication**: if the same technology ID would be detected more than
  once (e.g. both `wp-content` and `wp-includes` match WordPress), only one
  `Detection` is produced. The first matching signature (in table order)
  supplies the evidence.
- **Empty/missing scripts**: produces no errors — simply returns `[]` or skips
  the signature.
- **No-throw**: never throws for missing, empty, or malformed script data.

### Evidence

Each detection includes exactly one `ScriptUrlEvidence` item referencing the
actual script URL that triggered the match:

```typescript
{
  type: 'script_url',
  url: 'https://example.com/_next/static/chunks/main-abc123.js',
}
```

### False-positive limitations

- **URL substring matching is conservative by design**: only well-known
  platform/framework paths (e.g. `/_next/`, `wp-content`) or vendor bundle
  names (e.g. `jquery`, `lodash`) are matched. Generic bundle URLs like
  `bundle.12345.js` produce no detection.
- **No framework inference from React/Vue runtime bundles**: the detector
  does NOT claim that a generic JavaScript bundle means React or Vue. Only
  signatures with strong URL patterns are included.
- **Vendor CDN paths**: `bootstrap` and `lodash` match on CDN paths (e.g.
  `cdn.jsdelivr.net/npm/bootstrap@...`). This is intentionally permissive
  for well-known libraries but could match a non-production URL that
  happens to contain the substring.

## ContentScriptDetector

The fourth concrete `Detector` implementation. It inspects inline
JavaScript script _content_ already extracted into
`SiteSnapshot.html.scripts` and matches it against a table of known
technology fingerprints.

The crawler's `extractHtml()` function captures all `<script>` tags
during crawling. Each script is stored as `{ src: string | null,
content: string }` — `src` is `null` for inline scripts, and `content`
is the text between the opening and closing `<script>` tags.
`ContentScriptDetector` reads these already-captured scripts; it does
not re-parse HTML, fetch resources, or execute JavaScript.

### Supported signatures

| Script content contains  | Technology | Category    | Confidence |
| ------------------------ | ---------- | ----------- | ---------- |
| `__NEXT_DATA__`          | Next.js    | `framework` | 95         |
| `next/router`            | Next.js    | `framework` | 90         |
| `next/navigation`        | Next.js    | `framework` | 90         |
| `react-dom`              | React      | `framework` | 90         |
| `ReactDOM`               | React      | `framework` | 90         |
| `Vue.createApp`          | Vue.js     | `framework` | 95         |
| `@angular/core`          | Angular    | `framework` | 95         |
| `platformBrowserDynamic` | Angular    | `framework` | 90         |
| `__SVELTE__`             | Svelte     | `framework` | 95         |
| `SvelteComponent`        | Svelte     | `framework` | 90         |
| `astro-island`           | Astro      | `framework` | 95         |

### Matching rules

- **Inline scripts only**: scripts with a non-null `src` (external URLs)
  are ignored entirely. Only inline `<script>` content (`src === null`)
  is inspected.
- **Case-insensitive content matching**: substring matching is
  case-insensitive (e.g. `react-dom` matches `ReactDOM` in content).
- **Deduplication**: if the same technology ID would be detected more
  than once (e.g. both `__SVELTE__` and `SvelteComponent` match Svelte),
  only one `Detection` is produced. The strongest/highest-confidence
  signature supplies the evidence.
- **Empty/inline scripts without content**: scripts with empty or
  whitespace-only content produce no match — they are skipped.
- **No-throw**: never throws for missing, empty, or malformed script
  data.

### Evidence

Each detection includes exactly one `ScriptContentEvidence` item
containing only the matched fingerprint snippet (never the full script
source):

```typescript
{
  type: 'script_content',
  snippet: '__NEXT_DATA__',
}
```

### False-positive limitations

- **Structural fingerprints only**: generic words like `vue`, `react`,
  or `createApp(` do NOT trigger detections on their own. Only
  well-known, structural markers (e.g. `Vue.createApp`, `react-dom`,
  `@angular/core`) are matched.
- **Substring matching caveat**: a minified bundle that happens to
  contain `__NEXT_DATA__` or `react-dom` as a substring would trigger a
  detection. This is acceptable for these highly specific markers but
  acknowledged as a limitation of substring-based matching.
- **No framework inference from arbitrary variable names**:
  `const framework = "vue"` does NOT trigger Vue. `const text = "react"`
  does NOT trigger React.

## ResourceDetector

The fifth concrete `Detector` implementation. It inspects the bodies of
resources already observed by the crawler (Step 6H) in
`SiteSnapshot.resources` — `robots.txt`, `manifest.json`, and same-origin
CSS files — and matches them against a table of known technology
signatures.

`ResourceDetector` reads `Resource.content` and `Resource.type` fields
that the crawler captured during observation. It does **not** re-fetch
resources, re-parse HTML, execute JavaScript, or make any network
requests.

### Supported signatures

| Resource type | Content contains | Technology | Category         | Confidence |
| ------------- | ---------------- | ---------- | ---------------- | ---------- |
| `robots`      | `wp-admin`       | WordPress  | `cms`            | 90         |
| `robots`      | `wp-includes`    | WordPress  | `cms`            | 90         |
| `manifest`    | `gcm_sender_id`  | Firebase   | `service_worker` | 95         |
| `css`         | `--wp--preset--` | WordPress  | `cms`            | 95         |
| `css`         | `wp-block-`      | WordPress  | `cms`            | 90         |

### Matching rules

- **Resource type**: signatures match **only** on resources whose
  `type` field matches the signature's expected type. For example, the
  `wp-admin` signature (type `robots`) never matches a `css` or
  `manifest` resource.
- **Content**: matched case-insensitively using substring matching
  against `Resource.content` (the raw body text fetched by the crawler).
- **One detection per technology**: when multiple signatures match the
  same technology, the detector preserves the **highest confidence** and
  merges evidence from all matching signatures deterministically (in
  signature-table order). On confidence ties, the first signature in
  table order is selected as the representative.
- **Empty/missing resources**: produces no errors — simply returns `[]``.
- **No-throw**: never throws for missing, empty, or malformed resource
  data.

### Evidence

Each detection includes one or more `ResourceEvidence` items referencing
the actual resource URL that triggered the match:

```typescript
{
  type: 'resource',
  url: 'https://example.com/robots.txt',
}
```

When multiple signatures for the same technology match, evidence from
all matching signatures is merged. Exact-duplicate evidence items
(same `type` + `url`) are removed within the detector.

### False-positive considerations

- **CSS is conservative**: only highly specific WordPress block-editor
  patterns are matched (`--wp--preset--`, `wp-block-`). Generic CSS
  substrings like `wp`, `WordPress`, or `wp-content` in a URL path do
  **not** trigger detection.
- **Type-scoped matching**: a `wp-admin` fingerprint found in CSS
  content (e.g. a comment or class name) does **not** trigger a WordPress
  detection — the `wp-admin` signature only matches `robots`-type
  resources.
- **Manifest specificity**: `gcm_sender_id` is an exact, well-known
  Firebase manifest key. A bare `gcm` substring does not match.

### Internal deduplication vs. cross-detector deduplication

`ResourceDetector` performs **internal** deduplication: one `Detection`
per technology, with best-confidence and evidence-merge semantics.
**Cross-detector** deduplication (e.g. WordPress also detected by
`MetaTagDetector` from a `<meta name="generator">` tag) is handled by
`DeduplicatingDetector` at the application boundary.

- Perform network requests (works on already-captured `SiteSnapshot`)
- Access the database
- Depend on Next.js or any web framework
- Infer arbitrary technologies from arbitrary meta tag values other
  than the `generator` meta tag

## LinkDetector

The sixth concrete `Detector` implementation. It inspects `<link>` tags
already extracted into `SiteSnapshot.html.links` and matches their
resolved `href` URLs against a table of known technology signatures using
**structured URL analysis** — exact hostname comparison for CDN domains,
and path-segment matching for path-based signatures.

The crawler's `extractHtml()` function (extended in Step 6J) extracts all
`<link>` tags from the HTML response body during crawling. Each link tag is
stored as `{ rel: string | null, href: string | null, content: string }`.
`LinkDetector` reads these already-captured link tags; it does **not**
re-parse HTML, fetch resources, or make any network requests.

### Supported signatures

| Match kind     | Match value            | Technology   | Category    | Confidence |
| -------------- | ---------------------- | ------------ | ----------- | ---------- |
| `path_segment` | `wp-content`           | WordPress    | `cms`       | 90         |
| `path_segment` | `wp-includes`          | WordPress    | `cms`       | 90         |
| `path_segment` | `wp-json`              | WordPress    | `cms`       | 90         |
| `hostname`     | `cdn.shopify.com`      | Shopify      | `ecommerce` | 95         |
| `hostname`     | `shopifycdn.com`       | Shopify      | `ecommerce` | 95         |
| `hostname`     | `fonts.googleapis.com` | Google Fonts | `fonts`     | 90         |

### Matching rules

- **URL resolution**: each `<link>` `href` is resolved against the page
  URL (`snapshot.url`) using `new URL(href, pageUrl)` before matching.
  This ensures relative URLs (e.g. `/wp-content/style.css`) are matched
  against the full path, and protocol-relative URLs (e.g.
  `//cdn.shopify.com/...`) resolve to the correct origin.
- **Hostname matching** (`path_segment` signatures like `wp-content`):
  the resolved URL's pathname is split into path segments by `/`. The
  signature is considered a match only when a path segment **exactly**
  equals the signature value. So `/wp-content/` matches but
  `/my-wp-content/` does **not** (the segment is `my-wp-content`, not
  `wp-content`).
- **Hostname matching** (Shopify, Google Fonts): the resolved URL's
  hostname is compared using **exact** equality (not substring matching).
  So `cdn.shopify.com` matches but `cdn.shopify.com.example.com` and
  `shopifycdn.com.example.com` do **not**.
- **No `rel`-based matching**: the `rel` attribute is stored on
  `LinkTag` for context but is never used as a signature criterion.
  Detection is based exclusively on the resolved URL.
- **Skip null/empty href**: `<link>` tags with `null` or empty `href`
  are silently ignored.
- **One detection per technology**: when multiple signatures match the
  same technology, the detector preserves the **highest confidence** and
  merges evidence from all matching signatures deterministically (in
  signature-table order). On confidence ties, the first signature in
  table order is selected as the representative.
- **Empty/missing links**: produces no errors — simply returns `[]`.
- **No-throw**: never throws for missing, empty, or malformed link data.

### Evidence

Each detection includes one or more `LinkEvidence` items referencing the
resolved URL that triggered the match:

```typescript
{
  type: 'link',
  url: 'https://example.com/wp-content/themes/style.css',
}
```

When multiple signatures for the same technology match, evidence from
all matching signatures is merged. Exact-duplicate evidence items
(same `type` + `url`) are removed within the detector.

### False-positive considerations

- **No substring matching**: `String.includes()` is never used for URL
  matching. WordPress uses path-segment matching; Shopify and Google
  Fonts use exact hostname matching. This prevents false positives like
  `shopifycdn.com.example.com` (a subdomain of `example.com`, not
  `shopifycdn.com`) or `my-wp-content` (not a `wp-content` path segment).
- **No DNS resolution**: the detector does not perform DNS lookups. A
  hostname match is purely a string comparison of the URL's hostname.
- **No network requests**: the detector does not fetch or resolve the
  linked resources. It only inspects the URL embedded in the `<link>`
  tag.
- **Conservative signature set**: only 6 signatures across 3 technologies
  are included initially. The set is intentionally small to maintain a
  high precision bar.

### Internal deduplication vs. cross-detector deduplication

`LinkDetector` performs **internal** deduplication: one `Detection` per
technology, with best-confidence and evidence-merge semantics.
**Cross-detector** deduplication (e.g. WordPress also detected by
`ScriptUrlDetector` from a `wp-content` script URL) is handled by
`DeduplicatingDetector` at the application boundary.

## DeduplicatingDetector

The fifth concrete `Detector` implementation — a **decorator** that wraps
another `Detector` and merges duplicate technology detections.

When multiple sub-detectors each produce a `Detection` for the same
technology (e.g. Next.js detected by `HeaderDetector`, `MetaTagDetector`,
`ScriptUrlDetector`, and `ContentScriptDetector`), the wrapped
`CompositeDetector` concatenates all results into a flat array — producing
multiple `Detection` objects for the same technology. `DeduplicatingDetector`
consolidates these into a single `Detection` per technology.

### Deduplication algorithm

1. **Group** detections by `technology.id`, preserving first-appearance order.
2. **Select representative**: the `Detection` with the highest confidence wins.
   On confidence ties, the **first** detection returned by the wrapped
   detector is selected (deterministic, no invented ranking).
3. **Merge evidence**: evidence from all detections in the group is collected
   in wrapped-detector order. Exact-duplicate evidence items (structurally
   identical via `getEvidenceKey` — a canonical, property-order-independent
   key) are removed, and the merged evidence is sorted by canonical key.
4. **No confidence aggregation**: the resulting confidence is simply the
   representative's value — NOT a sum, average, or weighted score.

### Why a wrapper, not a modification of CompositeDetector?

`CompositeDetector` is intentionally a pass-through aggregator with no
deduplication semantics. The `Detection` domain model does not define a
unique identity field. By keeping deduplication as a separate wrapper,
each component has a single responsibility and the pipeline is composable:

```text
CompositeDetector → [Header, MetaTag, ScriptUrl, ContentScript, Resource]
    → produces Detection[] (with duplicates)
DeduplicatingDetector(CompositeDetector(...))
    → produces deduplicated Detection[]
```

### What it is NOT

- **Not a scoring system**: no confidence aggregation, no weighted
  evidence, no ranking beyond selecting the highest-confidence detection.
- **Not a resolver of conflicting categories**: if duplicate detections
  for the same technology have different categories, the representative's
  category is preserved (a focused test documents this behavior).
- **Not a modifier of existing detectors**: `CompositeDetector`,
  `HeaderDetector`, `MetaTagDetector`, `ScriptUrlDetector`, and
  `ContentScriptDetector` are all unchanged.

## ScoringDetector + ConfidenceScorer

The `ScoringDetector` is a **decorator** that wraps a `Detector` (typically
`DeduplicatingDetector`) and applies a `ConfidenceScorer` to each
`Detection` in the result. This is the final pipeline stage — it produces
the `confidence` value that appears in `ScanResult.detections` and is
persisted to the database.

```text
CompositeDetector
    → DeduplicatingDetector   (one Detection per technology)
    → ScoringDetector         (final confidence = base + evidence-diversity bonus)
    → ScanResult { detections }
```

### The evidence-source concept

The `DetectionScorer` counts **unique evidence source types** — the
`Evidence['type']` discriminant (`http_header`, `meta_tag`, `script_url`,
`script_content`, `resource`, `link`, `html`, `javascript_global`).
Each unique type is treated as an independent observation modality.
Multiple evidence items of the **same type** (e.g. three `LinkEvidence`
items for `wp-content`, `wp-includes`, `wp-json`) are treated as dependent —
they do not independently boost the score.

### Scoring formula

```text
base   = detection.confidence    (best single per-signature confidence, 0–100)
n      = number of unique evidence source types (≥ 1)
bonus  = min(MAX_BONUS, max(0, n - 1) × PER_SOURCE_BONUS)
score  = min(100, round(base + bonus))
```

Default constants: `MAX_BONUS = 10`, `PER_SOURCE_BONUS = 5`.

| Base confidence | Sources | Bonus | Score |
| --------------- | ------- | ----- | ----- |
| 90              | 1       | 0     | 90    |
| 90              | 2       | 5     | 95    |
| 90              | 3       | 10    | 100   |
| 90              | 10+     | 10    | 100   |
| 85              | 2       | 5     | 90    |
| 95              | 1       | 0     | 95    |

### Properties

- **Monotone**: adding an independent source never decreases the score.
- **Bounded**: the score never exceeds 100 (enforced by `clampConfidence`).
- **No false summation**: only the best per-signature confidence is used
  as the base; the bonus is a small, capped augmentation (not a sum of
  per-signature confidences).
- **Weak evidence doesn't overwrite strong evidence**: the base is the
  maximum confidence, so a single 95 always scores ≥ a single 90.
- **Identical evidence doesn't multiply**: same-type evidence counts
  as one source.
- **Deterministic**: no randomness, no network, no external models.
- **Ranked output**: after scoring, detections are sorted by
  `confidence DESC`, then `technology.id ASC` (deterministic tie-break).

### What it is NOT

- **Not a replacement for detectors**: the pipeline remains
  `CompositeDetector → DeduplicatingDetector → ScoringDetector`.
- **Not a deduplication layer**: it does not create or remove detections.
  It receives already-deduplicated detections from `DeduplicatingDetector`.
- **Not a confidence aggregator**: it does not sum or average per-signature
  confidences. The base is the single best confidence.

## Technology Catalog

A centralized catalog of all technologies that DevLens can detect. This is
the **single source of truth** for technology metadata (`id`, `name`,
`category`). Before this catalog (Step 8), technology metadata was
duplicated across the signature tables of all six detectors — each table
repeated `technologyName` and `technologyCategory` alongside
`technologyId`, creating a risk of divergence.

The catalog is defined in `packages/detectors/src/technology-catalog.ts`:

- `TECHNOLOGY_CATALOG` — a `Record<string, Technology>` mapping catalog
  keys to canonical `Technology` objects.
- `TECHNOLOGY_IDS` — a `Set<string>` of all catalog keys.
- `TECHNOLOGY_CATEGORIES` — a `Set<string>` of all categories in use.
- `getTechnology(id: string): Technology` — a lookup function that throws
  if the ID is not in the catalog.

### Catalog contents

| ID                 | Name                | Category         |
| ------------------ | ------------------- | ---------------- |
| `nginx`            | nginx               | `server`         |
| `apache`           | Apache              | `server`         |
| `iis`              | IIS                 | `server`         |
| `php`              | PHP                 | `language`       |
| `wordpress`        | WordPress           | `cms`            |
| `drupal`           | Drupal              | `cms`            |
| `webflow`          | Webflow             | `cms`            |
| `hugo`             | Hugo                | `cms`            |
| `jekyll`           | Jekyll              | `cms`            |
| `ghost`            | Ghost               | `cms`            |
| `prestashop`       | PrestaShop          | `cms`            |
| `express`          | Express             | `framework`      |
| `laravel`          | Laravel             | `framework`      |
| `nextjs`           | Next.js             | `framework`      |
| `nuxtjs`           | Nuxt.js             | `framework`      |
| `gatsby`           | Gatsby              | `framework`      |
| `react`            | React               | `framework`      |
| `vue`              | Vue.js              | `framework`      |
| `angular`          | Angular             | `framework`      |
| `svelte`           | Svelte              | `framework`      |
| `astro`            | Astro               | `framework`      |
| `bootstrap`        | Bootstrap           | `framework`      |
| `jquery`           | jQuery              | `library`        |
| `lodash`           | Lodash              | `library`        |
| `tailwind`         | Tailwind CSS        | `library`        |
| `firebase`         | Firebase            | `service_worker` |
| `shopify`          | Shopify             | `ecommerce`      |
| `woocommerce`      | WooCommerce         | `ecommerce`      |
| `google-fonts`     | Google Fonts        | `fonts`          |
| `google-analytics` | Google Analytics    | `analytics`      |
| `plausible`        | Plausible Analytics | `analytics`      |
| `cloudflare`       | Cloudflare          | `cdn`            |

### Categories in use

| Category         | Technologies                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `server`         | nginx, Apache, IIS                                                                           |
| `language`       | PHP                                                                                          |
| `cms`            | WordPress, Drupal, Webflow, Hugo, Jekyll, Ghost, PrestaShop                                  |
| `framework`      | Express, Laravel, Next.js, Nuxt.js, Gatsby, React, Vue.js, Angular, Svelte, Astro, Bootstrap |
| `library`        | jQuery, Lodash, Tailwind CSS                                                                 |
| `service_worker` | Firebase                                                                                     |
| `ecommerce`      | Shopify, WooCommerce                                                                         |
| `fonts`          | Google Fonts                                                                                 |
| `analytics`      | Google Analytics, Plausible Analytics                                                        |
| `cdn`            | Cloudflare                                                                                   |

### How detectors reference the catalog

Each detector's signature table keeps only `technologyId` (the catalog
key) and `confidence` — the `technologyName` and `technologyCategory`
fields were removed. At detection time, the detector calls
`getTechnology(sig.technologyId)` to retrieve the canonical
`Technology` object from the catalog.

```typescript
// Before (Step 7 and earlier — duplicated metadata):
const technology: Technology = {
  id: createTechnologyId(sig.technologyId),
  name: sig.technologyName, // ← duplicated across 6 files
  category: createTechnologyCategory(sig.technologyCategory),
};

// After (Step 8 — catalog as single source of truth):
const technology = getTechnology(sig.technologyId);
```

### Audit findings

The Step 8 audit confirmed:

- **No inconsistent IDs**: every technology uses the same ID across all
  detectors (e.g. `nextjs` in MetaTagDetector, ScriptUrlDetector, and
  ContentScriptDetector).
- **No inconsistent names**: every technology has the same display name
  everywhere (e.g. `Next.js` everywhere it appears).
- **No inconsistent categories**: every technology has the same category
  everywhere.
- **No documented-but-undetectable technologies**: all 32 catalog entries
  have at least one active signature.
- **No detectable-but-undocumented technologies**: every technology
  produced by a detector is in the catalog.

### Step 11 — New technologies added

| Technology          | Category    | Detector              | Primary fingerprint              |
| ------------------- | ----------- | --------------------- | -------------------------------- |
| Drupal              | `cms`       | ContentScriptDetector | `drupalSettings` in inline JS    |
| Laravel             | `framework` | ContentScriptDetector | `window.Laravel` in inline JS    |
| Webflow             | `cms`       | ContentScriptDetector | `Webflow.` in inline JS          |
| Tailwind CSS        | `library`   | ResourceDetector      | `@tailwind` in CSS content       |
| WooCommerce         | `ecommerce` | ScriptUrlDetector     | `woocommerce` in script URL      |
| Google Analytics    | `analytics` | ScriptUrlDetector     | `google-analytics` in script URL |
| Cloudflare          | `cdn`       | HeaderDetector        | `Server: cloudflare`             |
| PrestaShop          | `cms`       | MetaTagDetector       | `generator` meta: `PrestaShop`   |
| Plausible Analytics | `analytics` | ScriptUrlDetector     | `plausible.io` in script URL     |

### Step 20 — Adversarial testing & signature hardening

Two signatures were audited and hardened:

- **`createRoot(` (ContentScriptDetector)**: Removed. `createRoot()` is a generic DOM API call used by
  many frameworks and vanilla JS. The `adv-createRoot-vanilla` fixture demonstrated a false positive
  on non-React code. React is still reliably detected via `react-dom` (conf 90) and `ReactDOM` (conf 90).
- **`bootstrap` → `bootstrap.` (ScriptUrlDetector)**: Changed to require a dot after "bootstrap",
  excluding `bootstrap-icons` (a separate package). The `adv-bootstrap-icons` fixture demonstrated
  a false positive on `bootstrap-icons.min.js`.

### Confidence vs. final score

The `Detection.confidence` field always holds the **final scored
confidence** — the result of `ConfidenceScorer.score()` applied after
deduplication. There is no separate `score` field. This decision (from
Step 7) is confirmed consistent: the scoring layer transforms
`confidence` in place, and the API/persistence layers read the final
value directly.

## Evidence Canonicalization & Explainability (Step 9)

### Evidence model

The `Evidence` discriminated union (defined in `@devlens/core`) has 8
variant types, each with explicit, machine-readable fields:

| Evidence type       | Fields                | Observation modality                                 |
| ------------------- | --------------------- | ---------------------------------------------------- |
| `http_header`       | `name`, `value`       | HTTP response headers                                |
| `meta_tag`          | `name`, `content`     | `<meta>` tag content                                 |
| `script_url`        | `url`                 | `<script src>` URLs                                  |
| `script_content`    | `snippet`             | Inline `<script>` content (matched fingerprint only) |
| `javascript_global` | `globalName`          | JS global variables                                  |
| `resource`          | `url`                 | Fetched resource bodies                              |
| `link`              | `url`                 | `<link>` tag href URLs                               |
| `html`              | `selector`, `snippet` | Raw HTML structure                                   |

Each evidence variant has an explicit `type` discriminant, enabling
`switch`-based narrowing in consumers. No evidence variant stores raw
resource bodies, full script sources, or other oversized content.

### Canonical evidence key

`packages/detectors/src/evidence-key.ts` provides `getEvidenceKey(evidence)`
— a deterministic, property-order-independent canonicalization function.
The key format is `type|field1|field2|...` and is used internally for
deduplication (not exposed in API responses or database storage).

URL fields are normalized to lowercase in the key, so the same resource
accessed via different capitalization is treated as identical evidence.

### Evidence deduplication & canonical ordering

`DeduplicatingDetector.mergeEvidence()` uses `getEvidenceKey` (not
`JSON.stringify`) for deduplication. After deduplication, evidence is
**sorted by canonical key** (by `type`, then by field content). This
ensures that `[A, B]` and `[B, A]` produce the same canonical output,
satisfying the deterministic-ordering invariant.

The same `getEvidenceKey` function is used in `ResourceDetector` and
`LinkDetector` for their intra-detector evidence deduplication.

### Scoring preserves evidence

`ConfidenceScorer.score()` creates a new `Detection` with
`[...detection.evidence)` — it never mutates or removes the evidence array
from the deduplicated detection it receives. This guarantees that:

- **Invariant A**: every detection has ≥1 evidence item (enforced by
  `createDetection` at construction time)
- **Invariant B**: every evidence item has an explicit `type` discriminant
- **Invariant C**: evidence is preserved through scoring
- **Invariant D**: scoring does not modify evidence content
- **Invariant E**: same snapshot → same detection (deterministic pipeline)

## Confidence Calibration & Ranking (Step 10)

### Confidence contract

The `confidence` field on a `Detection` represents **evidence strength**,
not a statistical probability. It is a bounded number in `[0, 100]`:

```text
0     = not confident at all (no evidence)
100   = completely certain (strong, specific, convergent evidence)
```

The value is always a finite number — never `NaN`, `Infinity`, or
negative. This invariant is enforced by `createConfidence()` at the domain
layer and reinforced by `clampConfidence()` in the scorer.

> **Note**: Step 10 considered normalizing confidence to `[0, 1]` as the
> specification suggests. This was deliberately **not** done: the existing
> `[0, 100]` range is deeply embedded (signature tables, API responses,
> database JSONB). All Step 10 principles (bounded, deterministic,
> monotone) are scale-independent. Changing the range would be a breaking
> change with no behavioral improvement.

### Scoring formula

```text
base   = detection.confidence     (best single per-signature confidence, 0–100)
n      = number of unique evidence source types (≥ 1)
bonus  = min(MAX_BONUS, max(0, (n - 1) × PER_SOURCE_BONUS))
score  = clampConfidence(base + bonus)
```

**Defaults**: `MAX_BONUS = 10`, `PER_SOURCE_BONUS = 5`.

An "evidence source" is the `Evidence['type']` discriminant value. Each
unique type is an independent observation modality. Multiple evidence
items of the **same type** (e.g. three `LinkEvidence` for `wp-content`,
`wp-includes`, `wp-json`) are treated as dependent — they do not
independently boost the score.

| Base | Sources | Bonus | Score |
| ---- | ------- | ----- | ----- |
| 90   | 1       | 0     | 90    |
| 90   | 2       | 5     | 95    |
| 90   | 3       | 10    | 100   |
| 85   | 2       | 5     | 90    |
| 95   | 1       | 0     | 95    |

### Defensive normalization (`clampConfidence`)

The scorer uses `clampConfidence(value)` — an internal function in
`detection-scorer.ts` (not exported from `@devlens/detectors`) — to
guarantee the final score is always in `[0, 100]`:

```typescript
function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
```

- `NaN` → 0 (truly unknown — treat as no confidence)
- `Infinity` → 100 (cap at maximum)
- `-Infinity` → 0 (floor at minimum)
- Negative values → 0
- Values > 100 → 100
- Otherwise → rounded to nearest integer, clamped to `[0, 100]`

### Detection ranking

After scoring, `ScoringDetector` sorts the final `Detection[]`
deterministically:

1. **`confidence` DESC** — higher-confidence detections appear first.
2. **`technology.id` ASC** — stable tie-break, independent of insertion
   order, `Map` iteration order, or detector ordering.

This ensures that the same set of detections always produces the same
output ordering, regardless of pipeline construction or which
sub-detector fired first.

**Example**: Next.js (score 100) always ranks above React (score 95)
when both are detected, because the specific Next.js fingerprint
(`__NEXT_DATA__`) gives it a higher base confidence and more evidence
sources than the generic React signal (`react-dom`).

### No confidence threshold

There is **no minimum confidence threshold**. All detected technologies
are returned in the `Detection[]`, regardless of their final score.
This is intentional: the detection engine must remain faithful to the
evidence. Filtering low-confidence results is a presentation-layer
concern, not a detection-layer one.

## File Structure

```text
packages/detectors/src/
├── index.ts                       # Re-exports all detectors, scorers, catalog, and factory
├── detector.ts                    # Detector interface + NullDetector (shared boundary, avoids circular deps)
├── evidence-key.ts                # getEvidenceKey() — canonical evidence key (internal, not exported)
├── production-detector.ts        # createProductionDetector() — production pipeline factory
├── technology-catalog.ts          # TechnologyCatalog — centralized tech metadata (id, name, category)
├── technology-catalog.test.ts    # 16 tests
├── evidence-key.test.ts          # 15 tests
├── header-detector.ts            # HeaderDetector class + signature table
├── header-detector.test.ts       # 25 tests
├── meta-tag-detector.ts          # MetaTagDetector class + signature table
├── meta-tag-detector.test.ts     # 23 tests
├── script-url-detector.ts        # ScriptUrlDetector class + signature table
├── script-url-detector.test.ts   # 25 tests (21 + 4 Step 11)
├── content-script-detector.ts    # ContentScriptDetector class + signature table
├── content-script-detector.test.ts # 39 tests (30 + 9 Step 11)
├── resource-detector.ts          # ResourceDetector class + signature table
├── resource-detector.test.ts     # 29 tests (26 + 3 Step 11)
├── link-detector.ts              # LinkDetector class + signature table
├── link-detector.test.ts         # 41 tests
├── deduplicating-detector.ts     # DeduplicatingDetector class (decorator wrapper)
├── deduplicating-detector.test.ts # 23 tests
├── composite-detector.ts         # CompositeDetector class
├── composite-detector.test.ts    # 19 tests
├── detection-scorer.ts           # DetectionScorer interface + ConfidenceScorer implementation + clampConfidence
├── detection-scorer.test.ts      # 39 tests (23 existing + 16 Step 10 additions)
├── scoring-detector.ts           # ScoringDetector class (decorator wrapper with ranking)
├── scoring-detector.test.ts      # 10 tests
├── production-detector.test.ts   # regression test for the factory (added Step 14)
├── detection-ranking.test.ts     # 8 tests (Step 10 — ranking scenarios A–C)
├── pipeline.integration.test.ts  # 16 tests (end-to-end scenarios A–F + evidence quality)
├── determinism-persistence.test.ts # 8 tests (determinism + evidence quality)
├── evidence-quality.test.ts      # 19 tests (evidence invariants A–H)
├── evidence-integration.test.ts  # 10 tests (integration scenarios A–E)
├── confidence-integration.test.ts # 15 tests (Step 10 — scoring integration)
├── technology-collision.test.ts  # 24 tests (Step 11 — collision & false-positive tests)
├── golden-fixtures.test.ts       # 109 tests (Step 13 — golden regression suite)
└── fixtures/
    └── detector-fixtures.ts      # 35 realistic fixtures + makeSnapshot helper + ALL_TECH_IDS
```

## Dependency Direction

```text
@devlens/core
      ↑
      │
@devlens/detectors
      │
      └── (consumed by @devlens/application via runScan)
```

`@devlens/detectors` depends on `@devlens/core` only. `@devlens/core`
does **not** depend on `@devlens/detectors`. No circular dependencies.

## Production wiring

Both the web API and the worker compose three decorator layers:
`CompositeDetector` aggregates sub-detectors, `DeduplicatingDetector`
ensures one `Detection` per technology, and `ScoringDetector` applies
the final confidence scoring based on evidence diversity. To eliminate
the duplication risk of two independent wiring sites, both entry points
call `createProductionDetector()` from `@devlens/detectors`:

```text
CompositeDetector([HeaderDetector, MetaTagDetector, ScriptUrlDetector,
  ContentScriptDetector, ResourceDetector, LinkDetector])
    → produces Detection[] (with duplicates)
DeduplicatingDetector(CompositeDetector(...))
    → produces deduplicated Detection[]
ScoringDetector(DeduplicatingDetector(...), ConfidenceScorer())
    → produces final scored Detection[]
```

```typescript
// apps/web/src/app/api/scans/route.ts
import { createProductionDetector } from '@devlens/detectors';

function createDependencies() {
  return {
    crawler: new HttpCrawler(),
    detector: createProductionDetector(),
    repository: new PostgresScanResultRepository(createDatabaseClient()),
    generateId: () => crypto.randomUUID(),
    now: new Date(),
  };
}
```

The worker uses the same factory:

```typescript
// apps/worker/src/main.ts
const result = await runScan(scan, crawler, createProductionDetector());
```
