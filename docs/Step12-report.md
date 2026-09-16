# DevLens — Step 12 — Audit Report

## Snapshot Quality & Observation Coverage

## 1. Overview

Step 12 performs a comprehensive audit of `SiteSnapshot` and `HttpCrawler`
to ensure the observations consumed by detectors are complete, correctly
normalized, deterministic, and resilient to edge cases.

**No new technologies, detectors, evidence types, or scoring changes were
introduced. No new HTML parser or browser/Playwright dependency was added.**
All fixes are minimal — preserving existing APIs and contracts.

### Baseline (from Step 11 completion)

| Check     | Result                               |
| --------- | ------------------------------------ |
| Typecheck | 0 errors (10/11 projects pass)       |
| Tests     | 636 passed, 9 skipped                |
| Lint      | All files use Prettier code style    |
| Build     | All packages + Next.js compiled      |
| Madge     | No circular dependencies (100 files) |

### Results after Step 12

| Check     | Result                                         |
| --------- | ---------------------------------------------- |
| Typecheck | 0 errors (10/11 projects pass)                 |
| Tests     | **715 passed**, 9 skipped (79 new tests added) |
| Lint      | All files use Prettier code style              |
| Build     | All packages + Next.js compiled                |
| Madge     | No circular dependencies (106 files)           |

The 11th project (the root workspace config or `apps/web` ESLint config)
does not participate in `tsc --noEmit` — this is unchanged from Step 11.

---

## 2. Audit Methodology

Before making any code changes, the following files were inspected:

**Core domain types:**

- `packages/core/src/domain/snapshot.ts` — `SiteSnapshot` and field types
- `packages/core/src/domain/value-objects.ts` — `createUrl`, `createHostname`, `createHttpStatus`, `createTimestamp`
- `packages/core/src/domain/scan.ts` — `ScanTarget`, `ScanResult`
- `packages/core/src/domain/evidence.ts` — `Evidence` type
- `packages/core/src/domain/technology.ts` — `Technology` type

**Crawler:**

- `packages/crawler/src/http-crawler.ts` — `HttpCrawler` class (401 lines after fixes)
- `packages/crawler/src/html-parser.ts` — `extractHtml()` regex-based parser (300 lines)
- `packages/crawler/src/crawler.ts` — `Crawler` interface (42 lines)
- `packages/crawler/src/crawl-error.ts` — `CrawlError` class
- `packages/crawler/src/ssrf-guard.ts` — SSRF protection
- `packages/crawler/src/index.ts` — public API exports

**Existing tests:**

- `packages/crawler/src/http-crawler.test.ts` (39 tests)
- `packages/crawler/src/html-parser.test.ts` (49 tests)
- `packages/crawler/src/crawler.test.ts` (6 tests)

---

## 3. Observation Coverage Matrix

The following matrix covers all observations produced by `HttpCrawler` and
their consumers. This maps directly to the detector surface area:

