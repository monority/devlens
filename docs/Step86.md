# DevLens — Step 86 — Detection Integrity UI

## Objective

Surface the existing Step 81 `DetectionIntegrity` diagnostics in the web UI.

Step 81 introduced a pure, deterministic, structural validator —
`computeDetectionIntegrity(detection, provenance?)` — that flags when a
finalized detection's evidence, technology identity, or provenance are
internally inconsistent. The validator attaches an `integrity?:
DetectionIntegrity` verdict to each `DetectionResponse` (present only when
`valid === false`), but **the UI never surfaced it** — it was explicitly
deferred (Step 81 §17: "no issue = no additional UI").

Step 86 closes that deferral with a bounded UI completion: a pure
presentation layer, a scan-level integrity summary panel, and a
per-detection integrity notice — all consuming the existing Step 81
contract, never recomputing it.

---

## Previous Step 81 deferral

Step 81 §17 explicitly stated that the integrity verdict is a server-side
diagnostic attached to the API response only when `valid === false`, and
that **no UI badge or label was added** ("no issue = no additional UI").
`DetectionItem.tsx` was unchanged by Step 81.

This Step 86 work completes that deferral: the `DetectionResponse.integrity`
field (already shipped by Step 81) is now rendered in the scan detail view.

---

## UI architecture

```text
API (Step 81)
  │  DetectionResponse.integrity?  ← present only when valid === false
  │
  ▼
apps/web/src/lib/detection-integrity-presenter.ts  ← pure presenter
  │  summarizeIntegrity(detections) → ScanIntegritySummary
  │
  ▼
ScanDetailView.tsx
  ├─ DetectionIntegritySummary  ← scan-level panel (Step 86 §5)
  └─ DetectionItem              ← per-detection notice (Step 86 §6)
```

The presenter is a **pure** module — no React, no HTTP, no DB. It reads
the already-computed `DetectionResponse.integrity` verdicts and
aggregates them. It never calls `computeDetectionIntegrity`.

### Presenter responsibilities

**File:** `apps/web/src/lib/detection-integrity-presenter.ts`

- Maps each of the 5 canonical `DetectionIntegrityIssue` types to a
  human-readable label + tooltip description (single source of truth:
  `INTEGRITY_ISSUE_LABELS`).
- Aggregates per-detection verdicts into a scan-level `ScanIntegritySummary`
  via `summarizeIntegrity(detections)`.
- Preserves canonical `INTEGRITY_ISSUE_ORDER` for deterministic output.
- Is a pure, immutable read over a readonly detections slice.

The presenter answers: _"How should existing integrity diagnostics be
presented?"_ — never _"Is this detection structurally valid?"_

### Scan-level summary

**File:** `apps/web/src/components/DetectionIntegritySummary.tsx`

- Renders a `<section>` with `<h2>Detection integrity</h2>`.
- **Only appears when ≥1 detection carries an integrity issue**
  (`affectedDetectionCount === 0` → returns `null`).
- Shows: "N detection(s) with M issue(s)" followed by one `<p>` line per
  issue type (label + count), in canonical order.
- Reuses the existing `ResultQualitySummary` visual language: calm gray
  palette (`#4b5563` / `#6b7280`, `.8rem`), no icons, no badges, no
  gradients, no animations.
- Integrated into `ScanDetailView` immediately after
  `ResultQualitySummary` and before `ScanInsights`.

### Per-detection visibility

**File:** `apps/web/src/components/DetectionItem.tsx` (modified)

- Valid detection (`integrity` absent) → **no integrity notice**.
- Invalid detection (`integrity.valid === false`) → a small amber inline
  notice in the detection header:
  - Text: "Integrity issue" / "Integrity issues" + comma-separated labels.
  - Tooltip (`title` attribute): the full issue descriptions joined by `; `.
- The existing provenance "signals" line and all other header content are
  preserved.

### Missing wiring fix: `getScanDetectionResults`

The Step 81/80 fields (`integrity` and `provenance`) were **silently
dropped** during the sort/dedup pipeline in `getScanDetectionResults()`
(`apps/web/src/lib/scan-detection-results.ts`). That function builds a
new `DetectionResponse` object and conditionally spread only version,
relationship, and conflict fields — `integrity` and `provenance` were
omitted.

