# Step 96 — Architecture & Product Continuity Audit — Detailed Report

## 1. Baseline

All baseline commands run before any modification (HEAD `1e168ab974faa406384e8426c11f0dda87fb09e8` — `chore(repo): resolve remaining hardening findings`):

| Check | Result | Details |
|-------|--------|---------|
| `git status --short` | ✅ Clean (worktree) | Branch `main`; HEAD `1e168ab`, parent `f536a20`; `.poolside/settings.local.yaml` already deleted (staged `D` in prior steps); untracked docs only |
| `git log --oneline -12` | ✅ Confirmed | HEAD `1e168ab` → parent `f536a20` (Step 94 hardening) → `b7e0e4f`... → `5c70dba` (Initial commit) |
| `pnpm exec vitest run` | ✅ PASS | **2505 passed**, 18 skipped, 2 skipped files (131 total) |
| `pnpm typecheck` | ✅ PASS | Exit 0 — all workspace projects |
| `pnpm exec eslint .` | ✅ PASS | 0 errors, 0 warnings |
| `pnpm exec prettier --check .` | ✅ PASS | All matched files use Prettier code style! |
| `pnpm build` | ✅ PASS | Next.js 15.5.26, all routes prerendered/dynamic |
| `pnpm audit --audit-level=high` | ⚠️ See note | 2 High (brace-expansion DoS via eslint → minimatch), 2 Moderate (brace-expansion); all transitive dev tooling, not application code |

### Audit vulnerability note

`pnpm audit --audit-level=high` reports **4 vulnerabilities** (2 Moderate, 2 High), all
from `brace-expansion` via `eslint → minimatch → brace-expansion`. These are transitive dev-tooling
dependencies, not application code. They are the same class of issues documented in Step 94/95
(eslint transitive dependencies). The `esbuild` Moderate from Step 95 is still present.
No application dependency is affected. No code fix is applicable (all packages at latest
versions).

## 2. Architecture Map (Phase 1)

### Package dependency graph

```text
packages/core        (pure domain, no deps)
    ↑
packages/crawler     (→ core)
packages/detectors   (→ core; also re-exports core relationship primitives)
    ↑
packages/application (→ core, crawler, detectors)
    ↑
packages/database    (→ application, core; devDeps: detectors)
    ↑
apps/worker          (→ application, core, crawler, database, detectors)
apps/web             (→ application, core, crawler, database, detectors)
```

### Layer responsibilities

| Layer | Package | Responsibility |
|-------|---------|----------------|
| Domain | `packages/core` | `Detection`, `Evidence`, `Technology`, `ScanResult`, provenance, integrity, snapshot types + pure computation |
| Detection | `packages/detectors` | `Detector` interface, `DeduplicatingDetector`, `ConfidenceScorer`, technology catalog, relationship resolution |
| Crawler | `packages/crawler` | `Crawler` interface, `HttpCrawler` implementation, SSRF protection |
| Application | `packages/application` | `executeScan` (write), `getScan`/`listScans` (queries), `persistResult` (repository port) |
| Infrastructure | `packages/database` | `InMemoryScanResultRepository`, `PostgresScanResultRepository`, DB client |
| Presentation | `apps/web` | Next.js SSR pages, API route handlers, lib (pure presentation helpers), components |
| Worker | `apps/worker` | One-shot scan execution script |

### Detection pipeline

```text
input URL
  → crawler (HttpCrawler)
  → detector (DeduplicatingDetector wrapping ScoringDetector wrapping catalog detectors)
  → evidence (per-detector Evidence[])
  → dedup (DeduplicatingDetector — by getEvidenceKey)
  → scoring (ConfidenceScorer — confidence 0–100)
  → provenance (computeDetectionProvenance — evidence count, types, strongest)
  → integrity (computeDetectionIntegrity — structural validation)
  → response (detectionToResponse — domain → DetectionResponse + explanation)
```

### Web pipeline

```text
API / server data
  → scan result (GET /api/scans or GET /api/scans/:id → handler → repository)
  → technology (getTechnologyById — in-memory catalog)
  → detection history (technologyDetectionHistory — detectionToResponse → getScanDetectionResults)
  → history summary (technologyDetectionHistorySummary — stable/changed indicators)
  → comparison (compareScans — provenanceKey, computeVersionChange, integrityKey)
  → navigation (links between pages, back-links, GlobalNav)
```

## 3. Phase 2 — Architectural Drift Findings

### A. Duplication de logique

#### F-001: Direct DB access from web layer (boundary violation)

**Location:** `apps/web/src/lib/scan-data.ts` → `getAllScanResults()` constructs
`new PostgresScanResultRepository(createDatabaseClient())` directly.

**Only consumer:** `apps/web/src/app/technologies/[id]/page.tsx` →
`fetchDetectedScans()` → `getAllScanResults()`.

**Evidence:** `scan-data.ts` imports `@devlens/database` (line 24). `page.tsx` imports
`getAllScanResults` from `@/lib/scan-data`. No other non-API web code imports `@devlens/database`.