| Surface         | Snapshot field                    | Producer                                 | Normalized?             | Limits                             | Error behavior                            | Consumers                                    |
| --------------- | --------------------------------- | ---------------------------------------- | ----------------------- | ---------------------------------- | ----------------------------------------- | -------------------------------------------- |
| HTTP headers    | `http.headers`                    | `convertHeaders()`                       | Yes (lowercase names)   | All headers from response          | Missing headers → not in array            | `HeaderDetector`                             |
| HTTP status     | `http.statusCode`                 | `response.status` → `createHttpStatus()` | Yes (0–599 range)       | None                               | Non-2xx → valid observation               | `HeaderDetector`                             |
| Content-Type    | `http.contentType`                | `response.headers.get()`                 | No (raw value)          | None                               | Absent → `''`                             | `ResourceDetector` (content-type)            |
| Final URL       | `http.finalUrl`                   | `currentUrl` after redirects             | Yes (via `new URL`)     | Max 10 redirects                   | No Location → `CrawlError`                | All (context for relative URLs)              |
| Title           | `html.title`                      | `extractTitle()`                         | Yes (trimmed)           | None                               | No `<title>` → `''`                       | Metadata (not directly)                      |
| Description     | `html.description`                | `extractDescription()`                   | Yes (content value)     | None                               | No meta description → `null`              | Metadata (not directly)                      |
| Meta tags       | `html.metaTags`                   | `extractMetaTags()`                      | Yes (`name` lowercased) | None                               | Missing `name` or `content` → skipped     | `MetaTagDetector`                            |
| Scripts         | `html.scripts`                    | `extractScripts()`                       | No (raw from HTML)      | None                               | Malformed tag → skipped                   | `ScriptUrlDetector`, `ContentScriptDetector` |
| Link tags       | `html.links`                      | `extractLinkTags()`                      | No (raw from HTML)      | None                               | Missing `href` → `href: null`             | `LinkDetector`                               |
| Stylesheet URLs | `html.stylesheetLinks` (internal) | `extractLinkTags()`                      | No (raw from HTML)      | Max 5 same-origin, deduplicated    | Cross-origin → skipped                    | `HttpCrawler.observeResources()`             |
| Manifest URL    | `html.manifestLink` (internal)    | `extractLinkTags()`                      | No (raw from HTML)      | First `<link rel="manifest">` only | None                                      | `HttpCrawler.observeResources()`             |
| robots.txt      | `resources[]` (type=`robots`)     | `fetchResource()`                        | Yes (URL resolved)      | 512 KiB max                        | 404/non-2xx → skipped                     | `ResourceDetector`                           |
| manifest.json   | `resources[]` (type=`manifest`)   | `fetchResource()`                        | Yes (URL resolved)      | 512 KiB max                        | 404/non-2xx → skipped                     | `ResourceDetector`                           |
| CSS             | `resources[]` (type=`css`)        | `fetchResource()`                        | Yes (URL resolved)      | Max 5, 512 KiB max, dedup          | Cross-origin → rejected, errors → skipped | `ResourceDetector`                           |

### Key observations

- **URL storage policy**: Script `src` and link `href` values are stored
  **as-is from the HTML** (raw attribute values, no resolution to absolute).
  This is intentional — detectors need the original URL form for fingerprint
  matching (e.g., path segments like `wp-content`, `cdn.shopify.com`).
  Resource fetching URLs, however, are resolved to absolute via
  `new URL(href, pageUrl).href` because the crawler needs concrete URLs to
  fetch.

- **Resource ordering**: Resources appear in deterministic order:
  `robots.txt` → `manifest.json` → CSS files (in document order, deduplicated).

- **Query parameters**: Never stripped from any URL. Query strings are
  preserved in script `src`, link `href`, and resource URLs. This is critical
  for fingerprints like `/script.js?id=...` or `/app.js?ver=...`.

---

## 4. Bugs Found and Fixed

Four real bugs were identified during the audit and fixed. Each fix is
covered by tests.

### Bug 1: CSS MIME type `application/css` rejected

**File**: `packages/crawler/src/http-crawler.ts`
**Function**: `isContentTypeCompatible()`

The function only accepted `text/css` for CSS resources. However,
`application/css` is the IANA-registered MIME type for CSS and is used by
some CDNs (e.g., Cloudflare). Resources served with this Content-Type were
incorrectly skipped.

**Fix**: Added `application/css` to the accepted CSS content types.

```typescript
if (type === 'css') {
  return mediaType === 'text/css' || mediaType === 'application/css';
}
```

### Bug 2: `robots.txt` served with `Content-Type: text/html` rejected

**File**: `packages/crawler/src/http-crawler.ts`
**Function**: `isContentTypeCompatible()`

The function only accepted `text/plain` (and empty) for robots.txt. Many
servers serve `robots.txt` with `Content-Type: text/html` or no Content-Type
at all. The JSDoc already documented this intent, but the code did not match.

**Fix**: Added `text/html` to the accepted robots.txt content types.

