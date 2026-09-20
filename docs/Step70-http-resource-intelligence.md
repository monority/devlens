# Step 70 — HTTP Resource Intelligence

A deterministic, security-bounded layer that discovers, classifies, selects,
and (best-effort) acquires the secondary HTTP resources referenced by a crawled
page, enriching `SiteSnapshot.resources` with provenance **without** touching the
existing six detectors, the scorer, the deduplicator, or the Step‑69
`RelationshipResolver`.

The layer is **strictly opt-in**: `HttpCrawlerOptions.resourceIntelligence`.
When the option is absent the crawler behaves byte‑identically to its
pre‑Step‑70 self (controlled observation of `robots.txt`, the manifest, and
same‑origin CSS only). Enabling it _adds_ observations; it never removes or
alters the existing controlled‑observation path.

## 1. Goals & non‑goals

**Goals**

- Give technology detectors access to fetched secondary‑resource bodies (JS, CSS,
  manifests, favicons, robots) so fingerprints that live _outside_ the HTML
  markup become observable.
- Make every resource observable — fetched, failed, or skipped — together with
  _why_ it was fetched and _why_ alternatives were skipped.
- Guarantee deterministic ordering and de‑duplication regardless of network
  timing.
- Preserve the existing SSRF / same‑origin boundary **exactly**; the layer may
  only narrow what is fetched, never broaden the security boundary.

**Non‑goals (explicitly out of scope)**

- No crawler‑capability expansion: no browser/DOM rendering, no CSS parsing, no
  cookie/session support, no DNS rebinding protection, no TLS/JS execution.
- No new _technology detections_ in Step 70. `ResourceDetector` signatures are
  unchanged (`matchType` is `robots` / `css` / `manifest` only). Fetched script
  and favicon bodies are observed but carry no detector signatures — they cannot
  create false positives (§6).
- No changes to detectors, scorer, deduplicator, relationship resolver, the
  orchestrator scan flow, or the persistence schema. `runScan` still does
  `crawler.crawl(target)` → `detector.detect(snapshot)`; the _only_ integration
  point is the resources now present in `snapshot.resources`.
- No second HTTP client stack. Acquisition reuses the existing `fetchFn`,
  `readBodyWithLimit`, `isRedirect`, and `convertHeaders` primitives from
  `HttpCrawler`.

## 2. Architecture

```
                       ┌──────────────────────────────────────────┐
   crawl(target)        │ HttpCrawler.crawl()                      │
   ───────────────────► │                                          │
                        │  1. fetch primary document (+redirects)  │
                        │  2. extractHtml → HtmlExtract             │
                        │  3. resourceIntelligence ?               │
                        │       YES → intelligentResources()       │
                        │       NO  → observeResources()  (legacy) │
                        │  4. build SiteSnapshot (snapshot.resources)│
   ◄────────────────────┤  5. return snapshot                      │
```

`intelligentResources()` is the Step‑70 entry point. It is a thin orchestrator
over a **pure** module, `resource-intelligence.ts`:

```
 HtmlExtract ──discoverResources──► DiscoveredResource[]   (dedup, sort)
                                     │
 DiscoveredResource[] ─selectResources──► { selected, skipped }   (pure, budgeted)
                                     │
                                     ▼
   selected ──HttpCrawler.acquireResource──► Resource (fetched | failed)
   skipped  ──(observable as-is)              ─► Resource (skipped)
```

- `resource-intelligence.ts` — pure functions, no I/O. Trivially unit testable
  and deterministic.
- `HttpCrawler.intelligentResources()` — orchestrates discover → select →
  acquire, owns the per‑scan canonical‑URL cache and the deterministic output
  sort.
- `HttpCrawler.acquireResource()` — the only I/O. Reuses the existing HTTP
  fetch primitives; wraps each acquisition in a per‑resource timeout and always
  returns an observable `Resource` (never throws to the caller).

The pure module lives in the `crawler` package (the only package that already
depends on `@devlens/core`, where the `Resource` model lives). No new packages
and no new dependencies are introduced.

## 3. Domain model (additions)

In `packages/core/src/domain/snapshot.ts`:

### `ResourceType`

`'favicon'` is added. The existing kinds (`script | stylesheet | css | image |
font | video | audio | document | robots | manifest | other`) are unchanged.

> **Why both `stylesheet` and `css` still coexist.** `ResourceDetector` signs
> `matchType: 'css' | 'robots' | 'manifest'`. The HTML `<link rel=stylesheet>`
> is therefore discovered/classified as **`css`** (not `stylesheet`) so existing
> CSS fingerprints (`--wp--preset--…`, Tailwind markers, etc.) keep matching.
> `stylesheet` is retained as a type for completeness but is not produced by
> discovery.

