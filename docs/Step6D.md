# Step 6D — Implement MetaTagDetector

## 1. Objective

Introduce a `MetaTagDetector` that detects technologies from HTML `<meta>` tags
already present in `SiteSnapshot`. The detector operates on meta tag data
extracted from the HTML response body during crawling, matching `<meta
name="generator">` content values against known CMS/builder signatures.

This step extends the domain model, the HTML parser, the crawler, the database
schema, the PostgreSQL repository, and all test files that construct
`SiteSnapshot`, and introduces `MetaTagDetector` as the second concrete
`Detector` (alongside `HeaderDetector`), composed via `CompositeDetector`.

**Constraints respected:**

- `ScanResult`, `executeScan()`, `runScan()`, repository interfaces, existing
  database columns, and HTTP API response shape were NOT changed.
- The `Detector` interface was NOT changed.
- No network requests are performed inside detectors.
- Only `MetaTagDetector` was implemented — no speculative detectors.

## 2. Domain Model Extension

`@devlens/core` (`packages/core/src/domain/snapshot.ts`):

- Added a `MetaTag` interface:
  ```typescript
  interface MetaTag {
    name: string;
    content: string;
  }
  ```
- Added `metaTags: ReadonlyArray<MetaTag>` to `HtmlObservation`:
  ```typescript
  interface HtmlObservation {
    title: string;
    description: string | null;
    metaTags: ReadonlyArray<MetaTag>;
  }
  ```

`MetaTag` and `HtmlObservation` are exported via `@devlens/core`'s public API
(`packages/core/src/index.ts`). `@devlens/core` remains zero-dependency.

The `MetaTagEvidence` type (`{ type: 'meta_tag'; name: string; content: string }`)
was already defined in `@devlens/core/src/domain/evidence.ts` during Step 6C and
required no changes.

## 3. MetaTagDetector Design

`packages/detectors/src/meta-tag-detector.ts`:

`MetaTagDetector` implements the `Detector` interface (`detect(snapshot):
Detection[]`). It reads `snapshot.html.metaTags` and iterates over a `SIGNATURES`
table. For each signature, it finds the first meta tag whose `name` (lowercased)
matches the signature's `tagName` and whose `content` (lowercased) contains the
signature's `matchContent` (case-insensitive substring match).

- **Deduplication**: a `Set<string>` tracks already-emitted technology IDs. If a
  technology was already detected, the signature is skipped.
- **No-match**: returns `[]` when no meta tags match.
- **No-throw**: never throws — missing `metaTags`, empty arrays, or malformed
  tags are handled gracefully (empty result).
- **Evidence**: each `Detection` carries exactly one `MetaTagEvidence` item
  referencing the original (un-lowercased) meta tag `name` and `content`.

The `@devlens/detectors` package depends on `@devlens/core` only.

## 4. Detection Signatures

All signatures match the `generator` meta tag:

| Meta tag name | Content contains | Technology | Category    | Confidence |
| ------------- | ---------------- | ---------- | ----------- | ---------- |
| `generator`   | `WordPress`      | WordPress  | `cms`       | 90         |
| `generator`   | `Hugo`           | Hugo       | `cms`       | 85         |
| `generator`   | `Jekyll`         | Jekyll     | `cms`       | 85         |
| `generator`   | `Ghost`          | Ghost      | `cms`       | 85         |
| `generator`   | `Next.js`        | Next.js    | `framework` | 85         |
| `generator`   | `Gatsby`         | Gatsby     | `framework` | 85         |
| `generator`   | `Nuxt.js`        | Nuxt.js    | `framework` | 85         |

## 5. Evidence Representation

Each detection includes exactly one `MetaTagEvidence`:

```typescript
{
  type: 'meta_tag',
  name: 'generator',          // original case as found in HTML
  content: 'WordPress 6.4.2', // original case as found in HTML
}
```

The `content` substring is matched case-insensitively, but the original
casing is preserved in the evidence.

## 6. Files Created / Modified

### Created

| File                                                            | Purpose                                      |
| --------------------------------------------------------------- | -------------------------------------------- |
| `packages/detectors/src/meta-tag-detector.ts`                   | `MetaTagDetector` class + `SIGNATURES` table |
| `packages/detectors/src/meta-tag-detector.test.ts`              | 23 unit tests                                |
| `packages/crawler/src/html-parser.test.ts`                      | 13 unit tests for meta tag extraction        |
| `packages/database/drizzle/0002_add_meta_tags_to_snapshots.sql` | Migration for `html_meta_tags` column        |

### Modified