This is the "actual missing wiring issue" the Step 86 spec anticipated.
The fix adds two conditional spreads to forward both fields as-is:

```ts
...(detection.provenance ? { provenance: detection.provenance } : {}),
...(detection.integrity ? { integrity: detection.integrity } : {}),
```

No algorithm, scoring, or API contract change — only propagation of
already-computed fields through the existing pipeline.

---

## Files

### Files added

| File                                                         | Purpose                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `apps/web/src/lib/detection-integrity-presenter.ts`          | Pure presenter: issue labels/descriptions, `summarizeIntegrity()` aggregation |
| `apps/web/src/lib/detection-integrity-presenter.test.ts`     | 13 unit tests for the presenter                                               |
| `apps/web/src/components/DetectionIntegritySummary.tsx`      | Scan-level integrity summary panel component                                  |
| `apps/web/src/components/DetectionIntegritySummary.test.tsx` | 9 component tests                                                             |

### Files modified

| File                                              | Change                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/DetectionItem.tsx`       | Per-detection integrity notice in the header (after conflict banner, before `</header>`)                                     |
| `apps/web/src/components/DetectionItem.test.tsx`  | 8 new tests for the Step 86 integrity notice block                                                                           |
| `apps/web/src/components/ScanViews.tsx`           | Imports `DetectionIntegritySummary` + `summarizeIntegrity`; renders summary in `ScanDetailView` after `ResultQualitySummary` |
| `apps/web/src/components/ScanViews.test.tsx`      | 7 new regression tests for the summary wiring                                                                                |
| `apps/web/src/components/ScanCard.module.css`     | CSS classes: `.detectionIntegrity`, `.detectionIntegritySummary`, `.detectionIntegrityIssue`, `.detectionIntegrityNotice`    |
| `apps/web/src/lib/scan-detection-results.ts`      | Propagate `integrity` + `provenance` through sort/dedup pipeline (missing wiring fix)                                        |
| `apps/web/src/lib/scan-detection-results.test.ts` | 6 new tests for `integrity`/`provenance` propagation                                                                         |
| `docs/architecture/domain-model.md`               | §21 addendum: UI presentation layer for result quality                                                                       |

### Files NOT modified

| File                                              | Reason                                        |
| ------------------------------------------------- | --------------------------------------------- |
| `packages/core/src/domain/detection-integrity.ts` | Core integrity algorithm untouched            |
| `.poolside/settings.local.yaml`                   | Untouched (pre-existing local sandbox config) |

---

## Exact UI behavior

1. **Clean scan (no integrity issues):** No "Detection integrity" section
   appears in `ScanDetailView`. Each `DetectionItem` renders without an
   integrity notice. The UI is identical to the pre-Step 86 state.

2. **Scan with integrity issues (completed):** A `<section>` with heading
   "Detection integrity" appears between "Result quality" and "Technology
   Insights". It shows the affected detection count, total issue count, and
   one line per issue type (label + count), in canonical order:

   ```
   Detection integrity
   1 detection with 2 issues
   Duplicate evidence: 1
   Empty evidence: 1
   ```

3. **Per-detection notice:** Each invalid detection's header shows an amber
   "Integrity issue" / "Integrity issues" notice after the conflict banner.
   Hovering the notice shows a tooltip with the full issue descriptions.

4. **Non-completed scans:** The summary is gated on `scan.status === 'completed'`
   (via the `use client` directive and `renderToString` test infrastructure), so
   pending/running/failed scans never show it.

---

## Architecture decisions

1. **Reuse, don't reimplement.** The presenter maps already-computed
   `DetectionIntegrityIssue` values to labels — it never calls
   `computeDetectionIntegrity` or reinterprets validity.

2. **Canonical ordering from core.** `INTEGRITY_ISSUE_ORDER` is imported
   from `@devlens/core` — the label map and aggregation cannot drift
   out of sync with the single taxonomy (enforced by `Record<Issue, Label>`
   at compile time).

3. **Conditional rendering.** The scan-level summary returns `null` when
   there are no issues — no empty-state boilerplate.

4. **Missing wiring fix scope.** Only `integrity` and `provenance`
   propagation was added to `getScanDetectionResults`. No other fields
   were touched. No sort/dedup/evidence logic was changed.

5. **CSS reuse.** New classes mirror the `ResultQualitySummary` palette
   (`#4b5563`/`#6b7280`, `.8rem`) and the `targetWarning` amber tint
   (`#92400e`) for the diagnostic accent — no new design system.

