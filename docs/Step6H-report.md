# Step 6H — Final Report

## 1. Objective

Extend `SiteSnapshot` and `HttpCrawler` with **controlled resource
observation** — a limited, same-origin-only fetch of three high-value
resource types: `robots.txt`, `manifest.json`, and same-origin CSS files
referenced by `<link rel="stylesheet">` tags.

This step is **observation only**. No `ResourceDetector` was created. No
JavaScript bundles were fetched. No scoring, confidence, or health metrics
were computed from observed resources. No recursive crawling occurred.
Existing detectors (`CompositeDetector`, `DeduplicatingDetector`) and the
detector pipeline were left untouched.

## 2. Resource Model

The `Resource` interface (in `packages/core/src/domain/snapshot.ts`) was
extended with three new fields:

```typescript
export interface Resource {
  url: Url;
  type: ResourceType;
  size: number | null;
  content: string; // new — raw body text
  httpStatus: HttpStatus; // new — HTTP status code as domain value object
  contentType: string | null; // new — media-type (without parameters)
}
```

`ResourceType` (already a union of `'script' | 'stylesheet' | 'image' |
'font' | 'video' | 'audio' | 'document' | 'other'`) was extended with:
`'css' | 'robots' | 'manifest'`.

`HttpStatus` was already available via `createHttpStatus()` from
`@devlens/core`. The `Resource` objects are stored in
`SiteSnapshot.resources: Resource[]`.

## 3. Supported Resource Types

| Type       | Discovery                            | Content-Type accepted                             |
| ---------- | ------------------------------------ | ------------------------------------------------- |
| `robots`   | Derived from `<origin>/robots.txt`   | `text/plain` (or empty/missing)                   |
| `manifest` | `<link rel="manifest" href="...">`   | `application/manifest+json` or `application/json` |
| `css`      | `<link rel="stylesheet" href="...">` | `text/css`                                        |

## 4. Crawler Behavior

`HttpCrawler` (`packages/crawler/src/http-crawler.ts`) was extended with:

- **`observeResources(pageUrl, targetHostname, extract, signal)`** —
  orchestrates the three resource types sequentially. Each type is
  wrapped in its own try/catch so a single failure never aborts the
  crawl.
  - **robots.txt**: URL is derived from `new URL(pageUrl).origin + '/robots.txt'`.
  - **manifest**: URL is resolved from `extract.manifestLink` (first
    `<link rel="manifest">` href) against the page URL.
  - **CSS**: URLs come from `extract.stylesheetLinks` (all
    `<link rel="stylesheet">` hrefs), resolved against the page URL.
    Deduplicated via a `Set<string>` of resolved URLs. Capped at
    `maxCssResources` (default 5). Each successful fetch increments the
    count; failed fetches do not count toward the limit.

- **`fetchResource(resourceUrl, targetHostname, type, signal)`** —
  fetches a single resource with:
  - SSRF protection via `isResourceUrlAllowed()`.
  - `redirect: 'manual'` and cross-origin redirect rejection.
  - Content-Type compatibility check (`isContentTypeCompatible()`).
  - Body size limit via `readBodyWithLimit()`.
  - Returns `null` on any failure (skipped silently).

The `crawl()` method now captures the `extract` object (previously scoped
to an `if` block) and calls `observeResources()` after HTML extraction.
Results are passed to `snapshot.resources`.

## 5. Security / SSRF Protections

- **`isResourceUrlAllowed(url, targetHostname)`** (new in
  `packages/crawler/src/ssrf-guard.ts`) rejects URLs where:
  1. The URL fails to parse.
  2. The protocol is not `http:` or `https:` (rejects `javascript:`,
     `data:`, `blob:`, `file:`, `ftp:`).
  3. The hostname is on the blocked list (`isBlockedHostname` — loopback,
     private ranges, link-local, unspecified).
  4. The hostname does not match `targetHostname`.
- **Cross-origin redirects**: `fetchResource` follows redirects manually
  (`redirect: 'manual'`). Each redirect target's hostname is checked
  against `targetHostname` and `isBlockedHostname`. Cross-origin
  redirects return `null`.
- **Redirect chain limit**: `maxRedirects` (default 10) enforced.
- **Abort signal**: all resource fetches receive the crawl's
  `AbortController` signal, so a crawl timeout aborts pending resource
  fetches without failing the entire scan.

## 6. Resource Limits

