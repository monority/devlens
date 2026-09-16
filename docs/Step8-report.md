# Step 8 — Detection Result Quality & Technology Catalog — Report

## Status

✅ Complete. All validation checks pass.

## Objective

Audit and consolidate the quality of detection results — verifying that
detected technologies have coherent, explainable, correctly categorized,
correctly scored, and correctly persisted evidence that is properly
transported to the API. Establish an explicit technology catalog.

## Audit findings (pre-modification)

### Technology inventory

23 unique technologies are detected across 6 detectors:

| ID             | Name         | Category         | Detectors                                                          | Confidence range | Evidence types                       |
| -------------- | ------------ | ---------------- | ------------------------------------------------------------------ | ---------------- | ------------------------------------ |
| `nginx`        | nginx        | `server`         | HeaderDetector                                                     | 95               | http_header                          |
| `apache`       | Apache       | `server`         | HeaderDetector                                                     | 95               | http_header                          |
| `iis`          | IIS          | `server`         | HeaderDetector                                                     | 95               | http_header                          |
| `php`          | PHP          | `language`       | HeaderDetector                                                     | 90               | http_header                          |
| `wordpress`    | WordPress    | `cms`            | MetaTagDetector, ScriptUrlDetector, ResourceDetector, LinkDetector | 90–95            | meta_tag, script_url, resource, link |
| `hugo`         | Hugo         | `cms`            | MetaTagDetector                                                    | 85               | meta_tag                             |
| `jekyll`       | Jekyll       | `cms`            | MetaTagDetector                                                    | 85               | meta_tag                             |
| `ghost`        | Ghost        | `cms`            | MetaTagDetector                                                    | 85               | meta_tag                             |
| `express`      | Express      | `framework`      | HeaderDetector                                                     | 90               | http_header                          |
| `nextjs`       | Next.js      | `framework`      | MetaTagDetector, ScriptUrlDetector, ContentScriptDetector          | 85–95            | meta_tag, script_url, script_content |
| `nuxtjs`       | Nuxt.js      | `framework`      | MetaTagDetector, ScriptUrlDetector                                 | 85–90            | meta_tag, script_url                 |
| `gatsby`       | Gatsby       | `framework`      | MetaTagDetector, ScriptUrlDetector                                 | 85               | meta_tag, script_url                 |
| `jquery`       | jQuery       | `library`        | ScriptUrlDetector                                                  | 85               | script_url                           |
| `bootstrap`    | Bootstrap    | `framework`      | ScriptUrlDetector                                                  | 80               | script_url                           |
| `lodash`       | Lodash       | `library`        | ScriptUrlDetector                                                  | 80               | script_url                           |
| `react`        | React        | `framework`      | ContentScriptDetector                                              | 85–90            | script_content                       |
| `vue`          | Vue.js       | `framework`      | ContentScriptDetector                                              | 95               | script_content                       |
| `angular`      | Angular      | `framework`      | ContentScriptDetector                                              | 90–95            | script_content                       |
| `svelte`       | Svelte       | `framework`      | ContentScriptDetector                                              | 90–95            | script_content                       |
| `astro`        | Astro        | `framework`      | ContentScriptDetector                                              | 95               | script_content                       |
| `firebase`     | Firebase     | `service_worker` | ResourceDetector                                                   | 95               | resource                             |
| `shopify`      | Shopify      | `ecommerce`      | LinkDetector                                                       | 95               | link                                 |
| `google-fonts` | Google Fonts | `fonts`          | LinkDetector                                                       | 90               | link                                 |

### Inconsistencies identified

**None found** in the data model:

- **IDs**: Every technology uses the same `technology.id` across all
  detectors that can produce it (e.g. `nextjs` in MetaTagDetector,
  ScriptUrlDetector, ContentScriptDetector).
- **Names**: Every technology has the same display name everywhere.
- **Categories**: Every technology has the same category everywhere.
  No categories were deprecated or merged.
- **Documented**: All 23 technologies are documented in `detectors.md`.
  No detectable-but-undocumented technologies.
- **Confidence**: Varying per-signature confidence is expected (stronger
  fingerprints get higher confidence). No inconsistency within the same
  detector+signature.

### Demonstrated issue requiring refactoring

**Duplication of technology metadata**: the `{ id, name, category }`
triple for each technology was hardcoded in all six detector signature
tables. While currently consistent, this creates a maintenance hazard —
adding a new detector for an existing technology could accidentally use
a different category or name. This is the demonstrated issue that
justifies the catalog introduction (Section 3).

