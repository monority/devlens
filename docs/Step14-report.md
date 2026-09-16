# Step 14 — Detection Engine Hardening & Architecture Audit

## Executive Summary

The Step 14 audit examined the DevLens codebase's package boundaries, dependency
direction, detector pipeline, error handling, determinism, mutation safety,
performance characteristics, matchers, technology catalog, evidence model,
scoring, deduplication, configuration, test architecture, dead code, persistence
boundary, API boundary, error model, and documentation consistency.

**The architecture is fundamentally sound.** The layered dependency direction
is clean (core ← {detectors, crawler} ← application ← database ← {web, worker}).
No circular dependencies exist. The detection pipeline is deterministic,
mutation-free, and correctly isolates errors. The evidence model, scoring formula,
and deduplication semantics are well-defined and consistent.

Three real issues were identified and fixed with minimal changes:

1. **P1 — Pipeline construction duplication** (`route.ts` and `main.ts`): The
   full `ScoringDetector(DeduplicatingDetector(CompositeDetector([...])))` pipeline
   was hand-constructed in two places. Extracted into `createProductionDetector()`
   in the `detectors` package — a single source of truth.

2. **P2 — Dead public API in `application/index.ts`**: Seven detector class
   re-exports (`Detector` type, `NullDetector`, `CompositeDetector`,
   `MetaTagDetector`, `ScriptUrlDetector`, `ContentScriptDetector`,
   `DeduplicatingDetector`) were exposed from `@devlens/application` but never
   imported by any consumer. Removed.

3. **P2 — Stale JSDoc and documentation**: Three JSDoc comments in
   `resource-detector.ts` and `link-detector.ts` claimed deduplication used
   `JSON.stringify` when the code actually uses `getEvidenceKey`. Multiple
   architecture docs had stale test counts, missing evidence variants, stale
   worker wiring examples, and duplicate/missing file entries. All corrected.

No scoring formula changes, no new technologies, no new evidence types,
no new detector types were introduced. The result is a small diff (3 source
files modified, 1 new source file + 1 new test file, 5 documentation files
updated).

---

## Current Architecture

```text
apps
 ├── web                    # Next.js 15 app router; POST /api/scans
 │   └── src/app/api/scans/
 │       ├── route.ts       # Thin HTTP adapter
 │       ├── handler.ts     # Pure handler (validation + executeScan)
 │       └── route.test.ts  # 15 tests
 └── worker                 # Standalone Node.js scan runner
     └── src/main.ts        # Demo scan + createProductionDetector()

packages
 ├── core            # Pure domain (0 deps)
 ├── config          # Reserved stub (0 deps)
 ├── validation      # Reserved stub (0 deps)
 ├── analyzer        # Reserved stub (depends core)
 ├── crawler         # Crawler interface + HttpCrawler (depends core)
 ├── detectors       # 6 detectors + catalog + scorer + factory (depends core)
 ├── application     # runScan / executeScan / persistResult (depends core, crawler, detectors)
 ├── database        # InMemory + Postgres repos (depends core, application)
 ├── web             # (apps/web)
 └── worker          # (apps/worker)
```

Dependency direction:

```text
web / worker
  ↓
application
  ↓         ↓           ↓
crawler  core      detectors
  ↓         ↓           ↓
core     core        core
```

`database` depends on `application` (implements `ScanResultRepository`
contract) and `core`. `database` has `detectors` as a devDependency only
(used in test files). No upward dependencies.

---

## Package Boundaries

| Package       | Responsibility            | Depends on (runtime)                             | Public API                                                                                                                                                                      | Side effects                                     |
| ------------- | ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `core`        | Domain model & invariants | — (none)                                         | Value objects, Scan, Technology, Detection, Evidence, SiteSnapshot                                                                                                              | None (pure)                                      |
| `crawler`     | Crawl + HTML extraction   | `core`                                           | `Crawler` interface, `HttpCrawler`, `CrawlError`, `extractHtml`, `isBlockedHostname`                                                                                            | Network (SSR)                                    |
| `detectors`   | Technology detection      | `core`                                           | `Detector` interface, 6 detector classes, `CompositeDetector`, `DeduplicatingDetector`, `ScoringDetector`, `ConfidenceScorer`, `TECHNOLOGY_CATALOG`, `createProductionDetector` | None (pure)                                      |
| `application` | Scan orchestration        | `core`, `crawler`, `detectors`                   | `runScan`, `executeScan`, `persistResult`, `ScanResult`, `ScanResultRepository`                                                                                                 | None (pure orchestration; persistence delegated) |
| `database`    | Persistence (in-mem + PG) | `core`, `application`, `drizzle-orm`, `postgres` | `InMemoryScanResultRepository`, `PostgresScanResultRepository`, `createDatabaseClient`                                                                                          | DB writes (production)                           |
| `analyzer`    | Reserved                  | `core`                                           | — (stub: `export {};`)                                                                                                                                                          | None                                             |
| `config`      | Reserved                  | —                                                | — (stub)                                                                                                                                                                        | None                                             |
| `validation`  | Reserved                  | —                                                | — (stub)                                                                                                                                                                        | None                                             |

No violations of layer separation were found. The `database` package correctly
depends downward on `application` for the `ScanResultRepository` interface
(Dependency Inversion Principle), and does not leak Drizzle or postgres types
into the application or core layers.

The `database` package lists `@devlens/detectors` as a `devDependencies` entry —
this is used only by test files (`evidence-persistence.test.ts`,
`persistence-roundtrip.test.ts`) to construct test detections. This is
appropriate and does not violate the dependency direction (devDependencies are
not runtime dependencies).

---

## Dependency Direction

Verified with `npx madge --circular --extensions ts packages apps`:

```text
Processed 146 files (1.5s) (2 warnings)
√ No circular dependency found!
```

The 2 warnings are non-critical (madge informational warnings about
`import type` patterns). Zero circular dependencies.

The dependency graph is strictly acyclic and follows the intended layered
architecture:

- `core` ← zero imports upward or sideways
- `crawler` ← imports only `core`
- `detectors` ← imports only `core`
- `application` ← imports `core`, `crawler`, `detectors` (all downward)
- `database` ← imports `core`, `application` (downward), plus `drizzle-orm`
  and `postgres` (runtime-only in `client.ts`)
- `web` / `worker` ← import all packages below as needed

No `core` import of Next.js, no `core` import of Drizzle, no `core` import of
Node.js-specific modules. No `detectors` import of Next.js or database drivers.

---

## Public APIs

### `@devlens/detectors` (index.ts — 14 exports)

| Export                     | Type      | Publicly used by                                             |
| -------------------------- | --------- | ------------------------------------------------------------ |
| `Detector` (type)          | Interface | `application`, `web/handler.ts`, `web/route.test.ts`         |
| `NullDetector`             | Class     | Tests only (composite-detector.test.ts)                      |
| `HeaderDetector`           | Class     | Re-exported; used via `createProductionDetector`             |
| `MetaTagDetector`          | Class     | Re-exported; used via `createProductionDetector`             |
| `ScriptUrlDetector`        | Class     | Re-exported; used via `createProductionDetector`             |
| `ContentScriptDetector`    | Class     | Re-exported; used via `createProductionDetector`             |
| `ResourceDetector`         | Class     | Re-exported; used via `createProductionDetector`             |
| `LinkDetector`             | Class     | Re-exported; used via `createProductionDetector`             |
| `CompositeDetector`        | Class     | Tests; used via `createProductionDetector`                   |
| `DeduplicatingDetector`    | Class     | Tests; used via `createProductionDetector`                   |
| `DetectionScorer` (type)   | Interface | Tests                                                        |
| `ConfidenceScorer`         | Class     | Used via `createProductionDetector`                          |
| `ScoringDetector`          | Class     | Tests; used via `createProductionDetector`                   |
| `CatalogEntry` (type)      | Interface | `technology-catalog.test.ts`                                 |
| `TECHNOLOGY_CATALOG`       | Const     | `technology-catalog.test.ts`, `technology-collision.test.ts` |
| `TECHNOLOGY_IDS`           | Const     | `technology-catalog.test.ts`                                 |
| `TECHNOLOGY_CATEGORIES`    | Const     | (exported, minimal external use)                             |
| `getTechnology`            | Function  | All detectors (internal)                                     |
| `createProductionDetector` | Function  | `apps/web/route.ts`, `apps/worker/main.ts`                   |