---

## Tests

### Focused results (new tests only)

| Suite                     | Location                                                         | Tests  |
| ------------------------- | ---------------------------------------------------------------- | ------ |
| Presenter                 | `apps/web/src/lib/detection-integrity-presenter.test.ts`         | 13     |
| DetectionIntegritySummary | `apps/web/src/components/DetectionIntegritySummary.test.tsx`     | 9      |
| DetectionItem (integrity) | `apps/web/src/components/DetectionItem.test.tsx` (Step 86 block) | 8      |
| ScanDetailView (wiring)   | `apps/web/src/components/ScanViews.test.tsx` (Step 86 block)     | 7      |
| Propagation fix           | `apps/web/src/lib/scan-detection-results.test.ts` (new blocks)   | 6      |
| **Total new**             |                                                                  | **43** |

### Presenter tests cover

- empty integrity set; one issue; multiple issue types; duplicate issues;
  canonical ordering; deterministic aggregation; label/description coverage;
  all 5 issue types; singular/plural; no-icons (`§13`); semantic `<section>`/`<h2>` (`§8`).

### DetectionIntegritySummary tests cover

- no issues → no summary; issues → summary rendered; affected detection count;
  issue labels/details; deterministic ordering; singular/plural;
  icon-free (`§13`); semantic section/heading.

### DetectionItem tests cover

- valid detection (no `integrity` field) → no notice; valid-but-present
  verdict → no notice; one issue → "Integrity issue"; multiple → "Integrity issues";
  all 5 issue types in canonical order; tooltip descriptions; provenance coexistence;
  normal rendering preserved.

### ScanDetailView tests cover

- integrity issues → summary rendered; clean → no summary; pending scan → no summary;
- failed scan → no summary; multi-detection affected count; doesn't replace
  ResultQualitySummary; per-detection notice visible in the list.

### Propagation tests cover

- `integrity` forwarded through sort/dedup; omitted when absent; preserved
  across deduplication (highest-confidence wins); `provenance` forwarded;
  omitted when absent; omitted for derived detections.

### Full suite result

```
Test Files  124 passed | 2 skipped (126)
Tests       2387 passed | 18 skipped (2405)
```

Baseline at Step 81 was 2344 passed / 18 skipped / 0 failed (122 files).
Current: **2387 passed, 18 skipped, 0 failed** (124 files) — a net increase
of 43 new test across 2 new test files + 3 extended existing test files.

### Typecheck

`pnpm typecheck` (all workspace packages) — **PASS (exit 0)**.

### Lint

`npx eslint .` — **PASS (exit 0, no warnings)**.

### Formatting

`npx prettier --check <touched files>` — **PASS** — "All matched files use
Prettier code style!"

### Build

`pnpm -r build` — **PASS (exit 0)**. Next.js compiled successfully; all
static pages generated (9/9).

---

## Browser verification

The repository's `e2e/` directory contains no Playwright test files (only
`.gitkeep` and `Step6G.md`). The API layer (`GET /api/scans/:id`) requires
PostgreSQL (`PostgresScanResultRepository`), and the integration test
(`route.integration.test.ts`) is skipped for that reason. No in-memory
mock or fixture-data mode exists for the API.