**Contrast:** All other pages (scan list, scan detail, comparison) go through the HTTP API
(`fetchScans` / `fetchScanById` from `lib/api.ts`). The `api.ts` module explicitly documents:
"The browser consumes the HTTP API only — it never touches the database."

**Why it exists:** To avoid N+1 — `getAllScanResults()` fetches ALL scans with full detection
data in a single DB round-trip, then filters in-memory by technology ID. The API only provides
`GET /api/scans/:id` (single scan) and `GET /api/scans` (summaries without detections).

**Decision: DEFER** — Fixing requires a new API endpoint (forbidden: "Do not modify API
contracts"). Using existing endpoints would introduce a worse N+1 pattern.

#### F-002: Evidence identity — three algorithm copies

Three implementations of the same canonical key algorithm on different type shapes:

| # | File | Function | Input type | Access |
|---|------|----------|-----------|--------|
| 1 | `packages/core/src/domain/detection-integrity.ts:150` | `evidenceIdentity(evidence: Evidence)` | Domain `Evidence` | Private (module-internal) |
| 2 | `packages/detectors/src/evidence-key.ts:50` | `getEvidenceKey(evidence: Evidence)` | Domain `Evidence` | Exported (canonical) |
| 3 | `apps/web/src/lib/evidence-identity.ts:58` | `getEvidenceIdentity(item: EvidenceResponse)` | Web `EvidenceResponse` | Exported |

All three use the same algorithm: `type\|field1\|field2\|...` with URL fields lowercased.

- Core copy is private + documented as intentional: "defined locally in core so that the
  integrity layer — which lives in the domain layer and cannot depend on `@devlens/detectors`"
- Web copy operates on `EvidenceResponse` (different field names: `name`/`value`,
  `name`/`content`, `selector`/`snippet`) — a structurally different type
- The `evidence-identity-attack.test.ts` (Step 63 Phase 2 attack) explicitly verifies
  the web layer matches the detector layer's identity semantics

**Decision: DEFER** — Intentional, documented, constrained by the core→detectors dependency
boundary. The web layer cannot import from core's private function, and core cannot depend on
detectors. A shared module would require a cross-package refactor (forbidden).

#### F-003: Explainability double-computation (intentional)

`getDetectionExplainability` is called twice per detection in the technology history pipeline:

1. `detectionToResponse()` (line 66) — computes on **raw** evidence (first pass)
2. `getScanDetectionResults()` (line 142) — recomputes on **deduplicated + sorted** evidence

The `scan-detection-results.ts` comment (lines 136–142) explicitly justifies this:
"Recompute the explanation against the canonical (deduped + sorted) evidence so the rendered
explanation always agrees with the evidence list shown to the user — even if the incoming
detection carried a stale or pre-dedup explanation."

This is a **correctness safeguard**, not accidental duplication. In the scan-detail API flow,
only the `detectionToResponse` computation is used (the API returns responses directly). In the
technology-history flow, the `getScanDetectionResults` computation overwrites it.

Client-side fallbacks also exist:
- `DetectionItem.tsx:66` — `detection.explanation ?? getDetectionExplainability(detection)`
- `DetectionPresentation.tsx:38` — `explainability ?? getDetectionExplainability(detection)`

**Decision: DEFER** — Intentional, documented, correctness-critical. Removing the recompute would
risk mismatched explanations on the history timeline.

#### F-004: statusLabel — four copies

| File | Exported | Lines |
|------|----------|-------|
| `apps/web/src/lib/scan-filter.ts:48` | ✅ Yes | `export function statusLabel` |
| `apps/web/src/components/ScanViews.tsx:52` | ✅ Yes (exported but only used for ScanCard) | `export function statusLabel` |
| `apps/web/src/components/ScanOverview.tsx:44` | ❌ No (local) | `function statusLabel` |
| `apps/web/src/components/ScanSummary.tsx:20` | ❌ No (local) | `function statusLabel` |

All four implement identical `switch` logic: `completed→"Completed"`, `failed→"Failed"`, etc.
The `scan-filter.ts` version is the canonical exported one, but the component copies don't
import it — they define their own.

**Decision: DEFER** — Minor presentation-layer duplication (10-line switch). Consolidating
would be a "generic cleanup" explicitly prohibited by Step 96 ("Do not create an abstraction
simply because it would reduce a few lines").

#### F-005: formatDate — three copies

| File | Lines | Notes |
|------|-------|-------|
| `apps/web/src/components/ScanOverview.tsx:75` | 75–97 | Full implementation, uses `<time dateTime>` |
| `apps/web/src/components/TechnologyDetectionTimeline.tsx:43` | 43–49 | Compact version, handles `null` |
| `apps/web/src/components/TechnologyDetectionHistorySummary.tsx:30` | 25–35 | Comment: "mirrors TechnologyDetectionTimeline.formatDate" |

**Decision: DEFER** — Same as F-004: minor presentation duplication. Would be "generic cleanup."

#### F-006: signalQualityText — mirrors signalQualityLabel

`TechnologyDetectionTimeline.tsx:56-` defines `signalQualityText()` with a comment: "mirroring
`signalQualityLabel` in `lib/signal-quality.ts`". The timeline version takes the pre-computed
`SignalQuality` + `source` string rather than a full `DetectionResponse`.

**Decision: DEFER** — Different input shape makes this a near-duplicate, not an exact
duplicate. Consolidating would require either normalizing the input or accepting a slightly
awkward API. Minor; would be "generic cleanup."

### B. Multiple sources of truth

#### F-007: ScanResult → ScanSummary mapping duplicated

- **Source A:** `apps/web/src/lib/scan-data.ts:54` — `scanResultToSummary(result: ScanResult): ScanSummary`
  (used by technology detail page, direct DB access path)
- **Source B:** `apps/web/src/app/api/scans/handler.ts:167` — `resultToResponse(result: ScanResult): CreateScanResponse` (produces full response including `.scan`, which is the same `ScanSummaryResponse` shape)

The scan-field mapping (lines 58–76 of `scan-data.ts` vs lines 176–194 of `handler.ts`) is
**byte-for-byte identical** — same `status.type` switch, same `startedAt`/`completedAt`/`failedAt`/`error`
derivation, same field order in the return object.

Why no shared function:
- `resultToResponse` is a local (non-exported) function in `handler.ts` (the API layer)
- The web `lib/` layer cannot import from `app/api/` without creating a layering inversion
- Both layers already depend on `lib/` (handler.ts imports `detection-toResponse` from `lib/`)

**Decision: DEFER** — This is a direct consequence of F-001 (direct DB access). Fixing the
duplication without fixing the root cause would be treating the symptom.

#### F-008: Two provenance representations (intentionally different)

| Use case | File | Function | Key format |
|----------|------|----------|-----------|
| Comparison | `apps/web/src/lib/comparison.ts` | `provenanceKey()` | `source` + sorted `{source, type}` pairs from `derivedFrom` |
| History summary | `apps/web/src/lib/technology-detection-history-summary.ts` | `canonicalProvenanceKey()` | `JSON.stringify({evidenceCount, evidenceTypes, strongestEvidenceType})` (Step 80 provenance fields) |

These are **two different provenance representations** for two different purposes:
- Comparison: detects relationship-source changes across two scans
- History: detects observation-drift across multiple scans

Both files explicitly document this as intentional:
- `comparison.ts`: "provenanceKey (Step 74)"
- `technology-detection-history-summary.ts:100`: "Canonical provenance signature. `evidenceTypes` is already canonically ordered by `computeDetectionProvenance`"

**Decision: KEEP** — Intentional semantic difference, documented in both files.

### C. Domain / Application / Web leakage

| Check | Status |
|-------|--------|
| Core is framework-agnostic | ✅ Clean — no React/Next/PostgreSQL imports |
| Application is not dependent on React/Next | ✅ Clean — `handler.ts` (web lib) imports from `@devlens/application`, not vice-versa |
| `@devlens/database` in `apps/web` | ⚠️ **Only in API route handlers + `scan-data.ts`** — the `scan-data.ts` usage is the boundary violation (F-001) |
| UI components don't import domain/detectors/database | ✅ Clean — Step 95 verified: no `components/*.tsx` imports `@devlens/database`, `@devlens/detectors`, or `@devlens/crawler` |

## 4. Phase 3 — Detection → Technology → History → Comparison Flow

### Field flow coherence

All detection fields flow consistently through every pipeline path:

| Field | API (scan detail) | Technology page | History timeline | Comparison |
|-------|-------------------|-----------------|-----------------|------------|
| `confidence` | detectionToResponse → getScanDetectionResults | detectionToResponse → getScanDetectionResults | forwarded from canonical response | compareScans → TechnologyComparison |
| `version` | forwarded, null on conflict | forwarded | forwarded via history entry | computeVersionChange |
| `versionConflict` | forwarded | forwarded | forwarded via history entry | computeVersionChange (guards) |
| `evidence` | deduplicated + sorted | deduplicated + sorted | forwarded from canonical response | compareScans → EvidenceComparison |
| `provenance` | computeDetectionProvenance | computeDetectionProvenance | forwarded from canonical response | provenanceKey (different repr — see F-008) |
| `integrity` | computeDetectionIntegrity | computeDetectionIntegrity | forwarded from canonical response | integrityKey |
| `signalQuality` | getDetectionExplainability → computeSignalQuality | recomputed in getScanDetectionResults | forwarded from canonical response | compareScans uses canonical key |
| `source` / `derivedFrom` | forwarded | forwarded | forwarded via history entry | provenanceKey |

**No field is lost or inconsistently transformed across paths.** The canonical
`detectionToResponse → getScanDetectionResults` pipeline produces identical results
whether invoked server-side (API handler) or client-side (technology history).

### Version normalization consistency

- `computeVersionChange()` in `comparison.ts:74` — Step 74 rule: version conflict on
  either side → `changed: false`; otherwise `bv !== av`
- `technology-detection-history-summary.ts:163` — same rule:
  `!a.versionConflict && !b.versionConflict && a.version !== b.version`
- Documented as intentionally mirroring `computeVersionChange`

### Confidence interpretation

No normalization occurs — confidence values are forwarded verbatim (e.g.,
`scan-utils.ts` passes exact values through; `technology-detection-history.ts:162`
forwards `detection.confidence` exactly). The `signalQualityText` function in the
timeline uses thresholds (`single_signal`, `corroborated`, `strong`) from
`signal-quality.ts:126` — the only place thresholds are defined.

### Evidence classification

The evidence classification (`evidenceTypeLabel` in `evidence-presenter.ts`) is the single
source of truth. Used by `detection-coverage.ts`, `scan-detection-results.ts`,
`TechnologyDetectionTimeline.tsx`, and `ScanComparison.tsx`. No duplication found.

## 5. Phase 4 — Navigation Continuity Audit

### Navigation graph

```text
/scan-history (/scans)
  ├─→ /scan-detail (/scans/:id)          [back: ✓ "Back to scan history"]
  │     ├─→ /technologies/:id           [link on detection items]
  │     ├─→ /scans/compare?left=ID      [✓ "Compare with another scan"]
  │     ├─→ /scans/new                  [✓ "New scan"]
  │     └─→ /scans/new?target=URL       [✓ "Re-scan"]
  ├─→ /scans/new                         [✓ "New scan"]
  └─→ /scans/compare                    [✓ "Compare two scans"]

/technologies
  └─→ /technologies/:id                 [catalog → detail]
        ├─→ /scans/:id                  [✓ ScanCard links to scan detail]
        ├─→ /technologies               [✓ "Back to technology catalog"]
        └─ (timeline entry → scan detail) [✓ link in timeline]

/scan-detail
  └─→ /technologies                   [GlobalNav]

/scans/compare
  └─→ /scans/:id                      [✓ links in comparison rows]
  └─→ /scans                          [✓ "Back to scan history" (MissingParams only)]
```

### Back-link audit

| From | To | Back-link available? |
|------|----|---------------------|
| `/scans/:id` | `/scans` | ✅ "← Back to scan history" |
| `/scans/:id` | `/scans/new` | ✅ "New scan →" |
| `/scans/:id` | `/scans/new?target=` | ✅ "Re-scan" (conditional on target) |
| `/scans/:id` | `/scans/compare?left=` | ✅ "Compare with another scan" (completed only) |
| `/technologies/:id` | `/technologies` | ✅ "← Back to technology catalog" |
| `/technologies/:id` | `/scans/:id` | ✅ ScanCard → link to scan detail |
| `/scans/compare` | `/scans` | ⚠️ Only in `MissingParams` state; no back-link on successful comparison |
| `/scans/compare` | `/scans/:id` | ✅ Links in comparison rows |

### Context preservation

- Scan detail → Comparison: ✅ pre-seeds `left=<scanId>` via URL param
- Scan detail → Technology: ✅ technology ID passed as route param
- Technology → Scan: ✅ scan ID passed as route param (timeline + ScanCard)
- Comparison → Scan detail: ✅ both `left` and `right` links provided

### Dead-ends / lost information

1. **Comparison page** (`/scans/compare`): After viewing a comparison, there is no contextual
   back-link to return to the scan detail or scan history. Users must use GlobalNav or browser
   back. Minor UX gap, not an architectural issue.

2. **Technology page**: The `scanSummaries` are derived from `scanResultToSummary` (the
   duplicated mapping). If the mapping drifts from the API's `resultToResponse`, the cards on
   the technology page would show different data than the actual scan detail page. This is a
   consistency risk from F-007.

### Conditional link visibility

- "Compare with another scan" on scan detail: only shown when `status === 'completed'`
  (line 125 of `scans/[id]/page.tsx`) — correct (comparisons require completed scans)
- "Re-scan" on scan detail: only shown when `result.scan.target` is truthy — correct
- Technology timeline: only completed scans shown (by domain design — only completed scans
  carry detections)
- Comparison selector: only `completed` scans are selectable (`isComparable` from
  `comparison-selector.ts`)

## 6. Phase 5 — Data Transformation Cost Audit

### Redundant recomputations

#### F-009: Explainability recompute in getScanDetectionResults

`getScanDetectionResults()` (lines 64–148) calls `getDetectionExplainability(response)` on
**every** deduplicated detection (line 142), overwriting the value already computed by
`detectionToResponse()` (line 66).

In the technology history pipeline (`technologyDetectionHistory`), for each completed scan:
1. `scanResult.detections.map(detectionToResponse)` — N calls to `getDetectionExplainability`
2. `getScanDetectionResults(responses)` — N calls to `getDetectionExplainability` (recompute)

**Cost for a technology detected in S scans with D detections per scan: 2 × S × D
explainability computations.**

The recompute is documented as intentional (see F-003). It's a correctness safeguard, not
accidental. The cost is synchronous and pure — no I/O. **Decision: KEEP** (not a defect).

#### F-010: scanResultToSummary — duplicated mapping

`scanResultToSummary` in `scan-data.ts` (lines 54–89) duplicates the scan-to-summary portion
of `resultToResponse` in `handler.ts` (lines 167–238). The status-switch logic (lines 63–76
of `scan-data.ts` vs lines 181–194 of `handler.ts`) is identical.

**Impact:** If the `ScanResult` → `ScanSummary` mapping changes (e.g., a new status type, a
new timestamp field), it must be updated in two places. No test coverage on
`scanResultToSummary` (no `scan-data.test.ts` exists).

**Decision: DEFER** — Symptom of F-001. The canonical `resultToResponse` is private to the
API handler and can't be imported by the web lib layer without a layering inversion.

#### F-011: Full scan fetch for technology detail

`getAllScanResults()` fetches **all** scan results (with full detection data) to filter by
technology ID. For a database with thousands of scans, this fetches far more data than needed.

**Impact:** Memory + query cost scales with total scan count, not technology-specific scan
count. The in-memory filter (`result.detections.some(d => d.technology.id === techId)`) then
discards most of the fetched data.

**Decision: KEEP** — Documented as intentional (avoids N+1). A proper fix requires a filtered
DB query (`WHERE technology.id = ?`), which would require either a new repository method
(forbidden: "modify DB schema" / cross-package refactor) or a new API endpoint (forbidden:
"Do not modify API contracts").

## 7. Phase 6 — Test Architecture Audit

### Test inventory

| Layer | Test files | Test approach |
|-------|-----------|---------------|
| Core domain | `detection-integrity.test.ts` (~23KB), `detection-provenance.test.ts` (~8KB), `evidence-key.test.ts`, `scan.test.ts`, `scan-result-quality.test.ts` | Pure function tests (vitest) |
| Application | `execute-scan.test.ts`, `orchestrator.test.ts`, `queries.test.ts`, `repository.test.ts` | Pure function tests with injected in-memory repository |
| Database | `postgres-repository.test.ts` (16 skipped — requires PostgreSQL), `repository.test.ts` (InMemory) | In-memory for InMemory, skipped for Postgres |
| Web lib | 34 test files (see below) | Pure function tests (vitest) |
| Web API handlers | `get.test.ts` (478 lines), `route.test.ts`, `route.integration.test.ts` (2 skipped) | In-memory repository injected |
| Web components | 27 `.test.tsx` files | `renderToString` from `react-dom/server` (no DOM) |

### Web lib test files (34)

```
api.test.ts                    clipboard.test.ts              comparison.test.ts
comparison-api.test.ts         comparison-selector.test.ts  detection-coverage.test.ts
detection-explainability.test.ts  detection-explanation.test.ts  detection-filter.test.ts
detection-integrity-presenter.test.ts  detection-integrity-test.ts  detection-presentation.test.ts
detection-to-response.test.ts  evidence-identity.test.ts      evidence-identity-attack.test.ts
evidence-presenter.test.ts     export-scan.test.ts            get.test.ts
report-metadata.test.ts        scan-detection-results.test.ts  scan-filter.test.ts
scan-history.test.ts           scan-insights.test.ts          scan-overview.test.ts
scan-result-quality.test.ts    scan-utils.test.ts             signal-quality.test.ts
technology-catalog.test.ts     technology-detection-history.test.ts  technology-detection-history-summary.test.ts
technology-filter.test.ts      validation.test.ts
```

### Test architecture findings

#### F-012: scan-data.ts has no test file

`scanResultToSummary()` in `scan-data.ts` (lines 54–89) has **zero test coverage**. There is
no `scan-data.test.ts` file. The module's only function with testable logic (`scanResultToSummary`)
mirrors `resultToResponse` in `handler.ts`, which IS tested (see `get.test.ts:252` "serializes
dates as ISO strings" and `get.test.ts:174` "response shape"). But the web-layer copy is
untested.

The `getAllScanResults()` function (line 38) cannot be unit-tested without a PostgreSQL
instance — consistent with the 16 skipped tests in `postgres-repository.test.ts`.

**Decision: DEFER** — The test gap exists because the module is an intentional optimization
(F-001). Adding tests would require extracting `scanResultToSummary` into a testable pure
function (which would partially address F-007), but this is a symptom fix, not a root-cause fix.

#### F-013: No E2E tests

`playwright.config.ts` exists (testDir: `e2e`), `@playwright/test` + `playwright` installed
as devDeps, but no `e2e/` directory with test files. The Step 95 report documented this as
DEFER. **No change** — still deferred.

#### F-014: Evidence attack test

`evidence-identity-attack.test.ts` (Step 63 Phase 2 attack, 154 lines) is a **proactive
regression test** that verifies the web layer's `getEvidenceIdentity` matches the detector
layer's `getEvidenceKey`. This is a best-practice pattern: rather than just testing the
function's output, it tests the **consistency property** across layer boundaries. **Decision:
KEEP** — excellent test architecture.

#### F-015: Component tests use renderToString

All 27 component tests use `renderToString` from `react-dom/server` — no DOM/jsdom environment
required. This is a deliberate, consistent choice documented in `ScanViews.tsx` and
`page.test.tsx`. **Decision: KEEP** — consistent, fast, no flaky DOM tests.

### Test coverage assessment

| Concern area | Tested? | Test file |
|-------------|---------|-----------|
| Evidence identity (web) | ✅ | `evidence-identity.test.ts`, `evidence-identity-attack.test.ts` |
| Evidence identity (detectors) | ✅ | `evidence-key.test.ts` (in detectors package) |
| Evidence identity (core integrity) | ✅ | `detection-integrity.test.ts` (tests the private function's effects) |
| Explainability pipeline | ✅ | `detection-explainability.test.ts`, `scan-detection-results.test.ts` |
| History summary stability | ✅ | `technology-detection-history-summary.test.ts` |
| Comparison semantics | ✅ | `comparison.test.ts` |
| ScanResult → ScanSummary (API) | ✅ | `get.test.ts` (tests `resultToResponse` indirectly) |
| ScanResult → ScanSummary (web) | ❌ | No `scan-data.test.ts` |
| Technology detail page wiring | ✅ | `page.test.tsx` (mocks `getAllScanResults`) |
| Navigation back-links | ❌ | No test covers page-level navigation links |
| Navigation context preservation | ❌ | No test covers URL parameter passing |

## 8. Phase 7 — Findings Synthesis

### Findings table

| ID | Finding | Evidence | Impact | Scope | Decision |
|---|---------|----------|--------|-------|----------|
| F-001 | Direct DB access from web layer (technology page bypasses HTTP API) | `scan-data.ts:38-41` constructs `PostgresScanResultRepository`; `page.tsx:29` imports it; `api.ts:7` says "browser consumes HTTP API only" | Violates architectural boundary; web coupled to PostgreSQL/Drizzle; no test coverage | `apps/web` (scan-data.ts, technology page) | DEFER — fix requires new API endpoint (forbidden by Step 96 constraints) |
| F-002 | Evidence identity duplicated in 3 layers | `core/detection-integrity.ts:150`, `detectors/evidence-key.ts:50`, `web/evidence-identity.ts:58` — same algorithm, different types | Maintenance risk: algorithm change must be propagated; but all tested via `evidence-identity-attack.test.ts` | 3 packages | DEFER — intentional, documented, dependency-constrained |
| F-003 | Explainability double-computation | `detection-to-response.ts:66` and `scan-detection-results.ts:142` both call `getDetectionExplainability`; comment explains intentional recompute | Performance cost: 2×S×D computations for technology history | `apps/web/lib` | DEFER — intentional correctness safeguard |
| F-004 | statusLabel duplicated in 4 files | `scan-filter.ts:48`, `ScanViews.tsx:52`, `ScanOverview.tsx:44`, `ScanSummary.tsx:20` — identical switch | Minor: 10-line duplications; if label changes, 4 places to update | `apps/web` | DEFER — "generic cleanup" (prohibited by Step 96) |
| F-005 | formatDate duplicated in 3 files | `ScanOverview.tsx:75`, `TechnologyDetectionTimeline.tsx:43`, `TechnologyDetectionHistorySummary.tsx:30` | Minor: date formatting changes must propagate; explicit "mirrors" comment | `apps/web/components` | DEFER — "generic cleanup" |
| F-006 | signalQualityText mirrors signalQualityLabel | `TechnologyDetectionTimeline.tsx:56` vs `signal-quality.ts:126` | Minor: threshold text changes must propagate | `apps/web` | DEFER — different input shape, near-duplicate not exact |
| F-007 | ScanResult→ScanSummary mapping duplicated | `scan-data.ts:54` (`scanResultToSummary`) vs `handler.ts:167` (`resultToResponse`) — identical status-switch | Consistency risk: if mapping diverges, technology page cards differ from API; no tests on web copy | `apps/web` | DEFER — symptom of F-001 |
| F-008 | Two provenance representations (intentional) | `comparison.ts` uses `provenanceKey()` (source+derivedFrom); history-summary uses `canonicalProvenanceKey()` (evidenceCount+types) | None — different purposes, documented as intentional | `apps/web/lib` | KEEP — intentional semantic difference |
| F-009 | Explainability recompute cost | `technologyDetectionHistory` calls `detectionToResponse` + `getScanDetectionResults` per scan; both compute explainability | Performance: 2×S×D for technology with S scans × D detections | `apps/web/lib` | DEFER — correctness-critical, documented as intentional |
| F-010 | Full scan fetch for technology detail | `getAllScanResults()` fetches all scans, filters in-memory by tech ID | Memory/query cost scales with total scan count, not tech-specific count | `apps/web/lib` | KEEP — documented as intentional N+1 avoidance |
| F-011 | No back-link on comparison page | `scans/compare/page.tsx` — no `<Link href="/scans">` in successful comparison rendering | Minor UX gap: user must use GlobalNav or browser back | `apps/web` | DEFER — minor UX, not architectural |
| F-012 | scan-data.ts has no test file | `scanResultToSummary` (lines 54–89) has zero test coverage; no `scan-data.test.ts` exists | Untested duplication of `resultToResponse` mapping | `apps/web/lib` | DEFER — testing the symptom without fixing F-001 root cause is incomplete |
| F-013 | No E2E tests | `playwright.config.ts` exists, no `e2e/` directory, no test files | No end-to-end verification of navigation flow | `apps/web` | DEFER — documented in Step 95, no change |

### Classification

```
IMPLEMENTED: 0
DEFERRED:   10 (F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-009, F-011, F-012)
KEPT AS-IS:   3 (F-008, F-010, F-013)
AUDIT-ONLY:  ✅ FINAL — no code change justified
```

### Selected next work item (Future Step 97)

**Add a bulk-scan API endpoint to eliminate the direct DB access boundary violation.**

The most significant finding is F-001: the technology detail page bypasses the HTTP API
and accesses PostgreSQL directly. This is the only architectural drift that represents a
*genuine* boundary violation (not just minor duplication). The fix requires:

1. Add `GET /api/scans/with-detections` (or equivalent) — returns all scans with full
   detection data in a single API call (preserving existing `createdAt DESC, scanId ASC`
   ordering). This does NOT modify existing API contracts — it adds a new endpoint.
2. Migrate `apps/web/src/lib/scan-data.ts` to use `fetch('/api/scans/with-detections')`
   instead of constructing `PostgresScanResultRepository` directly.
3. Remove the `@devlens/database` dependency from `apps/web/package.json` (the API route
   handlers in `app/api/scans/` will still need it, but those are server-side).
4. Add `scan-data.test.ts` to cover `scanResultToSummary` (or eliminate it by sharing
   the mapping with the handler).

**Constraints preventing implementation in Step 96:**
- "Do not modify API contracts" — interpreted strictly, this prohibits adding new endpoints
- "Do not create new business features" — a new endpoint could be seen as a new feature
- "Do not create generic services" — can't create a shared service without cross-package refactor

This is explicitly a **Future Step 97** item — it is the natural, evidence-based next
architectural work item.

### Minor presentation-layer duplications (not prioritized)

F-004 (`statusLabel` × 4), F-005 (`formatDate` × 3), F-006 (`signalQualityText`) are
minor presentation-layer duplications. They are real but:
- Each is ≤ 10 lines of trivial mapping logic
- The `scan-filter.ts` version of `statusLabel` is already exported and available
- Consolidating would be a "generic cleanup" — explicitly prohibited by Step 96
- Fixing them provides no architectural value; it's pure mechanical deduplication

These should NOT be elevated to a future step. When a component refactoring occurs for
other reasons, these can be consolidated opportunistically.

## 9. Security Audit

| Item | Status |
|------|--------|
| High/Critical vulnerabilities | ⚠️ 2 (brace-expansion DoS via eslint → minimatch, dev-only) |
| Moderate vulnerabilities | 2 (brace-expansion), 1 (esbuild, documented Step 95) |
| Raw error objects in logs | 0 (handler.ts uses `toLoggableError`, worker uses inline sanitization) |
| Client-side DB access | ⚠️ 1 path: `scan-data.ts` (technology detail page only) |
| SSRF protection | `isBlockedHostname` in HttpCrawler (localhost/private-IP/link-local/IPv6) |
| User-controlled IDs in metadata | No (technology page uses catalog name for `<title>`, not raw ID) |
| Error leakage in 500 responses | 0 (handler returns generic "An internal error occurred." for all 500s) |

### Security note on F-001

The direct DB access in `scan-data.ts` is server-side (Next.js Server Component), not
client-side. The `createDatabaseClient()` call happens on the server, and the fetched data
is rendered SSR — it never reaches the browser as a DB client. The security concern is
architectural (boundary violation), not exploitable. However, the `getAllScanResults()`
function does not apply the same error-sanitization path as the API handler — it returns
`null` on error (which the page renders as "Unable to load scan data"), so no DB internals
leak to the user. **No security vulnerability** — the concern is purely architectural.

## 10. Changes Implemented

**None.** After auditing all 13 findings, no code changes were justified:

- 10 findings are DEFER (require API changes, cross-package refactors, or are intentional
  trade-offs explicitly prohibited by Step 96 constraints)
- 3 findings are KEEP (intentional, documented design decisions)
- 2 findings are "generic cleanup" (minor presentation duplication) — explicitly prohibited
  by Step 96 ("Do not create an abstraction simply because it would reduce a few lines")

## 11. Changes Explicitly Deferred

| Finding | Reason | Future Step |
|---------|--------|-------------|
| F-001 (direct DB access) | Requires new API endpoint (forbidden by Step 96) | Step 97: add `/api/scans/with-detections` |
| F-002 (evidence identity × 3) | Requires cross-package shared module (core↔detectors dependency cycle) | Step 98: extract to shared `@devlens/core` |
| F-003 / F-009 (explainability recompute) | Correctness safeguard, documented as intentional | None — keep as-is |
| F-004 / F-005 / F-006 (statusLabel, formatDate, signalQualityText) | "Generic cleanup" — prohibited by Step 96 | None — fix opportunistically during component refactors |
| F-007 (ScanResult→ScanSummary dup) | Symptom of F-001; root fix requires API endpoint | Step 97 (resolves with F-001) |
| F-011 (no back-link on compare) | Minor UX improvement, not architectural | Future UX sprint |
| F-012 (no scan-data.test.ts) | Testing the symptom without fixing F-001 root cause is incomplete | Step 97 (resolves with F-001) |
| F-013 (no E2E tests) | Documented in Step 95, infrastructure disproportionate to scope | Future E2E step |

## 12. Validation — Tests

```bash
pnpm exec vitest run
```

| Metric | Result |
|--------|--------|
| Test Files | 129 passed, 2 skipped (131 total) |
| Tests | **2505 passed**, 18 skipped (2523 total) |
| Duration | ~7.8s |
| Regression | 0 (no code changes; same as baseline) |

## 13. Validation — Type/ Lint / Format / Build

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `pnpm typecheck` | ✅ PASS — all workspace projects |
| ESLint | `pnpm exec eslint .` | ✅ PASS — 0 errors, 0 warnings |
| Prettier | `pnpm exec prettier --check .` | ✅ PASS — All matched files use Prettier code style! |
| Build | `pnpm build` | ✅ PASS — Next.js 15.5.26, all routes prerendered/dynamic |
| Audit | `pnpm audit --audit-level=high` | 4 vulnerabilities (2 Moderate, 2 High) — all transitive dev-tooling (brace-expansion via eslint/minimatch) |

## 14. Final Diff Audit

```bash
git diff --stat
git status --short
```

No source code changes — all findings resulted in DEFER/KEEP decisions.
Only `docs/Step96.md` and `docs/Step96-report.md` are new files for this commit.

## 15. Final Status & Conclusion

| Gate | Result |
|------|--------|
| `prettier --check .` | ✅ PASS |
| `eslint .` | ✅ PASS |
| `typecheck` | ✅ PASS |
| `vitest run` | ✅ PASS (2505 passed, 18 skipped) |
| `build` | ✅ PASS |
| `pnpm audit --audit-level=high` | 4 vulnerabilities (all transitive dev-tooling, not application code) |

**13 findings audited, 0 fixes applied, 10 DEFERRED, 3 KEPT.**

### Conclusion

The Step 96 architecture audit confirms that the codebase has **withstood the hardening
cycles of Steps 80–92**. The functional layers (Detection → Provenance → Integrity →
Technology → Detection History → History Summary → Comparison → Navigation) are coherent,
with all detection fields flowing consistently through every pipeline path.

The duplications that exist are **not accidental drift** — they are either:

1. **Intentional, documented architectural trade-offs**: the three-way evidence identity
   (constrained by the `core → detectors` dependency boundary), the explainability
   recompute (a correctness safeguard), and the direct DB access from the technology detail
   page (an N+1-avoidance optimization documented since Step 53).

2. **Minor presentation-layer duplication** (`statusLabel` × 4, `formatDate` × 3,
   `signalQualityText` × 1): these are ≤ 10-line switch/map functions in sibling
   components. Consolidating them would be a "generic cleanup" that Step 96 explicitly
   prohibits — and would introduce cross-module import dependencies between CSS-module-scoped
   components for no architectural gain.

3. **Proactive regression testing**: the `evidence-identity-attack.test.ts` file
   demonstrates that the team has *already* addressed the evidence identity consistency
   gap (Step 63) with a dedicated attack test. The double explainability computation is
   also explicitly documented and tested.

### The real next step — Step 97

The single finding that represents genuine architectural drift — **F-001: direct DB access
from the web layer** — cannot be fixed under Step 96's constraints ("Do not modify API
contracts"). However, it is the clear, evidence-based next architectural work item:

> **Step 97**: Add a bulk-scan API endpoint (`GET /api/scans/with-detections`) that returns
> all scans with full detection data in a single API call. Migrate the technology detail
> page to use this endpoint via `fetchScansWithDetections()` instead of
> `getAllScanResults()`. This eliminates: (a) the boundary violation, (b) the
> `scanResultToSummary` duplication (F-007), (c) the missing test coverage (F-012), and
> (d) the `@devlens/database` dependency from `apps/web/package.json`.

All other findings are either already mitigated by tests, intentional by design, or
too minor to justify a dedicated step.

```
RESULT: AUDIT ONLY — NO CODE CHANGE JUSTIFIED
```