### `ResourceAcquisitionStatus`

```ts
type ResourceAcquisitionStatus =
  | 'discovered' // referenced by markup, not yet selected
  | 'selected' // chosen, not yet fetched
  | 'fetched' // acquired successfully
  | 'failed' // acquisition attempted but failed
  | 'skipped'; // never acquired (budget / policy)
```

### Extended `Resource`

All new fields are **optional** (additive, persistence‑safe and
backward‑compatible — existing `Resource` literals and persisted rows remain
valid):

| Field                | Type                        | Present when                               |
| -------------------- | --------------------------- | ------------------------------------------ |
| `sourcePage?`        | `Url`                       | the page URL that referenced the resource  |
| `acquisitionStatus?` | `ResourceAcquisitionStatus` | the resource passed through the pipeline   |
| `failureReason?`     | `string`                    | `failed` or `skipped`                      |
| `responseHeaders?`   | `ReadonlyArray<HttpHeader>` | `fetched` (relevant response headers only) |

`httpStatus` remains **required**: `200` for a resource only discovered from
markup, the real status for a fetched/failed resource. `content` is `''` for
skipped/failed resources (never fabricated).

## 4. The pipeline in detail

### 4.1 Discovery — `discoverResources(html, pageUrl, policy)`

Reads the **`HtmlExtract`** already produced by `extractHtml` (reused — no
second parser):

| Source                             | Kind          | Notes                                  |
| ---------------------------------- | ------------- | -------------------------------------- |
| `<{pageOrigin}/robots.txt>`        | `robots`      | derived from origin, not markup        |
| `extract.manifestLink`             | `manifest`    | first `<link rel=manifest>`            |
| `extract.scripts[].src` (non‑null) | `script`      | inline scripts carry content inline    |
| `extract.stylesheetLinks[]`        | `css`         | **css**, not stylesheet (detector sig) |
| `<link rel=icon                    | shortcut icon | …>`                                    | `favicon` | `isFaviconRel` token check |

Rules:

- Relative URLs are resolved against `pageUrl` via `new URL(...)`.
- `canonicalizeUrl` lowercases scheme/host, **strips the fragment**, rejects
  non‑`http(s):` schemes and malformed URLs (returns `null`).
- Path case is **preserved** (paths are case‑sensitive); `https://x/A.css` and
  `https://x/a.css` are distinct.
- De‑duplication is by canonical URL; the **first** occurrence in document order
  wins.
- Output is sorted by `(priority, canonicalUrl)` — priority comes from
  `policy.priority`. This makes discovery order independent of array iteration
  order.
- Discovery never filters on origin or private‑IP — that is the security gate's
  job (§5). A cross‑origin stylesheet is _discovered_; it is later _skipped_ at
  acquisition.

### 4.2 Selection — `selectResources(discovered, policy)`

A pure, stable budget allocator:

- Re‑sorts input by `(priority, url)`.
- Walks the ordered list, admitting a resource iff `total < maxTotal` **and**
  `perKind[kind] < maxPerKind[kind]`.
- Anything that fails the budget goes to `skipped` (with the discovery context
  retained so an observable can be emitted).
- `maxPerKind` for a kind not present in the map behaves as `0` (excluded).

Selection is a pure function of `(discovered, policy)` → determinism is
guaranteed without touching the network.

### 4.3 Acquisition — `HttpCrawler.acquireResource(...)`

The single I/O method. For each `selected` resource it:

1. **Security gate** (`isResourceFetchable`, §5).
2. **Fetch** with `redirect: 'manual'` and a per‑resource `AbortController`
   bounded by `policy.timeoutMs`, forwarding the crawl‑level signal so a scan
   cancellation still aborts in‑flight resources.
3. **Manual redirect loop** — follows up to `policy.maxRedirects` `3xx`
   responses, re‑validating **every** redirect target through the security gate
   (§5). A redirect to a blocked destination is a _failed_ observation, not a
   throw.
4. **Status gate** — only `2xx` yields a `fetched` body; any other status is a
   `failed` observation carrying `failureReason: 'http_<status>'` and that
   status. Non‑2xx is therefore observable, never a thrown error.
5. **Body read** via `readBodyWithLimit(response, policy.maxBodyBytes)`. A
   `too_large` body becomes `failed: 'body_too_large'`; other read errors become
   `'body_read_error'`. No partial/empty bodies are fabricated.