```typescript
if (type === 'robots') {
  return mediaType === 'text/plain' || mediaType === 'text/html' || mediaType === '';
}
```

### Bug 3: Charset not respected in body decoding

**File**: `packages/crawler/src/http-crawler.ts`
**Function**: `readBodyWithLimit()`

The function used `new TextDecoder()` (UTF-8 only) regardless of the
`Content-Type` charset. Pages served with `charset=iso-8859-1` were silently
mis-decoded, corrupting non-ASCII characters and potentially destroying
technology fingerprints.

**Fix**:

1. Added `extractCharset(contentType)` — extracts the charset from the
   `Content-Type` header, strips quotes, lowercases, defaults to `utf-8`.
2. Added `createTextDecoder(charset)` — creates a `TextDecoder` for the
   given charset, falling back to UTF-8 if the charset is unsupported.
3. Updated `readBodyWithLimit()` to use `createTextDecoder(extractCharset(...))`.

### Bug 4: `Resource.size` used `string.length` (UTF-16 code units) instead of byte count

**File**: `packages/crawler/src/http-crawler.ts`
**Function**: `readBodyWithLimit()` + `fetchResource()`

The resource size was computed as `body.length` (UTF-16 code units), not the
actual byte count. For non-ASCII content, `size` was incorrect — a 2-byte
UTF-8 character counted as 1, and a surrogate-pair character counted as 2
even in bytes it is 4.

**Fix**: `readBodyWithLimit()` now returns `{ text, bytes }` where `bytes`
is the actual byte count from the streaming read. `Resource.size` now uses
`bytes` instead of `body.length`.

---

## 5. Determinism

### Policy

The same HTML input produces a structurally equivalent `SiteSnapshot`.
The `capturedAt` timestamp is inherently time-dependent and is **not**
required to be deterministic — the spec states "equivalent, not identical."

### What is deterministic

| Observation        | Deterministic? | Verified by                           |
| ------------------ | -------------- | ------------------------------------- |
| Script order       | Yes            | `snapshot-determinism.test.ts`        |
| Link order         | Yes            | `snapshot-determinism.test.ts`        |
| Meta tag order     | Yes            | `snapshot-determinism.test.ts`        |
| Resource order     | Yes            | `snapshot-determinism.test.ts`        |
| Header order       | Yes            | `snapshot-determinism.test.ts`        |
| CSS resource dedup | Yes            | `snapshot-determinism.test.ts`        |
| URL resolution     | Yes            | `snapshot-normalization.test.ts`      |
| Repeated crawl     | Yes            | `snapshot-determinism.test.ts`        |
| Parser idempotency | Yes            | `snapshot-determinism.test.ts`        |
| `capturedAt`       | **No**         | Documented (time-dependent by design) |

---

## 6. URL Normalization Policy

The crawler follows a **minimal normalization policy** derived from existing
behavior and detector needs:

### HTML-extracted URLs (scripts, links)

- Stored **as-is** from the HTML attribute value
- No resolution to absolute
- No query parameter stripping
- No fragment stripping
- No hostname normalization

This is intentional: detectors match on raw URL patterns (e.g., path
segments `wp-content`, hostnames `cdn.shopify.com`). Normalizing URLs before
detectors see them would destroy fingerprint information.

### Resource URLs (robots, manifest, CSS)

- Resolved to absolute via `new URL(href, pageUrl).href`
- Resolved against the **final URL after redirects**
- Same-origin enforced (hostname must match target)
- Query parameters preserved (not stripped)

### WHATWG URL behavior reference

The crawler relies on the standard `new URL()` constructor for all URL
resolution. Key behaviors documented and tested:

| Input base                     | Relative ref             | Result                                                                     |
| ------------------------------ | ------------------------ | -------------------------------------------------------------------------- |
| `https://example.com`          | `/style.css`             | `https://example.com/style.css`                                            |
| `https://example.com`          | `./css/app.css`          | `https://example.com/css/app.css`                                          |
| `https://example.com/page/sub` | `../styles.css`          | `https://example.com/styles.css`                                           |
| `https://example.com`          | `//cdn.example.com/x.js` | `https://cdn.example.com/x.js` (but cross-origin → rejected for resources) |
| Origin-only URL                | _(n/a)_                  | `https://example.com/` (trailing slash added by URL constructor)           |