The `getEvidenceKey` function is **intentionally not exported** from the public
API — it is an internal deduplication mechanism. This is correct.

The `clampConfidence` function is also **not exported** — internal to
`detection-scorer.ts`. Correct.

### `@devlens/application` (index.ts — 5 exports)

| Export                        | Type      | Used by                                                                        |
| ----------------------------- | --------- | ------------------------------------------------------------------------------ |
| `runScan`                     | Function  | `web/handler.ts`, `worker/main.ts`, `execute-scan.ts`                          |
| `ScanResult` (type)           | Interface | `web/handler.ts`, `web/route.test.ts`, `worker/main.ts`, `worker/main.test.ts` |
| `persistResult`               | Function  | `web/handler.ts`, `worker/main.ts`                                             |
| `ScanResultRepository` (type) | Interface | `web/handler.ts`, `database/*`                                                 |
| `executeScan`                 | Function  | `web/handler.ts`, `database/*` tests                                           |

**Fixed (P2)**: Previously, this public API also re-exported 7 detector classes
from `@devlens/detectors` (`Detector` type, `NullDetector`, `CompositeDetector`,
`MetaTagDetector`, `ScriptUrlDetector`, `ContentScriptDetector`,
`DeduplicatingDetector`). A grep across all `packages/` and `apps/` confirmed
that **no file** — production or test — imported any of these from
`@devlens/application`. Both `route.ts` and `main.ts` imported detector classes
directly from `@devlens/detectors`. These re-exports were dead code: an
incomplete facade that could mislead consumers into importing concrete detector
implementations from the application layer.

### `@devlens/core` (index.ts — 6 module re-exports)

All re-exports are used externally. No dead exports found.

### `@devlens/database` (index.ts — 3 exports)

`InMemoryScanResultRepository`, `PostgresScanResultRepository`,
`createDatabaseClient`. All used. The `Database` type and schema exports
are also available but only used internally and in tests.

---

## Detector Contract

**Interface** (`packages/detectors/src/detector.ts`):

```typescript
interface Detector {
  detect(snapshot: SiteSnapshot): Detection[];
}
```

- **Input**: an immutable `SiteSnapshot` (HTTP headers, HTML observations,
  resources).
- **Output**: `Detection[]` (possibly empty).
- **Synchronism**: Synchronous. No `Promise`, no `async`.
- **Side effects**: None. The snapshot is read but never mutated.
- **Determinism**: All six concrete detectors use static signature tables
  and linear iteration — no randomness, no network, no timestamps.
- **Dependencies**: Each detector depends only on `@devlens/core` domain
  types and the `TechnologyCatalog` (via `getTechnology`). No detector
  imports from another detector.
- **Error policy**: The `Detector` interface does not define an error
  contract. Individual detectors use `try/catch` internally for per-item
  errors (e.g., `new URL()` in `LinkDetector`) and return `false` on
  parse failure. No concrete detector currently throws under normal
  operation — they all return `[]` or skip invalid items. The `NullDetector`
  always returns `[]`.

**No-throw guarantee verified**: All six concrete detectors guard against
malformed input with `try/catch` around `new URL()` calls and `.find()`
with safe fallbacks. The `createDetection` factory enforces ≥1 evidence
item at construction time.

---

## Pipeline Audit

**Pipeline** (as defined by `createProductionDetector()`):

```text
CompositeDetector([HeaderDetector, MetaTagDetector, ScriptUrlDetector,
  ContentScriptDetector, ResourceDetector, LinkDetector])
  → produces Detection[] (with duplicates per technology)
DeduplicatingDetector(CompositeDetector(...))
  → produces one Detection per technology
ScoringDetector(DeduplicatingDetector(...), ConfidenceScorer())
  → produces final scored + ranked Detection[]
```

### CompositeDetector

- Sub-detectors are stored in a `ReadonlyArray<Detector>` and iterated in
  declaration order. The order is **significant** — detections from
  earlier detectors appear before later ones in the concatenated result.
- **No error isolation**: if any sub-detector throws, `CompositeDetector`
  propagates the error immediately. Remaining sub-detectors do not run.
  This matches the `runScan` contract: a throwing detector causes the entire
  scan to fail via `toScanError` → `ScanError{ code: 'UNKNOWN_ERROR' }`.
- **No deduplication**: `CompositeDetector` does not deduplicate. It
  concatenates results. Cross-detector deduplication is `DeduplicatingDetector`'s
  responsibility.
- **No mutation**: creates a new `Detection[]` and `push`es into it. The
  `SiteSnapshot` is not touched.
- **Documented**: `docs/architecture/detectors.md` §4 (CompositeDetector)
  accurately describes the ordering, error policy, and deduplication semantics.

### Ordering significance

The sub-detector order matters for `DeduplicatingDetector` tie-breaking
("first detection in wrapped-detector order wins on confidence ties"). The
order is `Header → MetaTag → ScriptUrl → ContentScript → Resource → Link`.
This is documented in `detectors.md` and is consistent across both entry
points (verified: both `route.ts` and `main.ts` now use `createProductionDetector()`).

**Fixed (P1)**: Previously, the pipeline order could silently diverge between
`route.ts` and `main.ts` if one was modified without the other. Now both
call `createProductionDetector()`, which is the single source of truth.

### Error isolation behavior

**Current behavior (documented, not changed)**: A throwing sub-detector
in `CompositeDetector` propagates immediately. There is no try/catch around
individual detectors, so Detector B's failure prevents Detector C from
running. This is a **fail-fast** strategy — the entire scan is marked
`failed`.

This is acceptable for the current scope because:

1. No concrete detector throws under normal operation (all use internal
   `try/catch` for risky operations like `new URL()`).
2. A throwing detector indicates a programming error (invariant violation),
   not a transient failure.
3. The `runScan` → `toScanError` → `ScanError{ code: 'UNKNOWN_ERROR' }`
   translation ensures the scan is marked failed cleanly.

No change was made — this is the existing, documented behavior.

---

## Error Handling

### Error inventory