6. **Classification** (`classifyResource`, §3) — the response `Content-Type` may
   reclassify the kind (e.g. a `.js` URL served as `text/css`). A `favicon`
   declared by HTML context is preserved even when served as `image/*`.

Every path returns a populated `Resource`:

- success → `{ acquisitionStatus: 'fetched', content, size, httpStatus, contentType, sourcePage, responseHeaders }`
- failure → `{ acquisitionStatus: 'failed', content: '', size: null, failureReason }`
- gate rejection → `{ acquisitionStatus: 'skipped', content: '', failureReason }`

The outer `intelligentResources()` additionally emits the **skipped** (beyond
budget) discoveries as observable resources so the budget decision is auditable.

## 5. Security (SSRF & same‑origin)

Step 70 reuses the existing boundary in `ssrf-guard.ts` and adds one function,
`isResourceFetchable(url, targetHostname, allowExternal)` (additive —
`isResourceUrlAllowed` is unchanged and still backs the legacy path).

`isResourceFetchable` enforces, **unconditionally**:

1. **Scheme** — only `http:` / `https:` (blocks `data:`, `javascript:`,
   `blob:`, `file:`).
2. **SSRF blocklist** — `isBlockedHostname` rejects `localhost`, `.localhost`,
   IPv4 private (`10/8`, `172.16/12`, `192.168/16`, `0/8`, `169.254/16`,
   `127/8`) and IPv6 loopback / unique‑local / link‑local.
3. **Same‑origin** — unless `allowExternal` is `true`, the hostname must equal
   `targetHostname` exactly.

> `allowExternal` only lifts the **cross‑origin** restriction. It does **not**
> relax the scheme or SSRF blocklist — a public cross‑origin URL may be
> fetched, but `127.0.0.1`, `localhost`, `10.x`, etc. are still blocked at
> every hop, including redirect destinations.

### Known limitations (documented in‑file, reused as‑is)

`ssrf-guard.ts` documents limitations it does **not** fix (Step 70 does not
either):

- **DNS rebinding** — an external host that initially resolves public then
  private between the check and the fetch.
- **Domain‑based metadata endpoints** — e.g. `metadata.google.internal`
  equivalents on other clouds; only IP‑based private ranges are blocked.
- **IPv6 edge cases** — IPv4‑mapped / 6to4 / Teredo addresses that collapse to
  private IPv4 are not exhaustively normalized.
- **Cross‑origin policy** — with `allowExternal: true`, public cross‑origin
  resources are fetched but are NOT sandboxed from reading the victim origin's
  responses (browsers would enforce CORS; the crawler does not). `allowExternal`
  defaults to `false`.

These are accepted, documented constraints — not Step 70 deliverables.

## 6. Why resource intelligence cannot introduce false detections

This is the central regression invariant, pinned by
`packages/application/src/resource-intelligence-regression.test.ts`:

1. **`ResourceDetector` only signs `robots`/`css`/`manifest`.** Fetched
   `script` and `favicon` bodies land in `snapshot.resources` but have no
   matching signature, so `resources.find(r => r.type === 'css' && …)` simply
   skips them. Empty‑content skipped resources never substring‑match.
2. **Fetched CSS bodies are byte‑identical** to the legacy controlled‑observation
   path (same URL, same `readBodyWithLimit`), so any CSS fingerprint that
   matched before still matches — and the _same_ resource is not fetched twice
   (per‑scan dedup).
3. **Script detection uses `html.scripts` (declared `src`/inline content), not
   `snapshot.resources`.** Fetched script bodies therefore add no evidence and
   cannot create or merge a detection.
4. **The relationship resolver (Step 69)** is the outermost detector layer and
   is unaffected by resource provenance; `Detection.source` stays absent on
   direct detections (absent ⇒ direct).

Result: `detect(crawl(ON))` and `detect(crawl(OFF))` yield the **same set of
direct detections** for any input HTML.

## 7. Policy defaults & justification

`DEFAULT_RESOURCE_POLICY` (`packages/crawler/src/resource-intelligence.ts`):