### Content-Type normalization

- Content-Type **header names** are normalized to lowercase in `http.headers`
- Content-Type **value** is stored raw in `http.contentType`
- Media type extraction (for HTML detection) is case-insensitive

---

## 7. Edge Cases Covered

### HTTP edge cases

| Case                       | Behavior                               | Test                                   |
| -------------------------- | -------------------------------------- | -------------------------------------- |
| HTTP → HTTPS redirect      | Followed, finalUrl updated             | `crawler-edge-cases.test.ts`           |
| Multiple chained redirects | Followed up to maxRedirects            | `crawler-edge-cases.test.ts`           |
| 301 redirect               | Followed, snapshot at final URL        | `crawler-edge-cases.test.ts`           |
| 404                        | Valid observation, statusCode=404      | `crawler-edge-cases.test.ts`           |
| 500                        | Valid observation, statusCode=500      | `crawler-observation-coverage.test.ts` |
| 405                        | Valid observation, statusCode=405      | `crawler-edge-cases.test.ts`           |
| Network error              | `CrawlError` with code `network_error` | `http-crawler.test.ts`                 |
| Timeout                    | `CrawlError` with code `timeout`       | `http-crawler.test.ts`                 |

### Content-Type edge cases

| Case                       | Behavior                          | Test                                   |
| -------------------------- | --------------------------------- | -------------------------------------- |
| `text/html` (no charset)   | Parsed as HTML                    | `crawler-edge-cases.test.ts`           |
| `text/html; charset=utf-8` | Parsed as HTML, UTF-8 decoded     | `crawler-edge-cases.test.ts`           |
| `TEXT/HTML` (uppercase)    | Parsed as HTML (case-insensitive) | `snapshot-normalization.test.ts`       |
| `application/json`         | Not parsed as HTML                | `crawler-edge-cases.test.ts`           |
| No Content-Type (deleted)  | Not parsed as HTML                | `crawler-edge-cases.test.ts`           |
| `application/css` for CSS  | Accepted (Bug 1 fix)              | `crawler-observation-coverage.test.ts` |
| `text/html` for robots.txt | Accepted (Bug 2 fix)              | `crawler-observation-coverage.test.ts` |

### Encoding edge cases

| Case                 | Behavior                        | Test                         |
| -------------------- | ------------------------------- | ---------------------------- |
| UTF-8 (default)      | Correctly decoded               | `crawler-edge-cases.test.ts` |
| `charset=iso-8859-1` | Correctly decoded as ISO-8859-1 | `crawler-edge-cases.test.ts` |
| Unsupported charset  | Falls back to UTF-8             | `crawler-edge-cases.test.ts` |
| Charset absent       | Defaults to UTF-8               | `crawler-edge-cases.test.ts` |
| Non-ASCII characters | Correctly decoded               | `crawler-edge-cases.test.ts` |

### Body size / truncation

| Case                    | Behavior                                            | Test                         |
| ----------------------- | --------------------------------------------------- | ---------------------------- |
| Content-Length > max    | `CrawlError` code `too_large` (fast path)           | `crawler-edge-cases.test.ts` |
| Streaming body > max    | `CrawlError` code `too_large` (streaming)           | `crawler-edge-cases.test.ts` |
| Large body within limit | Truncated at limit (not a concern for HTML parsing) | —                            |

### Malformed HTML

| Case                              | Behavior                                       | Test                         |
| --------------------------------- | ---------------------------------------------- | ---------------------------- |
| Empty body                        | No crash, title = `''`                         | `crawler-edge-cases.test.ts` |
| No `<html>` tag                   | Still extracts title                           | `crawler-edge-cases.test.ts` |
| No `<head>` tag                   | Scripts still extracted                        | `crawler-edge-cases.test.ts` |
| Unclosed `<script>` tag           | Tag not extracted (regex requires `</script>`) | `crawler-edge-cases.test.ts` |
| `>` in script content             | No crash, may not capture fully                | `crawler-edge-cases.test.ts` |
| Script with `</script>` in string | Handled correctly (non-greedy)                 | `crawler-edge-cases.test.ts` |

