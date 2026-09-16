# Step 6B — HeaderDetector: First Concrete Detector Implementation

## 1. Objective

Implement the first concrete `Detector` in `@devlens/detectors`: the
`HeaderDetector`, which inspects HTTP response headers already present in
`SiteSnapshot` and produces `Detection` objects for known server/framework
signatures.

## 2. Existing contracts inspected

Before writing code, the following contracts were inspected:

### Domain types (`@devlens/core`)

- **`SiteSnapshot`** — has `http: HttpObservation`, where `HttpObservation`
  has `headers: ReadonlyArray<HttpHeader>` with `HttpHeader = { name: string, value: string }`.
- **`Detection`** — `{ technology: Technology, confidence: Confidence, evidence: ReadonlyArray<Evidence> }`.
  Created via `createDetection(technology, confidence, evidence)` — throws if evidence is empty.
- **`Technology`** — `{ id: TechnologyId, name: string, category: TechnologyCategory }`.
  `TechnologyId` created via `createTechnologyId(id)`, `TechnologyCategory` via `createTechnologyCategory(category)`.
- **`Confidence`** — branded `number` in [0, 100], created via `createConfidence(value)`.
- **`Evidence`** discriminated union — `HttpHeaderEvidence = { type: 'http_header', name: string, value: string }`
  is the evidence type for header-based detection.

### Detector boundary (already implemented in Step 6A)

- **`Detector`** interface — `detect(snapshot: SiteSnapshot): Detection[]`
- **`NullDetector`** — no-op Null Object implementation
- `Detector` was extracted to `detector.ts` (separate file) to avoid
  circular imports between `header-detector.ts` and `index.ts`.

### Application wiring (already implemented in Step 6A)

- `runScan(scan, crawler, detector, now)` — calls `detector.detect(snapshot)` after successful crawl
- `executeScan(scan, crawler, detector, repository, now)` — calls `runScan` + `persistResult`
- `ScanResult` has `readonly detections: readonly Detection[]`

### Persistence (already implemented in Step 6A)

- `snapshots` table has a `detections` JSONB column
- `PostgresScanResultRepository` persists `detections` via upsert
- `InMemoryScanResultRepository` stores + exposes `getDetections()`

## 3. Detection signatures implemented

| Header         | Value contains  | Technology | ID        | Category    | Confidence |
| -------------- | --------------- | ---------- | --------- | ----------- | ---------- |
| `Server`       | `nginx`         | nginx      | `nginx`   | `server`    | 95         |
| `Server`       | `apache`        | Apache     | `apache`  | `server`    | 95         |
| `Server`       | `microsoft-iis` | IIS        | `iis`     | `server`    | 95         |
| `X-Powered-By` | `express`       | Express    | `express` | `framework` | 90         |
| `X-Powered-By` | `php`           | PHP        | `php`     | `language`  | 90         |

### Matching rules

- **Header name**: matched case-insensitively (`Server`, `server`,
  `SERVER` are equivalent). Achieved by lowercasing the header name before
  comparison against the canonical signature name.
- **Header value**: matched case-insensitively using substring matching
  (e.g. `nginx/1.21.6 (Ubuntu)` matches the `nginx` signature, `PHP/8.1`
  matches `php`).
- **Deduplication**: if the same technology ID would be detected more than
  once (e.g. multiple matching headers), only one `Detection` is produced.
  Achieved via a `Set<string>` tracking seen IDs.
- **Empty/missing headers**: produces no errors — simply returns `[]` or
  skips the signature. `Array.prototype.find()` returns `undefined`
  gracefully.

## 4. Evidence representation

Each detection includes exactly one `HttpHeaderEvidence` item referencing
the **actual** header name and value as received from the crawler:

```typescript
{
  type: 'http_header',
  name: 'Server',           // original header name (preserves casing as received)
  value: 'nginx/1.21.6',    // original header value (preserves casing as received)
}
```

This follows the existing domain model — `HttpHeaderEvidence` was already
defined in `@devlens/core` with exactly these fields. No new evidence
structure was invented.

## 5. Files created/modified

### Created

| File                                             | Purpose                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `packages/detectors/src/detector.ts`             | `Detector` interface + `NullDetector` (extracted from `index.ts` to avoid circular imports) |
| `packages/detectors/src/header-detector.ts`      | `HeaderDetector` class + signature table                                                    |
| `packages/detectors/src/header-detector.test.ts` | 25 unit tests                                                                               |
| `docs/architecture/detectors.md`                 | Detector architecture documentation                                                         |