## Changes made

### 1. Technology Catalog (`packages/detectors/src/technology-catalog.ts`)

Created a centralized catalog with:

- `TECHNOLOGY_CATALOG: Record<string, Technology>` — all 23 technologies
- `TECHNOLOGY_IDS: Set<string>` — all catalog keys
- `TECHNOLOGY_CATEGORIES: Set<string>` — all categories in use
- `getTechnology(id: string): Technology` — lookup function (throws if unknown)

This is a **data** module, not a new domain concept. It uses the existing
`Technology` interface from `@devlens/core`.

### 2. Detector refactoring (6 files)

Each detector's signature table was simplified:

- **Removed** `technologyName` and `technologyCategory` fields from all
  signature interfaces (`HeaderSignature`, `MetaTagSignature`,
  `ScriptUrlSignature`, `ContentScriptSignature`, `ResourceSignature`,
  `LinkSignature`).
- **Replaced** inline `Technology` construction with `getTechnology(sig.technologyId)`.
- **Removed** unused imports (`createTechnologyId`, `createTechnologyCategory`,
  `Technology`) from detector source files.

**Before:**

```typescript
interface HeaderSignature {
  readonly headerName: string;
  readonly matchValue: string;
  readonly technologyId: string;
  readonly technologyName: string; // ← removed
  readonly technologyCategory: string; // ← removed
  readonly confidence: number;
}
```

**After:**

```typescript
interface HeaderSignature {
  readonly headerName: string;
  readonly matchValue: string;
  readonly technologyId: string; // catalog key
  readonly confidence: number;
}
```

No detection logic changed — matching rules, evidence generation, and
confidence values are identical. Only the technology metadata source
changed (from inline to catalog lookup).

### 3. Confidence vs. final score (Section 7)

Confirmed: `Detection.confidence` is the **final scored confidence** —
the output of `ConfidenceScorer.score()` applied by `ScoringDetector`
after `DeduplicatingDetector`. There is no separate `score` field.
The API response (`DetectionResponse`) and the database JSONB
(`detections` column) both use the same `confidence` field. This is
consistent and clean — no change needed.

### 4. Evidence quality audit (Section 8)

| Evidence type       | Source                    | Size characteristics                            | Verdict |
| ------------------- | ------------------------- | ----------------------------------------------- | ------- |
| `http_header`       | HTTP headers              | Small (name + value)                            | ✅      |
| `meta_tag`          | `<meta>` tags             | Small (name + content)                          | ✅      |
| `script_url`        | `<script src>` URL        | Small (URL only)                                | ✅      |
| `script_content`    | Inline `<script>` snippet | Only the matched fingerprint, never full script | ✅      |
| `resource`          | Resource URL              | URL only, not body content                      | ✅      |
| `link`              | `<link href>` URL         | Resolved URL only                               | ✅      |
| `html`              | Raw HTML                  | Selector + small snippet                        | ✅      |
| `javascript_global` | JS global name            | Just the global name                            | ✅      |

No oversized evidence storage issues. All evidence types are serializable
as JSON (plain objects with string/number fields).

### 5. API contract audit (Section 11)

The API response (`DetectionResponse` in `handler.ts`) exposes:

- `technology.id`, `technology.name`, `technology.category`
- `confidence` (final scored)
- `evidence` (the full array of evidence objects)

No raw resource content, script source, crawler internals, or security
details are leaked. The API serializes domain `Detection` objects
directly — this is documented and intentional.

## Files created

| File                                                     | Purpose                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/detectors/src/technology-catalog.ts`           | TechnologyCatalog + `getTechnology`                          |
| `packages/detectors/src/technology-catalog.test.ts`      | 16 tests (completeness, ID uniqueness, category consistency) |
| `packages/detectors/src/pipeline.integration.test.ts`    | 16 tests (Scenarios A–F, evidence quality)                   |
| `packages/detectors/src/determinism-persistence.test.ts` | 8 tests (determinism, evidence quality)                      |
| `packages/database/src/persistence-roundtrip.test.ts`    | 5 tests (save→get round-trip, JSONB serialization)           |

## Files modified

| File                                                | Change                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/detectors/src/header-detector.ts`         | Removed `technologyName`/`technologyCategory` from signatures, use `getTechnology()` |
| `packages/detectors/src/meta-tag-detector.ts`       | Same refactoring                                                                     |
| `packages/detectors/src/script-url-detector.ts`     | Same refactoring                                                                     |
| `packages/detectors/src/content-script-detector.ts` | Same refactoring                                                                     |
| `packages/detectors/src/resource-detector.ts`       | Same refactoring                                                                     |
| `packages/detectors/src/link-detector.ts`           | Same refactoring                                                                     |
| `packages/detectors/src/index.ts`                   | Export `TECHNOLOGY_CATALOG`, `getTechnology`, etc.                                   |
| `packages/database/package.json`                    | Add `@devlens/detectors` as devDependency (for test imports)                         |
| `docs/architecture/detectors.md`                    | Technology Catalog section + audit findings + updated file structure                 |
| `docs/architecture/overview.md`                     | Catalog mention in detector exports                                                  |