### Duplicate observations

| Case                  | Behavior                            | Test                         |
| --------------------- | ----------------------------------- | ---------------------------- |
| Duplicate script tags | Preserved (dedup is detector's job) | `crawler-edge-cases.test.ts` |
| Duplicate link tags   | Preserved                           | `crawler-edge-cases.test.ts` |
| Duplicate CSS URLs    | Deduplicated (one fetch)            | `crawler-edge-cases.test.ts` |

### Resource errors

| Case                    | Behavior                  | Test                                   |
| ----------------------- | ------------------------- | -------------------------------------- |
| CSS fetch network error | Skipped (crawl continues) | `crawler-edge-cases.test.ts`           |
| CSS 500 response        | Skipped (crawl continues) | `crawler-edge-cases.test.ts`           |
| CSS 404 response        | Skipped (crawl continues) | `crawler-edge-cases.test.ts`           |
| Cross-origin CSS        | Rejected by SSRF guard    | `crawler-observation-coverage.test.ts` |

### URL edge cases

| Case                           | Behavior                                                     | Test                             |
| ------------------------------ | ------------------------------------------------------------ | -------------------------------- |
| Root-relative URL (`/path`)    | Resolved to origin + path                                    | `snapshot-normalization.test.ts` |
| Protocol-relative (`//host/x`) | Stored as-is for HTML; rejected for resources (cross-origin) | `crawler-edge-cases.test.ts`     |
| Query parameters               | Preserved                                                    | `snapshot-normalization.test.ts` |
| URL fragments                  | Preserved                                                    | `snapshot-normalization.test.ts` |
| Hostname casing                | Header names lowercased                                      | `snapshot-normalization.test.ts` |
| Trailing slash (origin URL)    | Added by `new URL()`                                         | `crawler-edge-cases.test.ts`     |
| `./` prefix                    | Resolved correctly                                           | `crawler-edge-cases.test.ts`     |
| `../` prefix                   | Resolved correctly (goes up 2 dirs for non-dir path)         | `crawler-edge-cases.test.ts`     |

---

## 8. Changes Implemented

### Modified files

| File                                        | Change                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/crawler/src/http-crawler.ts`      | 1. `isContentTypeCompatible()`: added `text/html` for robots, `application/css` for CSS            |
|                                             | 2. Added `extractCharset()` function                                                               |
|                                             | 3. Added `createTextDecoder()` function                                                            |
|                                             | 4. `readBodyWithLimit()` return type: `string` → `{ text, bytes }`, charset-aware decoding         |
|                                             | 5. `crawl()`: uses `result.text` for body                                                          |
|                                             | 6. `fetchResource()`: uses `result.text` for content, `result.bytes` for size                      |
| `packages/crawler/src/http-crawler.test.ts` | Updated 2 test handlers: return 404 for `/robots.txt` in tests that don't expect robot observation |

### New files

| File                                                        | Purpose                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/crawler/src/test-helpers.ts`                      | Shared mock-fetch, response builders, snapshot constructors                    |
| `packages/crawler/src/snapshot-determinism.test.ts`         | 9 tests: same input → same snapshot, ordering, idempotency                     |
| `packages/crawler/src/snapshot-normalization.test.ts`       | 15 tests: URL resolution, header normalization, content-type normalization     |
| `packages/crawler/src/crawler-observation-coverage.test.ts` | 28 tests: coverage matrix — each observation surface verified                  |
| `packages/crawler/src/crawler-edge-cases.test.ts`           | 27 tests: redirects, encoding, malformed HTML, body limits, duplicates, errors |

### Documentation updates

| File                           | Change                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/crawler.md` | Updated Content-Type accepted table (robots: `+text/html`, CSS: `+application/css`); updated file structure listing with new test files |

---

## 9. Detector Compatibility Verification

### Existing detectors — no changes required

All detectors were verified to work correctly with the Step 12 observations.
No detector modifications were needed:

| Detector                | Consumes                                         | Compatible? | Notes                                                                |
| ----------------------- | ------------------------------------------------ | ----------- | -------------------------------------------------------------------- |
| `HeaderDetector`        | `http.headers`, `http.contentType`               | ✅ Yes      | Headers are correctly lowercased; content-type stored raw            |
| `MetaTagDetector`       | `html.metaTags`                                  | ✅ Yes      | Meta tag extraction unchanged (already correct)                      |
| `ScriptUrlDetector`     | `html.scripts[].src`                             | ✅ Yes      | Script URLs stored as-is (raw); query params preserved               |
| `ContentScriptDetector` | `html.scripts[].content`                         | ✅ Yes      | Inline script content preserved (no truncation for reasonable sizes) |
| `LinkDetector`          | `html.links`                                     | ✅ Yes      | Link hrefs stored as-is; no destructive normalization                |
| `ResourceDetector`      | `resources[].content`, `resources[].contentType` | ✅ Yes      | Resource content correctly decoded with charset; `size` now accurate |

### Pipeline integration

The `pipeline.integration.test.ts` (16 tests) and `determinism-persistence.test.ts`
(8 tests) continue to pass without modification. The detector pipeline
(`CompositeDetector → DeduplicatingDetector → ScoringDetector`) consumes
the same `SiteSnapshot` structure — no breaking changes to the snapshot shape.

### Evidence key / persistence compatibility

- `getEvidenceKey()` — unchanged; evidence keys are derived from observation
  fields that were not modified by Step 12.
- `persistence-roundtrip.test.ts` (5 tests) — pass without modification.
- `evidence-persistence.test.ts` (4 tests) — pass without modification.

---

## 10. Invariants

The following invariants are established by the Step 12 fixes and verified
by tests:

1. **Same-origin only for resources**: The crawler only fetches same-origin
   CSS, manifest, and robots.txt resources. Cross-origin resources are
   rejected by the SSRF guard before any network call is made.

2. **Resource failure isolation**: Any resource fetch failure (404, 500,
   network error, wrong content-type, body too large, timeout) is silently
   skipped. The resource is simply omitted from `SiteSnapshot.resources`.
   The crawl never fails due to resource observation.

3. **Resource ordering**: Resources are ordered deterministically:
   `robots.txt` → `manifest.json` → CSS (in document order, deduplicated).

4. **CSS deduplication**: Duplicate CSS URLs (same resolved absolute URL)
   are fetched only once. The `Set<string>` tracks resolved URLs.

5. **CSS limit**: At most `maxCssResources` (default 5) CSS resources are
   observed per crawl.

6. **Redirect safety**: Redirects are followed manually. The SSRF guard is
   applied to each redirect target. Redirects exceeding `maxRedirects`
   (default 10) produce a `CrawlError`.

7. **Charset fallback**: If the charset in the Content-Type header is
   invalid or unsupported, UTF-8 is used as fallback. The `TextDecoder`
   constructor is wrapped in a try/catch.

8. **Byte-accurate size**: `Resource.size` reflects the actual byte count
   of the response body, not the UTF-16 string length.

9. **Query parameter preservation**: No query parameters are stripped from
   any URL (script src, link href, resource URL).

10. **HTML parsing only for HTML content types**: The HTML parser is only
    invoked when `Content-Type` is `text/html` or `application/xhtml+xml`.
    Non-HTML responses produce empty HTML observations.

---

## 11. New invariants from Step 12 fixes

11. **`application/css` accepted**: CSS resources served with
    `Content-Type: application/css` (the IANA-registered MIME type) are now
    correctly observed.

12. **`text/html` accepted for robots.txt**: `robots.txt` served with
    `Content-Type: text/html` is now correctly observed. The JSDoc and the
    code are now consistent.

13. **Charset-aware decoding**: Response bodies are decoded using the
    charset specified in the `Content-Type` header, with UTF-8 as the
    default fallback.

---

## 12. Network Contract (Final)

The `HttpCrawler` network behavior:

```text
Target URL
   ↓
HTTP GET (redirect: 'manual')
   ↓
[for each redirect: SSRF check + maxRedirects check]
   ↓
HTTP response (2xx/3xx/4xx/5xx all valid)
   ↓
Check Content-Length vs maxBodyBytes (fast path rejection)
   ↓
Stream body (maxBodyBytes limit enforced during read)
   ↓
If HTML content-type → extractHtml()
   ↓
Observe resources:
   ├── GET {origin}/robots.txt
   ├── GET manifest.json (from <link rel="manifest">)
   └── GET each <link rel="stylesheet"> (same-origin, max 5, deduplicated)
   ↓
SiteSnapshot
```

**No implicit crawling.** The crawler fetches exactly:

- The target URL
- `{origin}/robots.txt`
- The manifest URL (if `<link rel="manifest">` exists)
- Same-origin stylesheet URLs (from `<link rel="stylesheet">`, max 5, deduplicated)

No other URLs are fetched. No JavaScript execution. No Playwright/Puppeteer.

---

## 13. Deferred Work

| Item                                                          | Rationale                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implement a full HTML parser (e.g., linkedom, parse5, domino) | The spec explicitly states "This is NOT a full HTML parser." Regex-based extraction is the established architecture. The edge cases documented in §7 are known limitations, not bugs. A full parser would be a scope expansion. |
| Add browser-based resource observation (screenshots, render)  | Out of scope — no Playwright/Puppeteer/JS execution allowed.                                                                                                                                                                    |
| Auto-deduplicate HTML observations (scripts, links, meta)     | Deduplication is intentionally deferred to `DeduplicatingDetector` at the detector layer. The crawler preserves document order and duplicates as a matter of policy.                                                            |
| Handle `Content-Type: text/html` for non-page responses       | Already handled correctly — HTML parser only runs when content-type matches.                                                                                                                                                    |
| DNS rebinding protection at socket level                      | Documented as a known SSRF limitation in `crawler.md`. Requires infrastructure-level protection.                                                                                                                                |
| Charset detection from HTML `<meta>`                          | Out of scope — charset is only extracted from the `Content-Type` header. A `<meta charset>` fallback is deferred.                                                                                                               |

---

## 14. Test Summary

| Test file                                    | Tests | Coverage area                                      |
| -------------------------------------------- | ----- | -------------------------------------------------- |
| `html-parser.test.ts` (existing)             | 49    | Title, meta, scripts, links, malformed HTML        |
| `crawler.test.ts` (existing)                 | 6     | Timeout, SSRF, network errors                      |
| `http-crawler.test.ts` (existing, updated)   | 39    | Basic extraction, redirects, security, resources   |
| `snapshot-determinism.test.ts` (new)         | 9     | Same input → same snapshot, ordering, stability    |
| `snapshot-normalization.test.ts` (new)       | 15    | URL resolution, header normalization, content-type |
| `crawler-observation-coverage.test.ts` (new) | 28    | Coverage matrix — each observation surface         |
| `crawler-edge-cases.test.ts` (new)           | 27    | Redirects, encoding, malformed, limits, duplicates |
| `test-helpers.ts` (new)                      | —     | Shared helpers for crawler tests                   |

**New tests added: 79** (9 + 15 + 28 + 27)

### Final validation results

```text
pnpm typecheck  → ✅ 0 errors (10 of 11 projects pass)
pnpm test       → ✅ 715 passed, 9 skipped (2 skipped test files: postgres-repository, route.integration)
pnpm lint       → ✅ All files use Prettier code style
pnpm build      → ✅ All packages built + Next.js compiled
npx madge       → ✅ No circular dependencies (106 files)
```