### Modified

| File                                                   | Change                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `packages/detectors/src/index.ts`                      | Re-exports from `./detector.js` and `./header-detector.js`      |
| `apps/web/src/app/api/scans/route.ts`                  | `NullDetector` → `new HeaderDetector()` in `createDependencies` |
| `apps/web/src/app/api/scans/route.integration.test.ts` | Integration tests use `HeaderDetector`                          |
| `apps/worker/src/main.ts`                              | `NullDetector` → `new HeaderDetector()` in `main()`             |
| `docs/architecture/overview.md`                        | Added "Detector boundary" section, updated worker description   |

## 6. Tests added

**25 tests** in `packages/detectors/src/header-detector.test.ts`, all
deterministic (no network, no database):

- **Server header signatures** (3 tests): nginx, Apache, IIS detection with evidence verification
- **X-Powered-By header signatures** (2 tests): Express, PHP detection with evidence verification
- **Case-insensitive header names** (4 tests): lowercase, uppercase variants for both headers
- **Case-insensitive value matching** (5 tests): various casing patterns for all 5 signatures
- **Multiple detections** (2 tests): nginx+PHP, nginx+Express
- **Deduplication** (1 test): PHP detected once even with duplicate headers
- **No matches** (5 tests): missing headers, unrelated headers, unknown Server value, unknown X-Powered-By value
- **Edge cases** (3 tests): empty values, whitespace-only values, `php` substring in non-matching header
- **Domain contract conformance** (1 test): verifies Detection structure matches `@devlens/core` contracts

**2 new tests** across other suites:

- `apps/web/src/app/api/scans/route.test.ts`: "includes detectors results in the response when the detector finds something"
- `packages/application/src/orchestrator.test.ts`: "runs the detector on the snapshot and includes detections in the result"

## 7. Validation results

```
pnpm lint   ✅  (ESLint + Prettier clean)
pnpm typecheck ✅  (10/10 projects)
pnpm test   ✅  167 passed | 9 skipped (176 total)
pnpm build  ✅  (10/10 projects)
madge --circular ✅  No circular dependency found

Integration tests (PostgreSQL 16.4, port 5433):
  packages/database/src/postgres-repository.test.ts: 7/7 ✅
  apps/web/src/app/api/scans/route.integration.test.ts: 2/2 ✅
```

## 8. Limitations / false-positive considerations

- **Substring matching only**: a header value containing `php` as a substring
  of a longer word (e.g. `X-Powered-By: SomePHPFramework`) would trigger a PHP
  detection. The test "does not detect php from non-X-Powered-By headers"
  verifies that `Content-Type: application/php` does NOT trigger PHP — but
  `SomePHPFramework` in `X-Powered-By` would still match. This is an accepted
  trade-off for the initial signature-based approach.
- **Spoofable headers**: both `Server` and `X-Powered-By` can be set or
  removed by the application operator. They are infrastructure hints, not
  guarantees.
- **No version extraction**: the detector records the raw header value as
  evidence but does not parse version numbers from it.
- **No negative signatures**: there is no mechanism to say "if header value is
  `unknown-server`, do not detect anything". The absence of a match is the
  default.
- **No confidence adjustment**: all signatures use a fixed confidence. No
  adjustment based on header quality or source reliability.

## 9. Recommended next step

With `HeaderDetector` in place, the pipeline is:

```
crawl → SiteSnapshot → HeaderDetector.detect() → Detection[] → ScanResult.detections → PostgreSQL JSONB
```

The natural next step is to implement **additional concrete detector
types** to broaden coverage:

1. **`MetaTagDetector`** — detects from `<meta name="generator">` tags
   (e.g. "WordPress", "Hugo", "Jekyll")
2. **`ScriptUrlDetector`** — detects from `<script src="...">` URLs
   (e.g. `react.development.js` → React)
3. **`ResourceDetector`** — detects from loaded resource URLs
   (e.g. CDN patterns for jQuery, Font Awesome)
4. **`CompositeDetector`** — runs multiple detectors and aggregates results

These would be wired into the API route and worker alongside
`HeaderDetector` via composition.