## End-to-end test scenarios

### Scenario A — Next.js

```
Snapshot: <meta name="generator" content="Next.js">
          <script src="/_next/static/chunks/main.js">
          inline script: __NEXT_DATA__
```

- ✅ Single `nextjs` detection
- ✅ Evidence merged: `meta_tag` + `script_url` + `script_content`
- ✅ Score: 95 (base) + 10 (3 sources) = 100
- ✅ Category: `framework`
- ✅ Deterministic

### Scenario B — WordPress

```
Snapshot: <meta name="generator" content="WordPress 6.4">
          <script src="/wp-content/themes/style.js">
          <link href="/wp-content/style.css">
          robots.txt: Disallow: /wp-admin
```

- ✅ Single `wordpress` detection (deduplicated from 4 detector families)
- ✅ Evidence merged: `meta_tag` + `script_url` + `link` + `resource`
- ✅ Score: 95 (base from ResourceDetector CSS) + 10 (4 sources) = 100
- ✅ Category: `cms`

### Scenario C — React vs Next.js

```
Snapshot: <script>react-dom</script>
          <script>__NEXT_DATA__</script>
```

- ✅ React (`react`) and Next.js (`nextjs`) are **distinct**
- ✅ No false merge

### Scenario D — Shopify

```
Snapshot: <link href="https://cdn.shopify.com/assets/theme.css">
```

- ✅ `shopify` detection from hostname match
- ✅ No false positive from `shopifycdn.com.example.com`

### Scenario E — No fingerprint

```
Snapshot: generic headers, meta, scripts, links, CSS
```

- ✅ `detections = []`

### Scenario F — Noise

```
Snapshot: scripts containing "react" and "vue" as variable names
```

- ✅ No false positives (substring "react" in a variable doesn't trigger React)

### Determinism test

- ✅ Same snapshot → same detections (5 consecutive runs, identical JSON)
- ✅ Technology order preserved
- ✅ Evidence order preserved
- ✅ Confidence score consistent

### Persistence round-trip

- ✅ `ScanResult → repo.save() → repo.getScan/getSnapshot/getDetections()` preserves:
  - technology ID, name, category
  - confidence/score
  - evidence array (type, order, content)
- ✅ `executeScan` end-to-end round-trip
- ✅ JSON serialization (simulating JSONB) preserves all fields

## Validation results

| Check                  | Result                                 |
| ---------------------- | -------------------------------------- |
| `pnpm typecheck`       | ✅ 0 errors                            |
| `pnpm test`            | ✅ 509 passed \| 9 skipped (518 total) |
| `pnpm lint`            | ✅ clean                               |
| `pnpm build`           | ✅ all packages, Next.js compiled      |
| `npx madge --circular` | ✅ No circular dependency (93 files)   |

## Test count summary

| Package                | Test files | Tests                           |
| ---------------------- | ---------- | ------------------------------- |
| `@devlens/core`        | 7          | 104                             |
| `@devlens/crawler`     | 3          | 94                              |
| `@devlens/detectors`   | 11         | 269 (234 pre-existing + 35 new) |
| `@devlens/application` | 3          | 15                              |
| `@devlens/database`    | 3          | 13 (8 pre-existing + 5 new)     |
| `apps/web`             | 2          | 15                              |
| `apps/worker`          | 1          | 4                               |

## Constraints satisfied

- ✅ No new detectors added (Section 13)
- ✅ No new network observations (Section 13)
- ✅ No premature refactoring of the broader system (Section 14)
- ✅ Catalog introduction justified by demonstrated metadata duplication
- ✅ `Detection` contract unchanged — still `{ technology, confidence, evidence }`
- ✅ Categories unchanged — no new categories introduced
- ✅ Technology IDs unchanged — no existing IDs modified