| Limit              | Constant                     | Default | Configurable via option |
| ------------------ | ---------------------------- | ------- | ----------------------- |
| Max CSS resources  | `DEFAULT_MAX_CSS_RESOURCES`  | 5       | `maxCssResources`       |
| Max resource bytes | `DEFAULT_MAX_RESOURCE_BYTES` | 524288  | `maxResourceBytes`      |

When a resource body exceeds `maxResourceBytes`, `readBodyWithLimit()`
throws a `CrawlError('too_large')`, which is caught in `fetchResource()`
and the resource is skipped (not stored, no crash).

## 7. Parser Changes

`packages/crawler/src/html-parser.ts` was extended:

- `HtmlExtract` interface gained `stylesheetLinks: string[]` and
  `manifestLink: string | null`.
- `extractStylesheetLinks(html)` — matches `<link rel="stylesheet"
href="...">`, case-insensitive, space-separated rel values. Returns
  hrefs as-is (relative URLs preserved; deduplication deferred to the
  crawler).
- `extractManifestLink(html)` — returns the first `<link rel="manifest"
href="...">` href, same matching rules.
- `extractHtml()` now calls both new functions and includes the results
  in the returned `HtmlExtract`.

Parser tests: 7 new tests added in `describe('link extraction (Step 6H)')`.
Full script extraction suite (13 tests) re-added after accidental
replacement. Total: 36 tests.

## 8. Persistence Changes

**No migration needed.** The `resources` JSONB column was already present
in the initial migration (`0000_opposite_doctor_spectrum.sql`) and in the
Drizzle schema (`schema.ts` line 64:
`resources: jsonb('resources').notNull()`). The `SnapshotRow` interface
already maps `resources: Resource[]`, and `snapshotToRow()` already
includes `resources: [...snapshot.resources]` in both the insert and
`ON CONFLICT DO UPDATE` upsert. The JSONB column transparently
serializes the extended `Resource` fields (`content`, `httpStatus`,
`contentType`) without any schema change.

`postgres-repository.test.ts` was updated to include the new `Resource`
fields in `makeSnapshot()` and the JSONB assertion.

## 9. Files Created

No new source files were created for Step 6H. All changes are modifications
to existing files.

## 10. Files Modified