| Component                   | Error type                                                                      | How handled                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Crawler                     | `CrawlError` (codes: `invalid_target`, `timeout`, `network_error`, `too_large`) | Thrown by `HttpCrawler`; caught by `runScan` → `toScanError` → `ScanError` with preserved code                 |
| URL validation              | `EMPTY_URL` (throws `Error`)                                                    | Caught in `createScan` → propagates as domain error                                                            |
| `createScanId`              | `Error` (empty string)                                                          | Propagates from `createScan`                                                                                   |
| `createUrl`                 | `Error` (empty/invalid URL)                                                     | Propagates from `createScan`                                                                                   |
| `createHostname`            | `Error` (empty hostname)                                                        | Propagates from `createScan`                                                                                   |
| `createConfidence`          | `Error` (out of [0,100] range)                                                  | Propagates at detection construction                                                                           |
| `getTechnology`             | `Error` (unknown ID)                                                            | Propagates from detector                                                                                       |
| Unexpected (non-CrawlError) | `Error`                                                                         | Caught by `runScan` → `ScanError{ code: 'UNKNOWN_ERROR' }`                                                     |
| Persistence failure         | Drizzle/Postgres error                                                          | Propagates as infrastructure error (NOT a `ScanError`); caught at top level in worker (`process.exitCode = 1`) |
| API handler                 | `{ code, message }` plain object (from `validateUrl`)                           | Caught via try/catch in `handleCreateScan` → returned as 400                                                   |
| API infrastructure failure  | `Error`                                                                         | Caught → returned as 500 with generic message (no leak)                                                        |

### Error model consistency

The error model is **coherent**: domain-level errors (`CrawlError`,
`UNKNOWN_ERROR`) produce completed-but-failed scans (HTTP 200 with
`scan.status: "failed"`). Infrastructure errors (persistence) produce
HTTP 500. URL validation errors produce HTTP 400. No errors are silently
swallowed with `return null` or bare `catch {}`.

**Observation**: `handler.ts:287` uses `console.error` for logging unexpected
errors. This is acceptable for a handler-level catch-all and does not mask
errors — it logs them before returning the 500 response.

**Observation**: `validateUrl` in `handler.ts` throws a plain object
(`{ code: 'MALFORMED_JSON', message: ... }`) rather than an `Error` instance.
This is caught by the `try/catch` in `handleCreateScan` and handled
correctly. While not ideal from a purity standpoint, it is a deliberate
design choice — the handler uses plain objects for its error codes to
avoid `instanceof` checks and keep the error model flat. This is
documented in `docs/architecture/api.md`. No change needed.

---

## Determinism

The Step 13 golden-fixture suite (109 tests) established functional
determinism. The Step 14 audit verified **why** it is deterministic:

### Sources of determinism

1. **Static signature tables**: All six detectors use `readonly` arrays of
   static signatures. No dynamic loading, no environment-dependent values.

2. **Stable iteration order**: `SiteSnapshot` arrays (`headers`, `metaTags`,
   `scripts`, `links`, `resources`) are `ReadonlyArray` — they iterate in
   insertion (document) order.

3. **`Map` for grouping**: `DeduplicatingDetector` and per-technology merging
   in `ResourceDetector`/`LinkDetector` use `Map<string, ...>` with an
   explicit `order: string[]` array to preserve first-appearance order.
   `Map` insertion order is deterministic in JavaScript (and Vitest/Node).

4. **Canonical evidence key**: `getEvidenceKey()` produces stable,
   property-order-independent keys (format: `type|field1|field2|...`)
   using `String(url).toLowerCase()` for URL fields. Used for dedup and
   canonical sorting in `DeduplicatingDetector`.

5. **Scoring is deterministic**: `ConfidenceScorer.score()` uses a pure
   formula (`base + min(10, max(0, n-1) * 5)`) with no randomness.

6. **Ranking is deterministic**: `ScoringDetector.#rank()` sorts by
   `confidence DESC, technology.id ASC` — `technology.id` provides a
   stable tie-breaker independent of insertion order.

### No nondeterminism sources found

- No `Math.random()` in the detection pipeline.
- No `Date.now()` in detection or scoring.
- No `Set` used as a dedup mechanism (all use `Set<string>` for seen-keys,
  but the actual evidence is stored in ordered arrays).
- No filesystem traversal in detectors.
- `JSON.stringify` is NOT used as a dedup key anywhere in the detection
  pipeline.
- No async execution in the detector layer — `CompositeDetector.detect()`
  is synchronous.

---

## Mutation

A systematic audit was performed of all array/object mutations across the
detection pipeline:

| Component                             | Mutation pattern          | Mutates input?                                  |
| ------------------------------------- | ------------------------- | ----------------------------------------------- |
| `CompositeDetector.detect`            | `detections.push(...)`    | Creates new array; snapshot not touched ✅      |
| `DeduplicatingDetector.detect`        | `merged.sort()`           | Sorts a locally-created array ✅                |
| `ScoringDetector.detect`              | `[...detections].sort()`  | Copies before sort ✅                           |
| `ScoringDetector.#rank`               | `[...detections].sort()`  | Copies before sort ✅                           |
| `ConfidenceScorer.score`              | `[...detection.evidence]` | Creates new Detection with copied evidence ✅   |
| `ResourceDetector.selectBestAndMerge` | `merged.push(...)`        | Creates new array; input matches not mutated ✅ |
| `LinkDetector.selectBestAndMerge`     | `merged.push(...)`        | Creates new array; input matches not mutated ✅ |
| `HeaderDetector.detect`               | `detections.push(...)`    | Creates new array ✅                            |
| `MetaTagDetector.detect`              | `detections.push(...)`    | Creates new array ✅                            |
| `ScriptUrlDetector.detect`            | `detections.push(...)`    | Creates new array ✅                            |
| `ContentScriptDetector.detect`        | `detections.push(...)`    | Creates new array ✅                            |

**Result: No mutations of input data found.** The pipeline operates on
immutable data throughout. The `ScoringDetector.#rank` and
`ConfidenceScorer.score` both correctly use `[...arr].sort()` to create
copies before sorting. The `DeduplicatingDetector` sorts a locally-created
merged evidence array, not the input.

One subtlety: `LinkDetector.detect()` reads `snapshot.html.links` and
`snapshot.url` — these are accessed via `snapshot.html.links` (a
`ReadonlyArray`). The `detect` method only iterates this array; it does
not push to it.

---

## Performance

### Detector complexity

| Detector                | Algorithm                                              | Complexity                        |
| ----------------------- | ------------------------------------------------------ | --------------------------------- |
| `HeaderDetector`        | Linear scan: headers × signatures                      | O(H × S) where H ≤ ~30, S = 4     |
| `MetaTagDetector`       | Linear scan: metaTags × signatures                     | O(M × S) where M ≤ ~20, S = 7     |
| `ScriptUrlDetector`     | Linear scan: scripts × signatures                      | O(SC × S) where SC ≤ ~100, S = 8  |
| `ContentScriptDetector` | Linear scan: scripts × signatures, substring match     | O(SC × S) where SC ≤ ~100, S = 14 |
| `ResourceDetector`      | Linear scan: signatures, `.find()` per signature       | O(S × R) where R ≤ ~10, S = 6     |
| `LinkDetector`          | Nested loop: signatures × links, `new URL()` per match | O(L × S) where L ≤ ~50, S = 6     |
| `CompositeDetector`     | Concatenates sub-detector results                      | O(total detections)               |
| `DeduplicatingDetector` | Map grouping + evidence merge + sort                   | O(D + E log E)                    |
| `ScoringDetector`       | Per-detection scoring + sort                           | O(D × sources + D log D)          |

### Observations

- **No regex compilation per invocation**: Signature matching uses
  `String.includes()` and `String.toLowerCase().includes()` — no `new
RegExp` in any detector. ✅
- **No JSON.stringify in detection**: `getEvidenceKey` is used instead. ✅
- **No repeated HTML parsing**: The crawler's `extractHtml()` runs once
  per crawl; detectors read the already-parsed `HtmlObservation`. ✅