| File                                                   | Change                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `packages/core/src/domain/snapshot.ts`                 | Added `MetaTag` interface + `metaTags` field to `HtmlObservation`                            |
| `packages/core/src/domain/snapshot.test.ts`            | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `packages/core/src/index.ts`                           | Re-exports `MetaTag` from `snapshot.ts`                                                      |
| `packages/crawler/src/html-parser.ts`                  | Extended `HtmlExtract` with `metaTags`; added `extractMetaTags()` reusing `getAttribute()`   |
| `packages/crawler/src/http-crawler.ts`                 | Populates `metaTags` in `HtmlObservation`                                                    |
| `packages/crawler/src/crawler.test.ts`                 | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `packages/database/src/schema.ts`                      | Added `htmlMetaTags: jsonb().notNull()` column                                               |
| `packages/database/drizzle/meta/_journal.json`         | Added migration journal entry (idx 2)                                                        |
| `packages/database/src/postgres-repository.ts`         | `SnapshotRow` has `htmlMetaTags`; maps to/from `snapshot.html.metaTags`                      |
| `packages/database/src/postgres-repository.test.ts`    | Updated `makeSnapshot` + upsert test data with `metaTags`                                    |
| `packages/database/src/repository.test.ts`             | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `packages/detectors/src/index.ts`                      | Exports `MetaTagDetector`                                                                    |
| `packages/detectors/src/header-detector.test.ts`       | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `packages/detectors/src/composite-detector.test.ts`    | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `packages/application/src/index.ts`                    | Re-exports `MetaTagDetector`                                                                 |
| `packages/application/src/orchestrator.test.ts`        | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `packages/application/src/execute-scan.test.ts`        | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `packages/application/src/repository.test.ts`          | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `apps/web/src/app/api/scans/handler.ts`                | Imports `MetaTagDetector`; wiring updated                                                    |
| `apps/web/src/app/api/scans/route.ts`                  | `createDependencies` uses `CompositeDetector([new HeaderDetector(), new MetaTagDetector()])` |
| `apps/web/src/app/api/scans/route.test.ts`             | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `apps/web/src/app/api/scans/route.integration.test.ts` | Wiring uses `MetaTagDetector` in `CompositeDetector`                                         |
| `apps/worker/src/main.ts`                              | `main()` uses `CompositeDetector([new HeaderDetector(), new MetaTagDetector()])`             |
| `apps/worker/src/main.test.ts`                         | Updated `makeSnapshot` with `metaTags: []`                                                   |
| `docs/architecture/detectors.md`                       | Added `MetaTagDetector` section + updated file structure + wiring                            |
| `docs/architecture/overview.md`                        | Updated detector exports list + worker wiring                                                |
| `docs/architecture/crawler.md`                         | Updated HTML extraction section + file structure                                             |
| `docs/architecture/persistence.md`                     | Added `html_meta_tags` column to schema table                                                |

## 7. Tests Added

| Test file                                          | Tests                                                                                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/detectors/src/meta-tag-detector.test.ts` | 23 — signature tests (7), case-insensitive name (3), case-insensitive content (3), multi-detection (2), dedup (1), no-match (4), edge cases (2), domain contract (1) |
| `packages/crawler/src/html-parser.test.ts`         | 13 — meta tag extraction (12), title/description unchanged (2), totaling 13                                                                                          |

All existing test files that construct `SiteSnapshot` were updated to include
`metaTags: []` (or realistic meta tag data where relevant), so all existing tests
continue to pass.

## 8. Validation Results

### Lint + Prettier

`pnpm lint` — **PASS** (ESLint clean, Prettier formatting verified)

### Typecheck

`pnpm -r typecheck` (10 projects) — **PASS**

### Unit tests

`pnpm test` — **PASS**: 227 passed, 9 skipped (236 total, 21 test files)

### Build

`pnpm build` (10 projects including Next.js) — **PASS**

### Circular dependencies

`npx madge --circular` — **PASS** (No circular dependency found)

### Integration tests (PostgreSQL 16.4, port 5433)

- `packages/database/src/postgres-repository.test.ts` — **7/7 passed**
- `apps/web/src/app/api/scans/route.integration.test.ts` — **2/2 passed**
- Database reset: `DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP
SCHEMA IF EXISTS drizzle CASCADE;` applied before each run.

## 9. Remaining Detector Architecture Gaps

- **No JavaScript/Script detection**: detectors only inspect HTTP headers and
  `<meta>` tags. Framework detection from `<script>` attributes or inline JS
  is not yet implemented.
- **No resource-based detection**: `SiteSnapshot.resources` are parsed and
  stored but not analyzed (e.g., detecting webpack, React, Vue from script URLs
  or resource patterns).
- **No cross-detector confidence aggregation**: `CompositeDetector` simply
  concatenates detections from sub-detectors. There is no mechanism to boost
  confidence when multiple detectors agree on the same technology.
- **No version extraction**: `MetaTagDetector` and `HeaderDetector` record raw
  evidence but do not parse version strings from matched content (e.g.,
  `WordPress 6.4.2` → version `6.4.2`).
- **Single meta tag inspected**: `MetaTagDetector` only matches the `generator`
  meta tag. Other meta tags (e.g., `keywords`, `author`, Open Graph tags) are
  extracted and stored but not used for detection.

## 10. Recommended Next Step

**Step 6E**: Implement a `ScriptDetector` (or `ResourceDetector`) that inspects
`SiteSnapshot.resources` and `HtmlObservation` for script tags, `data-*`
attributes, and URL patterns (e.g., `/_next/`, `/static/`, webpack bootstrap
signatures). This would complement `MetaTagDetector` and `HeaderDetector` by
catching frameworks that don't expose a `generator` meta tag or `X-Powered-By`
header.

The `CompositeDetector` wiring makes this trivial to add:

```typescript
new CompositeDetector([
  new HeaderDetector(),
  new MetaTagDetector(),
  new ResourceDetector(), // ← next
]);
```