| File                                                | Change                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/domain/snapshot.ts`              | Extended `ResourceType` with `'css' \| 'robots' \| 'manifest'`; extended `Resource` interface with `content`, `httpStatus`, `contentType`                                                                                                                                                                      |
| `packages/core/src/domain/snapshot.test.ts`         | Updated `makeSnapshot()` with new Resource fields; added 4 new tests (css/robots/manifest resources, null contentType)                                                                                                                                                                                         |
| `packages/crawler/src/html-parser.ts`               | Added `extractStylesheetLinks()`, `extractManifestLink()`; extended `HtmlExtract` interface                                                                                                                                                                                                                    |
| `packages/crawler/src/html-parser.test.ts`          | Added 7 link extraction tests; re-added 13 script extraction tests (36 total)                                                                                                                                                                                                                                  |
| `packages/crawler/src/ssrf-guard.ts`                | Added `isResourceUrlAllowed(url, targetHostname)` export function                                                                                                                                                                                                                                              |
| `packages/crawler/src/index.ts`                     | Added `export { isResourceUrlAllowed }`                                                                                                                                                                                                                                                                        |
| `packages/crawler/src/http-crawler.ts`              | Added `DEFAULT_MAX_CSS_RESOURCES`, `DEFAULT_MAX_RESOURCE_BYTES` constants; extended `HttpCrawlerOptions` with `maxCssResources` and `maxResourceBytes`; added `isContentTypeCompatible()`, `observeResources()`, `fetchResource()` methods; updated `crawl()` to capture `extract` and call `observeResources` |
| `packages/crawler/src/http-crawler.test.ts`         | Fixed user-agent tests to capture headers from first fetch only; added 14 resource observation tests + 3 security tests (39 total)                                                                                                                                                                             |
| `packages/database/src/repository.test.ts`          | Updated `makeSnapshot()` to accept overrides; added 3 persistence tests; imported `snapshots` schema and `Resource` type                                                                                                                                                                                       |
| `packages/database/src/postgres-repository.test.ts` | Updated `makeSnapshot()` and JSONB assertion with new Resource fields                                                                                                                                                                                                                                          |
| `docs/architecture/crawler.md`                      | Added "Resource Observation (Step 6H)" section; updated constructor options table; updated "Does NOT" section; updated file structure                                                                                                                                                                          |
| `docs/architecture/persistence.md`                  | Updated `resources` column description; updated runtime evidence                                                                                                                                                                                                                                               |
| `docs/architecture/overview.md`                     | Updated crawler boundary description to mention resource observation                                                                                                                                                                                                                                           |
| `docs/Step6H.md`                                    | Formatted with Prettier (no content change)                                                                                                                                                                                                                                                                    |

## 11. Tests Added

| #   | Category    | Test                                                                                                                                                                      | File                   |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | Domain      | 4 new `Resource` tests (css, robots, manifest, null contentType)                                                                                                          | `snapshot.test.ts`     |
| 2   | Parser      | 7 link extraction tests (stylesheet links, manifest link, duplicates, relative, absolute, unrelated ignored)                                                              | `html-parser.test.ts`  |
| 3   | Crawler     | 14 resource observation tests (10–23: CSS, robots, manifest, content storage, failures, protocols, cross-origin, limits, dedup, timeout, missing robots/manifest, no CSS) | `http-crawler.test.ts` |
| 4   | Persistence | 3 tests (24: column exists, 25: includes resources, 26: round-trip)                                                                                                       | `repository.test.ts`   |
| 5   | Security    | 3 tests (27: cross-origin rejected, 28: redirect rejected, 29: data/js/blob rejected)                                                                                     | `http-crawler.test.ts` |

**Test results:** 349 passed, 9 skipped (2 skip-guarded PostgreSQL
integration tests + 2 skip-guarded web app integration tests).

## 12. Validation Results

| Check         | Command                                                                                                                                                                           | Result                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Build core    | `pnpm --filter @devlens/core build`                                                                                                                                               | ✅ OK                                                                          |
| Build crawler | `pnpm --filter @devlens/crawler build`                                                                                                                                            | ✅ OK                                                                          |
| Typecheck     | `pnpm typecheck`                                                                                                                                                                  | ✅ 10 projects, 0 errors                                                       |
| Tests         | `pnpm test`                                                                                                                                                                       | ✅ 349 passed, 9 skipped                                                       |
| Lint          | `pnpm lint`                                                                                                                                                                       | ✅ ESLint 0 errors, Prettier clean                                             |
| Build         | `pnpm build`                                                                                                                                                                      | ✅ All packages (core, detectors, crawler, application, database, web, worker) |
| Circular deps | `npx madge --circular --extensions ts,tsx --ts-config tsconfig.json packages/core/src packages/detectors/src packages/crawler/src packages/application/src packages/database/src` | ✅ No circular dependency found (75 files)                                     |

## 13. Remaining Gaps

- **PostgreSQL integration**: The 7 skip-guarded
  `postgres-repository.test.ts` tests (which verify JSONB round-trip
  for the extended `Resource` type against a live PostgreSQL) could not
  be executed — no `DATABASE_URL` is available in this environment.
  The in-memory repository tests (#24–26) cover the round-trip logic,
  and the JSONB column structure is identical to the existing `headers`
  and `detections` columns (which were validated against PostgreSQL in
  Step 5C).
- **No new migration created**: The `resources` JSONB column already
  existed in the initial migration. A `DEFAULT '[]'::jsonb` was not
  added for consistency with other JSONB columns (`html_meta_tags`,
  `html_scripts`) — this is a minor hardening that could be addressed
  in a future step if needed.
- **CSS `@import` rules**: Not followed (by design per spec). Only
  `<link rel="stylesheet">` hrefs are observed.
- **Manifest sub-resources**: Not followed (by design per spec). Only
  the manifest file itself is stored.

## 14. Next Step

**Step 6I — ResourceDetector**: Implement a `ResourceDetector` that
analyzes `SiteSnapshot.resources` for technology signatures. This would
extend the detector pipeline with a new detector that operates on the
observed resources (CSS, robots, manifest) — for example, detecting:

- Server technology from `robots.txt` patterns
- Site builders/CMS from CSS class conventions or asset naming
- Web app manifests for PWA detection

The `Resource` model, crawler observation, parser extraction, and
persistence are all in place — only the detection layer needs to be
added. The detector would follow the same `Detector` interface
(`detect(snapshot: SiteSnapshot): Detection[]`) and would be added to the
`CompositeDetector` chain in the application layer.