- **LinkDetector `new URL()` overhead**: Each link is resolved with
  `new URL()` once per signature that could match it. With 6 signatures
  and 50 links, that's up to 300 `new URL()` calls. This is acceptable
  for current page sizes but is the most expensive detector per-link. ⚠️
  (Deferred — would require caching resolved URLs per link, but the
  current complexity is O(L × S) which is fine for typical pages.)
- **`getAttribute` regex recompilation** (crawler `html-parser.ts`): The
  `getAttribute` function compiles a `new RegExp` on every call
  (line 80-84). It is called once per attribute per meta/script/link tag
  in the HTML. The regex pattern is safe (no catastrophic backtracking —
  uses negated character classes `[^"]*` and `[^']*`), but compilation
  is repeated unnecessarily. ✅ (P2 — minor overhead, bounded input size.
  Could be pre-compiled per attribute name, but not worth the change
  for current HTML sizes.)

### Summary

No performance issues rise to P0 or P1 severity. The `getAttribute` regex
recompilation is a P2 code-quality nit (documented but not fixed — the
inputs are bounded HTML tag attribute strings, and the regex is not
catastrophic). The `LinkDetector`'s per-link `new URL()` is documented
but acceptable.

---

## Matcher Audit

### HeaderDetector (5 signatures)

| Signature               | Match method                          | Precision | FP risk                                                  | FN risk |
| ----------------------- | ------------------------------------- | --------- | -------------------------------------------------------- | ------- |
| `Server: nginx`         | `includes('nginx')` case-insensitive  | High      | `Server: not-nginx/1.0` matches ✅                       | Low     |
| `Server: apache`        | `includes('apache')` case-insensitive | High      | Low                                                      | Low     |
| `Server: microsoft-iis` | `includes('microsoft-iis')`           | High      | Low                                                      | Low     |
| `X-Powered-By: express` | `includes('express')`                 | Medium    | `X-Powered-By: SomeExpressFramework` → false positive ⚠️ | Low     |
| `X-Powered-By: php`     | `includes('php')`                     | Medium    | `X-Powered-By: SomePHPFramework` → false positive ⚠️     | Low     |

No regex used. All substring matching on HTTP header values. The `X-Powered-By`
matches are intentionally permissive (documented limitation in `detectors.md`).

### MetaTagDetector (7 signatures)

| Signature                           | Match method               | Precision | FP risk                          |
| ----------------------------------- | -------------------------- | --------- | -------------------------------- |
| `generator: WordPress`              | `toLowerCase().includes()` | High      | Low — "WordPress" is distinctive |
| `generator: Hugo/Jekyll/Ghost`      | Same                       | High      | Low                              |
| `generator: Next.js/Gatsby/Nuxt.js` | Same                       | High      | Low                              |

Case-insensitive substring. No regex. No issues found.

### ScriptUrlDetector (8 signatures)

| Signature                   | Match method                  | Precision | FP risk                                                                          |
| --------------------------- | ----------------------------- | --------- | -------------------------------------------------------------------------------- |
| `wp-content`, `wp-includes` | `includes()` case-insensitive | High      | Low                                                                              |
| `/_next/`, `/_nuxt/`        | `includes()`                  | High      | Path-boundary risk (e.g. `my-_next/` — unlikely but possible ⚠️)                 |
| `gatsby`                    | `includes()`                  | Medium    | `gatsby` substring in any URL (e.g. `gatsby-plugins.js` on a non-Gatsby site) ⚠️ |
| `jquery`                    | `includes()`                  | High      | Low — well-known CDN path                                                        |
| `bootstrap`                 | `includes()`                  | High      | Low                                                                              |
| `lodash`                    | `includes()`                  | High      | Low                                                                              |

**Finding (P2)**: The `/_next/` signature uses plain `String.includes()` — it
does not enforce a path boundary. A URL like `https://example.com/my-_next-/lib.js`
would match. The `false-positive-next-substring` golden fixture
(`next-navigation.js`) correctly does NOT match because the signature is `/_next/`
with slashes. But the substring risk remains for URLs that happen to contain
`/_next/` as a substring of a larger path segment.

This is a **known, documented limitation** of the current substring-based
approach. The Step 13 golden tests validate the expected behavior. No change
was made — changing the matcher to use path-segment matching would alter
detection behavior and potentially break existing golden tests, violating
the "don't modify fingerprints" principle.

### ContentScriptDetector (13 signatures)

| Signature                        | Match method | Precision | FP risk                                  |
| -------------------------------- | ------------ | --------- | ---------------------------------------- |
| `__NEXT_DATA__`                  | `includes()` | Very High | Extremely specific string                |
| `react-dom`                      | `includes()` | High      | `react-dom` is a well-known package name |
| `ReactDOM`                       | `includes()` | High      | Same                                     |
| `createRoot(`                    | `includes()` | High      | React 18 API                             |
| `Vue.createApp`                  | `includes()` | Very High | Framework-specific method                |
| `@angular/core`                  | `includes()` | Very High | Package import path                      |
| `platformBrowserDynamic`         | `includes()` | High      | Angular-specific                         |
| `__SVELTE__`                     | `includes()` | Very High | Global variable                          |
| `SvelteComponent`                | `includes()` | High      | Svelte-specific                          |
| `astro-island`                   | `includes()` | Very High | Web component tag                        |
| `next/router`, `next/navigation` | `includes()` | High      | Next.js module paths                     |
| `drupalSettings`                 | `includes()` | Very High | Drupal-specific                          |
| `window.Laravel`                 | `includes()` | High      | Laravel-specific                         |

**Finding (P2)**: The `noise` golden fixture includes `// DOM manipulation
library` to avoid matching `react-dom` as a substring in a comment. This
is a documented limitation: any inline script that mentions
`react-dom`, `next/router`, etc. as a substring will trigger detection.
This is the designed behavior — the `false-positive-gatsby-substring`
fixture was rejected for the same reason (ScriptUrlDetector matches
`gatsby` by design).

### ResourceDetector (6 signatures)

| Signature                           | Match method                  | Precision |
| ----------------------------------- | ----------------------------- | --------- |
| `wp-admin`, `wp-includes` (robots)  | `includes()` case-insensitive | High      |
| `--wp--preset--`, `wp-block-` (CSS) | `includes()` case-insensitive | Very High |
| `@tailwind` (CSS)                   | `includes()` case-insensitive | High      |
| `gcm_sender_id` (manifest)          | `includes()` case-insensitive | Very High |

Type-scoped matching (each signature matches only on resources of the
corresponding `type`). No regex. No issues found.

### LinkDetector (6 signatures)

| Signature                                             | Match method                         | Precision                       |
| ----------------------------------------------------- | ------------------------------------ | ------------------------------- |
| `wp-content`, `wp-includes`, `wp-json` (path_segment) | `URL.pathname.split('/').includes()` | High — exact path segment match |
| `cdn.shopify.com`, `shopifycdn.com` (hostname)        | `URL.hostname ===`                   | Very High — exact hostname      |
| `fonts.googleapis.com` (hostname)                     | `URL.hostname ===`                   | Very High                       |

The `LinkDetector` is the most precise matcher — it uses structured URL
analysis (exact hostname comparison, exact path-segment matching) rather
than substring matching. The `false-positive-shopify-subdomain` golden
fixture correctly rejects `shopifycdn.com.example.com`.

### Regex audit

- **No `new RegExp()` in any detector**: All detectors use `String.includes()`
  and `String.split()` for matching. No regex objects.
- **No catastrophic backtracking**: The only `RegExp` usage in the pipeline
  is in the crawler's `html-parser.ts` (`getAttribute`), which uses safe
  patterns (`[^"]*`, `[^']*`, `[^\s>]+` — all negated character classes with
  no nested quantifiers).