Per the spec ("If a genuine integrity-invalid scenario is difficult to
reach through the UI, use the smallest existing fixture/test setup
necessary"), verification was performed via the repository's existing
component-test infrastructure:

1. **Dev server smoke test.** `next dev` at `http://localhost:3001` —
   started cleanly, no SSR/type errors. Homepage returned HTTP 200 (32 KB
   of rendered HTML). The `/scans` and `/scans/[id]` routes rendered
   (HTTP 200) with graceful not-found handling when no database is
   available.

2. **Component-level `renderToString` verification** — the existing
   convention for this repository's SSR/SSG app. `renderToString` from
   `react-dom/server` produces the exact server-rendered HTML that the
   browser receives. Tests verified:
   - A completed scan with no integrity issues renders no "Detection
     integrity" section.
   - A completed scan with integrity issues renders the full summary with
     canonical-ordered issue rows and correct affected-detection count.
   - A per-detection integrity notice appears in the detection list
     alongside the technology name, confidence, and evidence.
   - Pending and failed scans never render the integrity summary.
   - The existing "Result quality" section remains present alongside the
     new "Detection integrity" section — no layout regression.
   - Existing provenance signals line coexists with the integrity notice.

---

## Scope audit

### Confirms (no forbidden changes)

- ✅ No core integrity algorithm changes (`packages/core` untouched)
- ✅ No `DetectionProvenance` modification
- ✅ No `computeDetectionIntegrity` changes
- ✅ No API contract changes — `DetectionResponse.integrity?` remains the
  authoritative, additive, backward-compatible field from Step 81
- ✅ No database fields added — integrity is a derived, in-memory diagnostic
- ✅ No new API endpoints
- ✅ No new scoring — the presenter only maps existing verdicts
- ✅ No evidence-graph or async processing
- ✅ No dashboard/history integrity features
- ✅ No Step 82 revival
- ✅ No Step 87 scaffolding
- ✅ `.poolside/settings.local.yaml` untouched by Step 86

### Scope-non-goals honored

- Did not redesign the scan detail page (only inserted a summary panel
  alongside existing sections).
- Did not add dashboard/history integrity features.
- Did not introduce a new design system or icons/gradients/animations.
- Did not create an evidence graph.

---

## Final commit

**Commit message:**

```
feat(detection): surface integrity diagnostics in UI
```

**Commit contents (exact files staged for Step 86):**

| File                                                         | Status                   |
| ------------------------------------------------------------ | ------------------------ |
| `apps/web/src/lib/detection-integrity-presenter.ts`          | added                    |
| `apps/web/src/lib/detection-integrity-presenter.test.ts`     | added                    |
| `apps/web/src/components/DetectionIntegritySummary.tsx`      | added                    |
| `apps/web/src/components/DetectionIntegritySummary.test.tsx` | added                    |
| `apps/web/src/components/DetectionItem.tsx`                  | modified                 |
| `apps/web/src/components/DetectionItem.test.tsx`             | modified                 |
| `apps/web/src/components/ScanViews.tsx`                      | modified                 |
| `apps/web/src/components/ScanViews.test.tsx`                 | modified                 |
| `apps/web/src/components/ScanCard.module.css`                | modified                 |
| `apps/web/src/lib/scan-detection-results.ts`                 | modified                 |
| `apps/web/src/lib/scan-detection-results.test.ts`            | modified                 |
| `docs/Step86.md`                                             | modified (spec → report) |
| `docs/architecture/domain-model.md`                          | modified (UI addendum)   |

**Staged diff verified:** `git diff --cached --check` — no whitespace errors.

**Intentionally not included in the Step 86 commit:**

- `.poolside/settings.local.yaml` — pre-existing local sandbox config
  (modified by earlier environment setup, not by Step 86)
- `docs/Step85.md` — separate documentation artifact (not touched by Step 86)

---

## Defining the Step 86 result pipeline

The completed result pipeline now spans from domain computation (Step 81)
through UI presentation (Step 86):

```text
final Detection[]
  → quality (Step 79)            scan-result-quality.ts
  → provenance (Step 80)         detection-provenance.ts
  → integrity (Step 81)          detection-integrity.ts   ← domain validator
  → API response                 detection-to-response.ts  ← attaches .integrity
    → sort/dedup/present         scan-detection-results.ts  ← forwards .integrity + .provenance
    → UI presenter               detection-integrity-presenter.ts  ← aggregates for display
    → UI panel                   DetectionIntegritySummary.tsx   ← scan-level summary
    → UI notice                  DetectionItem.tsx           ← per-detection notice
```

The integrity verdict is a **pure derived diagnostic** — the domain
`Detection` is never mutated, the UI never recomputes validity, and no
new scoring system is introduced.