| Field                                                         | Default                                                 | Justification                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `maxTotal`                                                    | `40`                                                    | Enough signal for JS/CSS; bounds work on pathological pages.                             |
| `maxPerKind.css`                                              | `10`                                                    | A page may split CSS across many bundles.                                                |
| `maxPerKind.script`                                           | `20`                                                    | Scripts are the richest fingerprints but also most numerous.                             |
| `maxPerKind.robots/manifest/favicon`                          | `8/4/4`                                                 | One each typically, but tolerate a few.                                                  |
| `maxPerKind.image/font/video/audio/document/stylesheet/other` | `0` / `8`                                               | Images & fonts rarely carry tech fingerprints → zero budget; `other` keeps a small tail. |
| `maxBodyBytes`                                                | `524_288` (512 KiB)                                     | Large enough for JS/CSS fingerprints, bounds memory.                                     |
| `timeoutMs`                                                   | `5_000`                                                 | Best‑effort secondary request; a slow edge should not stall a scan.                      |
| `maxRedirects`                                                | `5`                                                     | Enough for asset CDNs; tighter than the page‑level limit.                                |
| `allowExternal`                                               | `false`                                                 | Same‑origin by default — never fetch cross‑origin without intent.                        |
| `observe*`                                                    | `true` for robots/manifest/scripts/stylesheets/favicons | All are useful; turn off to reduce noise.                                                |

## 8. Determinism guarantees (§14)

1. **No object‑key / `for‑in` dependence** — all iteration is over explicit
   arrays (`html.scripts`, `html.stylesheetLinks`, `html.linkTags`) or a
   `SortedMap`/`Set` over canonical URLs.
2. **No Promise‑completion ordering** — acquisitions are awaited in a stable,
   priority‑sorted order; the final `snapshot.resources` is re‑sorted by
   `compareResources` (priority, then URL) before return, so completion timing
   cannot change the output order.
3. **No network dependence** — discovery and selection are pure; acquisition
   failures are modeled as observations (deterministic kind + status), not as
   order‑affecting side effects.
4. **Per‑scan de‑duplication** (`§15`) — a `Set<string>` of canonical URLs
   guarantees no URL is fetched or emitted twice within one crawl.

## 9. Persistence

`snapshot.resources` is stored as part of the jsonb `snapshot` column. The new
fields are optional, so:

- **Legacy rows** (no `sourcePage`/`acquisitionStatus`/`responseHeaders`) read
  back with those fields simply absent — no migration, no mapper change
  (`rowToSnapshot` spreads `resources` wholesale).
- **Enriched resources** round‑trip losslessly (`snapshot-mapping.test.ts`,
  Step‑70 cases).
- `HttpHeader[]` (`responseHeaders`) is already the persisted header shape used
  for `http.headers`, so no new column is needed.

## 10. Integration points

- **Crawler** — `HttpCrawlerOptions.resourceIntelligence?: ResourcePolicy`.
  `crawl()` branches: option present → `intelligentResources()`; absent →
  `observeResources()` (unchanged).
- **Detectors** — **none**. `ResourceDetector` is unchanged; it simply sees more
  (and richer) `Resource` observations when the layer is on.
- **Orchestrator** — `runScan` is unchanged; it already calls `crawl` then
  `detect`. Enabling the layer is a `HttpCrawler` construction concern.
- **Web API / UI** — out of scope for Step 70 (the option is crawler‑side only
  and not yet exposed by the API). The optional `Resource` fields are safe for
  the existing response mapper (`detectionToResponse` omits absent fields).

## 11. Boundaries respected (must not change)

- The six detectors, `ScoringDetector`, `DeduplicatingDetector`,
  `CompositeDetector`, `ConfidenceScorer`, and the Step‑69 `RelationshipResolver`
  are **not modified**.
- `HtmlExtract` / `extractHtml` / `html-parser.ts` are **not modified**.
- `ssrf-guard.ts` is **extended** (`isResourceFetchable` added) but
  `isBlockedHostname` / `isResourceUrlAllowed` are **unchanged**.
- The orchestrator scan flow is **unchanged**.
- The database schema/mappers are **unchanged** (additive optional fields only).

## 12. Test coverage

| File                                                                | Covers                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/crawler/src/resource-intelligence.test.ts`                | pure discover / classify / select / canonicalize, determinism, budget.                                                                                                                                                                           |
| `packages/crawler/src/resource-acquisition.test.ts`                 | ON‑crawl acquisition: success, 4xx, network, timeout, oversized, redirect, blocked redirect, cross‑origin skip, scheme rejection, per‑scan dedup, deterministic ordering; **default‑OFF regression** asserting the controlled path is untouched. |
| `packages/application/src/resource-intelligence-regression.test.ts` | OFF vs ON crawls over rich real‑world‑style HTML produce **identical** detection ID sets via `createProductionDetector()`.                                                                                                                       |
| `packages/database/src/snapshot-mapping.test.ts` (Step‑70 block)    | enriched + legacy `Resource` jsonb round‑trip.                                                                                                                                                                                                   |