- **No duplicated signatures**: Each detector's `SIGNATURES` array has unique
  entries. No signature appears twice in the same detector.

---

## Technology Catalog

**Catalog** (`packages/detectors/src/technology-catalog.ts`):

- 29 technologies, all using `createTechnologyId` + `createTechnologyCategory`
- Categories: `server` (3), `language` (1), `cms` (6), `framework` (10),
  `library` (3), `service_worker` (1), `ecommerce` (2), `fonts` (1),
  `analytics` (1)
- `TECHNOLOGY_IDS` = `new Set(Object.keys(TECHNOLOGY_CATALOG))`
- `getTechnology(id)` — throws if not found
- `TECHNOLOGY_CATEGORIES` — set of all distinct categories

### Catalog invariants verified

- **No ID duplicates**: All 29 keys are unique (verified by `Set` construction).
- **No metadata duplication in signatures**: Each detector's `SIGNATURES`
  table references `technologyId` (a string key) — `name` and `category` are
  NOT duplicated in signature tables. The detector calls `getTechnology()`
  at detection time to retrieve the canonical `Technology` object.
- **No undetectable technologies**: Every catalog entry has at least one
  active signature (verified by Step 11 catalog completeness tests).
- **No undetectable but cataloged**: Every technology produced by a detector
  is in the catalog (verified by golden fixture coverage).
- **Deterministic lookup**: `TECHNOLOGY_CATALOG[id]` is a plain object property
  access — O(1), deterministic. `Map` iteration order is not involved.
- **Detectors do not depend on catalog iteration order**: `getTechnology(id)`
  is a direct key lookup, not an iteration. Reordering catalog entries has
  no behavioral effect. ✅

### What the catalog does NOT do

- Does NOT define signatures, confidences, or evidence (per JSDoc on line 24)
- Does NOT change the `Technology` interface (uses existing domain type)
- Does NOT create a new abstraction (`Technology` is a plain data structure)

All correct and consistent with documentation.

---

## Evidence Model

**8 evidence variants** (defined in `@devlens/core`, `packages/core/src/domain/evidence.ts`):

| Variant                    | Type discriminant     | Fields                | Used by                         |
| -------------------------- | --------------------- | --------------------- | ------------------------------- |
| `HttpHeaderEvidence`       | `'http_header'`       | `name`, `value`       | `HeaderDetector` ✅             |
| `MetaTagEvidence`          | `'meta_tag'`          | `name`, `content`     | `MetaTagDetector` ✅            |
| `ScriptUrlEvidence`        | `'script_url'`        | `url`                 | `ScriptUrlDetector` ✅          |
| `ScriptContentEvidence`    | `'script_content'`    | `snippet`             | `ContentScriptDetector` ✅      |
| `ResourceEvidence`         | `'resource'`          | `url`                 | `ResourceDetector` ✅           |
| `LinkEvidence`             | `'link'`              | `url`                 | `LinkDetector` ✅               |
| `HtmlEvidence`             | `'html'`              | `selector`, `snippet` | **Not used** by any detector ⚠️ |
| `JavaScriptGlobalEvidence` | `'javascript_global'` | `globalName`          | **Not used** by any detector ⚠️ |

### Findings

1. **Two unused evidence variants**: `HtmlEvidence` and
   `JavaScriptGlobalEvidence` are defined in the domain's `Evidence`
   discriminated union but no concrete detector produces them. This is
   classified as **Deferred** — the `Evidence` union is a domain-level
   extensible contract. Removing unused variants would be a breaking
   domain change if future detectors (e.g. a JS-runtime detector using
   Playwright) plan to use them. The variants are harmless: they are
   handled by `getEvidenceKey` (which has a `case 'html'` and
   `case 'javascript_global'` branch) and by `clampConfidence`. The
   `docs/architecture/domain-model.md` evidence table was **missing**
   `script_content` and `link` variants — this was fixed in Step 14 (P2).

2. **`getEvidenceKey` coverage**: The function has a `switch` on
   `evidence.type` covering all 8 variants. TypeScript's exhaustiveness
   checking (via the union type) ensures that adding a new variant would
   produce a compile error here. ✅

3. **`createDetection` invariant**: Enforces `evidence.length >= 1` at
   construction time. Every `Detection` has at least one evidence item.
   This invariant is verified by `evidence-quality.test.ts` (19 tests)
   and is preserved through scoring (`ConfidenceScorer.score()` copies
   the evidence array with `[...detection.evidence]`). ✅

4. **Evidence serialization**: All evidence variants are plain JSON-
   serializable objects with a `type` discriminant. No circular references,
   no functions, no `Date` objects. JSONB storage in PostgreSQL works
   correctly (verified by `evidence-persistence.test.ts`). ✅

5. **`script_content` evidence**: Contains only the matched fingerprint
   snippet (never the full script source), per `ContentScriptDetector`'s
   JSDoc. ✅

---

## Scoring

**Formula** (in `packages/detectors/src/detection-scorer.ts`):

```text
base   = detection.confidence     (best single per-signature confidence, 0–100)
n      = number of unique evidence source types (≥ 1)
bonus  = min(MAX_BONUS=10, max(0, n - 1) × PER_SOURCE_BONUS=5)
score  = min(100, round(base + bonus))
```

`ConfidenceScorerConfig` accepts optional `perSourceBonus` and `maxBonus`
(defaults 5 and 10). These are configurable but not externally configured —
all call sites use the defaults.

### Properties verified

- **Monotone**: Adding an independent source never decreases the score. ✅
  `max(0, n-1) * 5` is monotonically non-decreasing in `n`.
- **Bounded**: `clampConfidence` enforces `[0, 100]`. ✅
- **No false summation**: Base is the single best confidence. ✅
- **NaN/Infinity handling**: `clampConfidence` handles NaN→0, Infinity→100,
  -Infinity→0, out-of-range→clamped. ✅
- **Deterministic**: Pure function, no randomness, no network. ✅
- **No mutation**: Creates a new `Detection` with `[...detection.evidence]`. ✅

### ScoringDetector responsibilities

- Wraps a `Detector` and applies `ConfidenceScorer.score()` to each detection.
- `#rank()` sorts by `confidence DESC, technology.id ASC` (deterministic
  tie-break).
- Uses `[...detections].sort()` — copies before sorting. ✅
- Does NOT add/remove detections. ✅

### Separation of concerns

- `DetectionScorer` (interface) = computes a score from a single `Detection`.
- `ScoringDetector` (class) = applies the scorer to all detections and ranks.
- The scorer does not know about ranking; the detector does not know about
  the formula. ✅

No changes needed. The scoring model is correct and well-separated.

---

## Deduplication

**`DeduplicatingDetector`** (`packages/detectors/src/deduplicating-detector.ts`):

1. **Group** by `technology.id`, preserving first-appearance order (via
   `Map<string, Detection[]>` + `order: string[]`).
2. **Select representative**: highest confidence wins. On ties, the first
   detection in wrapped-detector order is selected (deterministic, no
   invented ranking).
3. **Merge evidence**: evidence from all detections in the group collected
   in wrapped-detector order. Exact-duplicate evidence items removed via
   `getEvidenceKey` canonical key. Merged evidence sorted by canonical key.
4. **No confidence aggregation**: resulting confidence is the representative's
   value only.

### Evidence merge determinism

- `getEvidenceKey` produces type-aware canonical keys: `type|field1|field2|...`
- URL fields lowercased via `normalizeUrl()`.
- Evidence sorted by canonical key after dedup → `[A, B]` and `[B, A]`
  produce the same canonical output. ✅

### Cross-detector deduplication

- `CompositeDetector` produces duplicates (e.g. WordPress detected by both
  `HeaderDetector` and `ScriptUrlDetector`).
- `DeduplicatingDetector` consolidates to one `Detection` per technology. ✅
- `ResourceDetector` and `LinkDetector` perform **internal** dedup (one
  detection per technology within the same detector) via
  `selectBestAndMerge` + `getEvidenceKey`. ✅

**Fixed (P2)**: Stale JSDoc in `ResourceDetector` (line ~160) and
`LinkDetector` (line ~257) claimed deduplication used `JSON.stringify`
for structural comparison. The code actually uses `getEvidenceKey`.
Corrected both JSDoc comments.

---

## Persistence Boundary

```text
Domain (core)
  ↓
Application (ScanResultRepository interface)
  ↓
Database (InMemoryScanResultRepository | PostgresScanResultRepository)
  ↓
Drizzle ORM + postgres driver
```

### Separation verified

- `@devlens/core` does NOT import Drizzle, postgres, or any database types. ✅
- `@devlens/application` does NOT import Drizzle or postgres — depends only
  on the `ScanResultRepository` interface. ✅
- `@devlens/database` contains all Drizzle and postgres imports
  (isolated in `client.ts`). ✅
- `SnapshotRow` (postgres-repository.ts) includes `detections: Detection[]` —
  stored as `jsonb` in the `snapshots` table. The `Detection` domain objects
  are serialized as JSON and deserialized on read. ✅
- `scans` table: stores `Scan` fields (id, target, hostname, status,
  timestamps, error_code, error_message).
- `snapshots` table: stores `SiteSnapshot` fields + `detections: jsonb`.

### Atomicity

- In-memory: sequential `Map` writes (no rollback — acceptable for tests).
- PostgreSQL: all writes inside `db.transaction()`, with `ON CONFLICT DO UPDATE`
  upserts and `DELETE` for stale snapshots on failed scans. ✅

### Error model

- Persistence failure propagates as an infrastructure error (NOT a
  `ScanError`). The scan lifecycle is already finalized by `runScan`. ✅
- Documented in `docs/architecture/persistence.md`. ✅

No issues found. The persistence boundary is clean and well-documented.

---

## API Boundary

**Endpoint**: `POST /api/scans`

### Request validation (`handler.ts`)

| Condition                  | HTTP 400 code          |
| -------------------------- | ---------------------- |
| Body is not valid JSON     | `MALFORMED_JSON`       |
| `url` field is missing     | `MISSING_URL`          |
| `url` is not a string      | `INVALID_URL_TYPE`     |
| `url` is empty             | `EMPTY_URL`            |
| `url` is not a valid URL   | `INVALID_URL`          |
| `url` uses non-http scheme | `UNSUPPORTED_PROTOCOL` |

Rejected schemes: `ftp://`, `file://`, `javascript:`, `data:`, etc.

### Handler separation

- `route.ts`: Thin Next.js adapter — reads body, constructs deps, calls
  `handleCreateScan`, returns `NextResponse.json`. ✅
- `handler.ts`: Pure function — JSON parse → validate → construct Scan →
  `executeScan`. No Next.js imports. ✅
- `@devlens/application`: `executeScan` → `runScan` + `persistResult`. ✅

### Status codes

- HTTP 200: Both scan success AND domain-level failure (crawl errors).
  A failed scan returns `{ status: 'failed', scan.error: { code, message } }`.
- HTTP 500: Infrastructure failures only (persistence errors, unexpected
  errors during execution). Error details are NOT leaked to the client.

### SSRF

- HTTP boundary: scheme validation (http/https only).
- Crawler level: `isBlockedHostname()` checks all requests and redirect
  targets against private ranges. ✅
- Known limitations documented (DNS rebinding, domain-based metadata endpoints).

### Fixed (P1 context)

`route.ts` now uses `createProductionDetector()` instead of the inline
pipeline construction. The handler's separation of concerns is unchanged.

---

## Test Architecture

### Test inventory (838 tests, 9 skipped, 45 files)

| Package       | Test files | Tests                                      |
| ------------- | ---------- | ------------------------------------------ |
| `core`        | 6 files    | 67 tests                                   |
| `detectors`   | 19 files   | ~490 tests (including 109 golden fixtures) |
| `crawler`     | 7 files    | 173 tests                                  |
| `application` | 2 files    | 7 tests                                    |
| `database`    | 4 files    | 25 tests (7 skipped)                       |
| `web`         | 2 files    | 17 tests (2 skipped)                       |
| `worker`      | 1 file     | 4 tests                                    |

### Test classification

| Category       | Files                                                                                            | Description                                        |
| -------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Unit           | Most `*detector.test.ts`, `*scorer.test.ts`, `*key.test.ts`                                      | Test individual components in isolation            |
| Integration    | `pipeline.integration.test.ts`, `evidence-integration.test.ts`, `confidence-integration.test.ts` | Test detector interactions                         |
| Fixture/golden | `golden-fixtures.test.ts` (109)                                                                  | End-to-end pipeline on 35 realistic fixtures       |
| Collision      | `technology-collision.test.ts` (24)                                                              | Cross-technology false-positive testing            |
| Determinism    | Multiple `determinism*.test.ts`                                                                  | Verify stable output ordering                      |
| Crawler        | 7 test files (173 tests)                                                                         | Observation, normalization, edge cases             |
| Persistence    | 4 test files (25 tests)                                                                          | In-memory + Postgres round-trip                    |
| Architecture   | N/A                                                                                              | No dedicated architecture boundary tests (see §26) |

### Findings

- **No duplicated test logic**: Crawler tests use a shared `test-helpers.ts`
  (135 lines). Detector tests use `fixtures/detector-fixtures.ts` (890 lines)
  with a `makeSnapshot` builder and `ALL_TECH_IDS` constant. These are
  separate concerns, not duplicates.
- **No fragile assertions**: Tests assert on technology IDs and top-level
  evidence properties, not on internal implementation details.
- **No tests testing implementation instead of contract**: Detector tests
  assert on the external `Detection[]` output, not on internal signature
  table structure.
- **Helpers are bounded**: `test-helpers.ts` provides mock-fetch and
  response builders. `detector-fixtures.ts` provides snapshot builders
  and realistic fixtures. Neither is a "mini test framework." ✅

### Architecture fitness tests (absent)

No dedicated architecture boundary tests exist (e.g., "core must not
import Next.js"). The `docs/architecture/application.md` mentions
testability through dependency injection. Given the small package
count and clean dependency direction (verified manually via madge +
grep), automated boundary tests are not yet warranted. This is
classified as **Deferred**.

---

## Documentation Consistency

### Issues found and fixed (Step 14)

1. **`docs/architecture/overview.md`** (P2): Test summary said "715 passed,
   9 skipped across 43 test files" — stale since Step 13. Updated to
   "824 passed, 9 skipped across 44 test files." Also updated "As of
   Step 12" → "As of Step 13."

2. **`docs/architecture/persistence.md`** (P2): Worker wiring example
   showed an outdated 4-detector pipeline without `ScoringDetector`,
   `ResourceDetector`, or `LinkDetector`, and without `ConfidenceScorer`.
   Updated to use `createProductionDetector()`.

3. **`docs/architecture/domain-model.md`** (P2): Evidence variant table
   listed only 6 of 8 variants — missing `script_content` and `link`.
   Added both.

4. **`docs/architecture/detectors.md`** (P2): "Production wiring" section
   showed inline pipeline construction in both `route.ts` and `main.ts`.
   Updated to reference `createProductionDetector()`.

5. **`docs/architecture/detectors.md`** (P2): File structure section had
   `evidence-key.test.ts` and `technology-catalog.test.ts` listed twice
   (once in the main listing, once at the end). Added missing
   `fixtures/detector-fixtures.ts` and `golden-fixtures.test.ts` entries.
   Added `production-detector.ts` and `production-detector.test.ts` entries.

### Remaining minor doc issues (Deferred)

- `docs/architecture/overview.md` line 139 says "`@devlens/detectors` ships
  eleven exports" — now 12+ with `createProductionDetector`. The count is
  approximate (the doc lists 11 conceptual components). Not worth
  re-counting for every new export.
- `docs/architecture/detectors.md` §3 references "DetectionScorer" as a
  section heading concept — the actual code has `DetectionScorer` (interface)
  - `ConfidenceScorer` (impl), which is correctly described in the body.

No critical documentation inconsistencies remain.

---

## Findings

### P0 — Critical

No critical issues found. No data corruption, nondeterminism, data loss,
systematic false results, or broken architecture detected.

### P1 — Important

#### Finding 1: Pipeline construction duplicated across web and worker

- **Problem**: `apps/web/src/app/api/scans/route.ts` (lines 46-58) and
  `apps/worker/src/main.ts` (lines 131-143) each construct the identical
  `ScoringDetector(DeduplicatingDetector(CompositeDetector([HeaderDetector,
MetaTagDetector, ScriptUrlDetector, ContentScriptDetector, ResourceDetector,
LinkDetector])))` pipeline. If a detector is added, removed, or reordered
  in one location but not the other, the web API and worker would silently
  diverge — potentially producing different detection results from the
  same snapshot.
- **Evidence**: Both files import the same 10 detector classes from
  `@devlens/detectors` and hand-construct the pipeline. Neither imports
  from `@devlens/application` for this wiring — the `application` layer
  only defines `runScan`/`executeScan` which accept a `Detector` interface.
- **Minimal fix**: Created `createProductionDetector()` in
  `packages/detectors/src/production-detector.ts`, exported from
  `packages/detectors/src/index.ts`. Both `route.ts` and `main.ts` now call
  this single factory. The detector class imports in both files were
  replaced with a single `import { createProductionDetector }`.
- **Regression test**: `production-detector.test.ts` (5 tests) verifies
  the factory returns a valid detector, produces correct nginx detection
  end-to-end, is deterministic across invocations, does not mutate the
  input snapshot, and agrees with the golden nginx fixture.
- **Classification**: P1 — maintainability risk with silent divergence
  potential.

#### Finding 2: `handleCreateScan` returns 200 for all domain-level failures

- **Problem**: When a scan fails due to a `CrawlError` (timeout, SSRF
  blocked, network error), the handler returns HTTP 200 with
  `scan.status: "failed"` in the response body. Only infrastructure
  failures (persistence) produce HTTP 500.
- **Evidence**: `handler.ts` `handleCreateScan` returns
  `{ status: 200, body: CreateScanResponse }` on both scan success and
  scan failure. `docs/architecture/api.md` §3 documents this: "When
  the scan **fails** (crawler error), the HTTP status is still `200`."
- **Analysis**: This is a **documented design decision**, not a bug.
  Domain-level failures (crawl errors) are "successful" HTTP requests —
  the server did its job and recorded the failure. Only infrastructure
  failures (can't persist) are 500s. This is consistent with the
  error model in `docs/architecture/application.md`.
- **Classification**: **Not a finding** — behavior is correct and documented.

### P2 — Minor

#### Finding 3: Dead detector re-exports in `application/index.ts`

- **Problem**: `@devlens/application`'s public API re-exported 7 detector
  types/classes from `@devlens/detectors` (`Detector` type, `NullDetector`,
  `CompositeDetector`, `MetaTagDetector`, `ScriptUrlDetector`,
  `ContentScriptDetector`, `DeduplicatingDetector`) that were never
  imported by any consumer.
- **Evidence**: `grep -rn "from '@devlens/application'" packages/ apps/`
  shows all imports of `@devlens/application` use only `runScan`,
  `persistResult`, `executeScan`, `ScanResult`, `ScanResultRepository`.
  Neither `route.ts` nor `main.ts` imports detector classes from
  `@devlens/application` — both import directly from `@devlens/detectors`.
- **Minimal fix**: Removed the 7 dead re-exports from
  `packages/application/src/index.ts`. The `application` package now
  exports only its 5 intended public API members.
- **Regression test**: No test needed — the exports were unused by all
  tests and production code. Verified via grep.
- **Classification**: P2 — dead code / unnecessary API surface.

#### Finding 4: Stale JSDoc comments in `ResourceDetector` and `LinkDetector`

- **Problem**: Both detectors' `detect()` / `selectBestAndMerge()` JSDoc
  comments stated that evidence deduplication uses "structural comparison
  via `JSON.stringify`". The actual code uses `getEvidenceKey()` (a
  canonical, property-order-independent key function), as introduced in
  Step 9.
- **Evidence**:
  - `ResourceDetector` line 160: `via \`JSON.stringify\`)`— but line 240:`const key = getEvidenceKey(match.evidence)`
  - `LinkDetector` line 257: `via \`JSON.stringify\`)`— but line 349:`const key = getEvidenceKey(match.evidence)`
  - `docs/architecture/detectors.md` §9 ("Evidence Canonicalization")
    correctly describes `getEvidenceKey` usage, confirming the JSDoc was
    stale relative to the Step 9 implementation.
- **Minimal fix**: Updated both JSDoc comments to say "via `getEvidenceKey`"
  instead of "structural comparison via `JSON.stringify`."
- **Regression test**: No test needed — JSDoc-only change, no behavior
  change. Existing tests (`resource-detector.test.ts`, `link-detector.test.ts`)
  continue to validate dedup behavior.
- **Classification**: P2 — documentation inconsistency.

#### Finding 5: `getAttribute` regex recompilation in `html-parser.ts`

- **Problem**: `getAttribute()` (crawler) compiles a `new RegExp` on every
  call. It is called once per attribute per meta/script/link tag.
- **Evidence**: `packages/crawler/src/html-parser.ts` line 80-84:
  `const pattern = new RegExp(...)`. Called from `extractDescription`,
  `extractMetaTags`, `extractScripts`, `extractStylesheetLinks`,
  `extractManifestLink`, `extractLinkTags` — each in a `while` loop.
- **Analysis**: The regex is safe (no catastrophic backtracking — uses
  negated character classes `^"]*` and `[^']*` with no nested quantifiers).
  Input is bounded (single HTML tag attribute strings). Compilation overhead
  is negligible for current page sizes.
- **Minimal fix**: Not applied. This is a micro-optimization with no
  correctness or maintainability impact. The `attrName` parameter varies,
  so a single pre-compiled regex cannot cover all calls without a lookup
  table — which would add complexity for negligible benefit.
- **Classification**: P2 (noted, no fix recommended).

#### Finding 6: `overview.md` describes "eleven exports" for `@devlens/detectors`

- **Problem**: `docs/architecture/overview.md` line 139 says
  "`@devlens/detectors` ships eleven exports." The actual export count is
  higher (14+ including catalog constants and now `createProductionDetector`).
- **Evidence**: `packages/detectors/src/index.ts` exports `Detector`
  (type), `NullDetector`, `HeaderDetector`, `MetaTagDetector`,
  `ScriptUrlDetector`, `ContentScriptDetector`, `ResourceDetector`,
  `LinkDetector`, `DeduplicatingDetector`, `CompositeDetector`,
  `DetectionScorer` (type), `ConfidenceScorer`, `ScoringDetector`,
  `CatalogEntry` (type), `TECHNOLOGY_CATALOG`, `TECHNOLOGY_IDS`,
  `TECHNOLOGY_CATEGORIES`, `getTechnology`, + now `createProductionDetector`.
- **Analysis**: The doc's "eleven" counts the 11 conceptual detector/
  scorer components listed as bullet points — not the total export count.
  The count is approximate and the bullet list is accurate. This is a
  minor imprecision, not a documentation error.
- **Classification**: **Not a finding** — the doc is describing conceptual
  components, not literal export count.

### Deferred

#### Deferred 1: `HtmlEvidence` and `JavaScriptGlobalEvidence` unused by any detector

- **Problem**: Two of the 8 evidence variants (`HtmlEvidence` and
  `JavaScriptGlobalEvidence`) are never produced by any detector. They
  are handled by `getEvidenceKey` and are JSON-serializable, but
  consume dead code paths.
- **Reason not fixed**: The `Evidence` union is a domain-level extensible
  contract. Future detectors (e.g., a runtime JS-global detector using
  browser automation) would use `JavaScriptGlobalEvidence`. Removing
  unused variants would be a breaking domain change with no current
  benefit. The variants are harmless.
- **Classification**: Deferred.

#### Deferred 2: Architecture boundary tests (madge-based import assertions)

- **Problem**: No automated tests verify "core must not import Next.js",
  "detectors must not import DB", etc.
- **Reason not implemented**: The dependency direction is clean and
  verified via `madge --circular` (0 cycles) and grep. With only 12
  packages and strict import discipline, the risk of accidental upward
  imports is low. Adding `dependency-cruiser` or custom madge-based tests
  would be "creating a framework for architecture" which the Step 14
  instructions caution against.
- **Classification**: Deferred.

#### Deferred 3: Async pipeline considerations

- **Problem**: The detector pipeline is entirely synchronous. If future
  detectors need async I/O (e.g., fetching additional resources), the
  `Detector` interface would need to change to `detect(...): Promise<Detection[]>`.
- **Analysis**: Currently no async detection is needed. All detection
  operates on already-captured `SiteSnapshot` data. The `CompositeDetector`
  iterates sub-detectors sequentially with no `Promise.all`. The
  `HttpCrawler` uses sequential `await` for resource fetching (no
  concurrency). This is correct and deterministic.
- **Classification**: Deferred — no current issue, but worth noting for
  future evolution.

---

## Changes Implemented

| #   | File                                            | Change                                                                                                                                                                         | Justification                                  |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 1   | `packages/detectors/src/production-detector.ts` | **New file** — `createProductionDetector()` factory                                                                                                                            | P1: single source of truth for pipeline wiring |
| 2   | `packages/detectors/src/index.ts`               | Added `export { createProductionDetector }`                                                                                                                                    | P1: export the new factory                     |
| 3   | `apps/web/src/app/api/scans/route.ts`           | Replaced 10 inline detector imports + 12-line pipeline construction with `createProductionDetector()`                                                                          | P1: removes duplication                        |
| 4   | `apps/worker/src/main.ts`                       | Replaced 10 inline detector imports + 12-line pipeline construction with `createProductionDetector()`                                                                          | P1: removes duplication                        |
| 5   | `packages/application/src/index.ts`             | Removed 7 dead detector re-exports (`Detector`, `NullDetector`, `CompositeDetector`, `MetaTagDetector`, `ScriptUrlDetector`, `ContentScriptDetector`, `DeduplicatingDetector`) | P2: dead code                                  |
| 6   | `packages/detectors/src/resource-detector.ts`   | Fixed stale JSDoc: `JSON.stringify` → `getEvidenceKey`                                                                                                                         | P2: documentation consistency                  |
| 7   | `packages/detectors/src/link-detector.ts`       | Fixed stale JSDoc: `JSON.stringify` → `getEvidenceKey`                                                                                                                         | P2: documentation consistency                  |
| 8   | `docs/architecture/overview.md`                 | Updated test count 715→824, test files 43→44, "As of Step 12"→"As of Step 13"                                                                                                  | P2: stale docs                                 |
| 9   | `docs/architecture/persistence.md`              | Updated worker wiring example to use `createProductionDetector()`                                                                                                              | P2: stale docs                                 |
| 10  | `docs/architecture/domain-model.md`             | Added `script_content` and `link` evidence variants to table                                                                                                                   | P2: stale docs                                 |
| 11  | `docs/architecture/detectors.md`                | Updated "Production wiring" to reference `createProductionDetector`; fixed file structure (added missing files, removed duplicates)                                            | P2: stale docs                                 |
| 12  | `docs/Step14.md`                                | Prettier formatting                                                                                                                                                            | Clean lint                                     |

---

## Tests Added

| File                                                 | Tests | Purpose                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/detectors/src/production-detector.test.ts` | 5     | P1 regression: verifies `createProductionDetector()` returns a valid `Detector`, produces correct nginx detection end-to-end, is deterministic across invocations, does not mutate the input snapshot, and agrees with the golden nginx fixture |

**Total**: +5 tests

---

## Validation

```text
pnpm typecheck      → ✅ 0 errors
pnpm test           → ✅ 829 passed, 9 skipped
pnpm lint           → ✅ clean (eslint + prettier)
pnpm build          → ✅ clean
npx madge --circular → ✅ 0 circular dependencies, 146 files, 2 warnings
```

### Test delta

```text
Tests before: 824 passed, 9 skipped
Tests after:  829 passed, 9 skipped
New tests:    +5 (production-detector.test.ts)
Skipped:      9 (unchanged — postgres-repository.test.ts, route.integration.test.ts)
Files before: 143 (madge)
Files after:  146 (madge — +3: production-detector.ts, production-detector.test.ts, dist/production-detector.d.ts)
```

---

## Conclusion

The Step 14 audit reveals an architecture that is **structurally sound and
well-factored**. The layered dependency direction is clean, the detection
pipeline is deterministic and mutation-free, error isolation follows a
coherent fail-fast model, and the evidence/scoring/dedup contracts are
internally consistent.

Three real issues were found and fixed with minimal changes:

1. **P1 — Pipeline duplication** (`route.ts` + `main.ts`): Eliminated via
   `createProductionDetector()` factory. This is the most important fix —
   without it, the web API and worker could silently diverge.

2. **P2 — Dead re-exports** in `application/index.ts`: Removed 7 unused
   detector class re-exports that expanded the public API surface
   unnecessarily.

3. **P2 — Stale JSDoc and docs**: Fixed 2 stale JSDoc comments claiming
   `JSON.stringify`-based dedup (code uses `getEvidenceKey`), plus 5
   documentation files with stale test counts, outdated worker wiring,
   missing evidence variants, and duplicate file structure entries.

No changes were made to:

- The scoring formula (unchanged)
- Evidence types (unchanged)
- Technology catalog (unchanged)
- Detector signatures (unchanged)
- Error model (unchanged)
- Error isolation behavior (documented, not changed)

The architecture **can continue to grow** without becoming fragile, provided
that:

- New pipeline wiring goes through `createProductionDetector()`
- New evidence variants are added carefully (the `getEvidenceKey` switch
  enforces exhaustiveness at compile time)
- Cross-detector error isolation remains fail-fast (if partial-result
  semantics are desired in the future, this would be a deliberate
  redesign)
