# Step 59: Detection Evidence Traceability — Report

## STATUS

**Complete.** All validation passes. The evidence traceability system was already fully implemented across Steps 33–48; Step 59 verifies the implementation, adds accessibility polish, and fills the remaining test gap (dedicated `EvidenceList` tests + compare page route tests).

## Commit

```
Step 59: Detection Evidence Traceability
```

## Step 0 Findings

Inspected the actual repository implementation. Answers to all 8 questions:

### 1. What exact fields exist on a Detection?

`DetectionResponse` (in `apps/web/src/lib/types.ts`):
```typescript
interface DetectionResponse {
  technology: TechnologyResponse;   // { id, name, category }
  confidence: number;               // 0–100, as returned by the API
  evidence: EvidenceResponse[];     // array of evidence items
}
```

The domain model (`@devlens/core/src/domain/detection.ts`) mirrors this:
```typescript
interface Detection {
  readonly technology: Technology;   // { id: TechnologyId, name, category }
  readonly confidence: Confidence;
  readonly evidence: ReadonlyArray<Evidence>;
}
```

### 2. What exact fields exist on Evidence?

`EvidenceResponse` is a discriminated union (in `lib/types.ts`) with 8 variants:

| Type | Fields |
|---|---|
| `html` | `selector: string`, `snippet: string` |
| `http_header` | `name: string`, `value: string` |
| `script_url` | `url: string` |
| `script_content` | `snippet: string` |
| `meta_tag` | `name: string`, `content: string` |
| `javascript_global` | `globalName: string` |
| `resource` | `url: string` |
| `link` | `url: string` |

The `type` field is a string literal discriminant used for narrowing.

### 3. How are evidence types represented?

The `type` field is a string literal union (`'html' | 'http_header' | ...`). Human-readable labels are provided by `evidenceTypeLabel()` in `lib/evidence-presenter.ts`:

| Type | Label |
|---|---|
| `http_header` | HTTP Header |
| `meta_tag` | Meta Tag |
| `script_url` | Script URL |
| `script_content` | Script Content |
| `html` | HTML Element |
| `javascript_global` | JavaScript Global |
| `resource` | Resource URL |
| `link` | Link |

Unknown types fall back to `'Evidence'`.

### 4. Is evidence already persisted in the scan result?

**Yes.** `ScanDetailResponse.detections: DetectionResponse[]` — each detection carries its full `evidence: EvidenceResponse[]` array. Evidence is stored alongside detections in the scan result, serialized by the API handler in `apps/web/src/app/api/scans/[id]/route.ts`.

### 5. Does the API already return evidence to the frontend?

**Yes.** The `GET /api/scans/:id` endpoint returns `ScanDetailResponse` with full detection arrays, each containing evidence. No domain mapping needed — evidence flows directly from the API to the UI.

### 6. Does `DetectionItem` currently expose evidence?

**Yes.** `DetectionItem` (in `components/DetectionItem.tsx`) already renders:
- Technology name (linked to `/technologies/{id}` if known, plain `<span>` if unknown)
- Category
- Confidence score (exact value, no rounding)
- Explanation summary (via `getDetectionExplainability`)
- Evidence count ("N evidence items")
- Evidence source list (type label + source description per evidence item)
- Collapsible `<EvidenceList>` — a `<details>/<summary>` disclosure tree showing all evidence items

### 7. Is there already a utility for evidence formatting/grouping?

**Yes.** The presentation layer has a complete pipeline:

| Module | Purpose |
|---|---|
| `lib/evidence-presenter.ts` | `evidenceTypeLabel()`, `evidenceFields()`, `evidenceIsUrl()`, `evidenceUrl()` — pure mapping from raw evidence to human-readable labels/fields |
| `lib/evidence-identity.ts` | `getEvidenceIdentity()` (canonical key per type), `deduplicateEvidence()` — deduplication using canonical identity |
| `lib/detection-explanation.ts` | `getDetectionExplanation()` — neutral summary string, evidence type labels (sorted), count |
| `lib/detection-explainability.ts` | `getDetectionExplainability()` — full structured explanation: dedup + deterministic sort (type label ASC → identity ASC) + per-evidence source descriptions |
| `components/EvidenceList.tsx` | Collapsible `<details>/<summary>` disclosure |
| `components/EvidenceItem.tsx` | Per-evidence row: type label + fields, URLs as links, code values in `<code>` |

### 8. Can the UI expose evidence without modifying the scan engine or persistence?

**Yes — and it already does.** All evidence presentation is in the UI layer (`apps/web`). No changes to `@devlens/core`, detectors, crawler, scoring, or persistence were needed. The entire evidence traceability stack was built incrementally in Steps 33–48:

- Step 33: Evidence model (`evidence.ts`), `EvidenceResponse` types
- Step 36: `compareScans()` with evidence comparison
- Step 38: Evidence identity (`evidence-identity.ts`)
- Step 39: `getDetectionExplanation()` — summary strings
- Step 42: Canonical evidence identity shared utility
- Step 46: `ScanComparison` component with evidence changes
- Step 48: Detection explainability (`detection-explainability.ts`) with source descriptions, deterministic sorting

## Existing Comparison Architecture

The comparison system (detailed in Step 58 report) continues to function unchanged:

- `compareScans()` produces `evidenceChanges` (Added/Removed/Unchanged) for technologies present in both scans
- `ScanComparison` renders evidence changes in a table with type labels and field values
- `EvidenceItem` renders URLs as clickable links and code-like values in `<code>`

## Actual Data Model

### Detection flow
```
Crawler → Detector → Domain Detection (core) → ScanResult → JSON API → DetectionResponse
```

### Evidence flow
```
Domain Evidence (core/evidence.ts) → JSON serialization → EvidenceResponse → UI
```

The UI types (`EvidenceResponse` in `lib/types.ts`) mirror the domain evidence exactly. No transformation or loss occurs.

### Evidence identity
`getEvidenceIdentity()` produces a canonical key per evidence type:
- `html:{selector}`, `http_header:{name}`, `script_url:{url}`, `script_content:{snippet}`, `meta_tag:{name}`, `javascript_global:{globalName}`, `resource:{url}`, `link:{url}`

### Evidence ordering
`getDetectionExplainability()` sorts evidence deterministically: type label ASC, then canonical identity ASC. This is applied before passing to `EvidenceList`/`EvidenceItem`.

## Files Changed

| File | Change |
|---|---|
| `apps/web/src/components/EvidenceList.test.tsx` | **NEW** — 9 tests for collapsible disclosure, empty/single/multiple counts, long URLs, semantic HTML, unknown types. |
| `apps/web/src/app/scans/compare/page.test.tsx` | **NEW** — 16 tests for the comparison page route: missing params, concurrent fetch, same/different targets, 404 handling, API errors, URL preservation, ID encoding, metadata display. |
| `apps/web/src/lib/comparison-selector.test.ts` | Added 5 tests: selection gate scenarios (0/1/2 selected, same-scan prevention). |
| `apps/web/src/components/ScanComparisonSelector.test.tsx` | Added 2 tests: aria-expanded, semantic button elements. |
| `apps/web/src/components/ScanComparison.test.tsx` | Added 3 tests: different-targets warning, same-target no warning, scan targets in overview. |
| `apps/web/src/app/scans/page.module.css` | Added `:focus-visible` styles for `.compareButton`, `.cancelButton`, `.compareLink`, `.newScanLink`. |
| `apps/web/src/components/ScanCard.module.css` | Added `:focus-visible` style for `.evidenceSummary` and `.comparisonBackLink`. |

## Evidence Presentation Implementation

The evidence disclosure uses native HTML `<details>`/`<summary>` elements:

```tsx
// EvidenceList.tsx
<details className={styles.evidenceTree}>
  <summary className={styles.evidenceSummary}>Evidence ({evidence.length})</summary>
  <ul className={styles.evidenceList}>
    {evidence.map((item, index) => (
      <EvidenceItem ... />
    ))}
  </ul>
</details>
```

**Key properties:**
- Collapsed by default (no `open` attribute)
- Natively keyboard-accessible (Enter/Space toggles)
- No JavaScript required for expand/collapse
- `aria-expanded` is implied by the `<details>`/`open` attribute
- The `▸` CSS marker rotates 90° when expanded
- Long URLs handled via `word-break: break-all` (`.evidenceCode`, `.evidenceUrl`)
- `EvidenceItem` renders URLs as clickable `<a target="_blank" rel="noopener noreferrer">` links

## Deterministic Ordering Implementation

Evidence ordering is enforced at two levels:

1. **In the domain layer** (`getDetectionExplainability` in `detection-explainability.ts`):
   - Evidence is deduplicated using `deduplicateEvidence()` (canonical identity)
   - Then sorted by: `evidenceTypeLabel(type)` ASC → `getEvidenceIdentity(item)` ASC
   - This produces a stable order regardless of input order or insertion sequence

2. **In the UI layer** (`EvidenceList`):
   - Receives already-sorted evidence from `getDetectionExplainability`
   - Renders items in array order (no re-sorting)
   - Keys use `${item.type}-${index}` for React reconciliation

Existing ordering contract preserved — no new ordering algorithm introduced.

## Accessibility Implementation

### Evidence disclosure (`<details>/<summary>`)
- Native keyboard interaction (Enter/Space to toggle)
- `aria-expanded` implied by `<details>` `open` attribute
- `cursor: pointer` on `.evidenceSummary`
- Added `:focus-visible` style: `outline: 2px solid #2563eb; outline-offset: 1px;`

### Comparison selector (added `:focus-visible`)
- `.compareButton:focus-visible` — blue outline for keyboard users
- `.cancelButton:focus-visible` — blue outline
- `.compareLink:focus-visible` — blue outline
- `.newScanLink:focus-visible` — blue outline

### Comparison back link
- `.comparisonBackLink:focus-visible` — blue outline

### Existing accessibility (preserved from Steps 44, 46, 48)
- `aria-expanded="false"` on the collapsed "Compare two scans" button
- `aria-label` on all selection checkboxes (e.g., "Select scan_a as Previous (left)")
- `role="radiogroup"` on selection control groups
- `aria-label` on selection summary spans
- Semantic `<button>` elements for all interactive controls
- No color-only communication — text labels and styling both indicate state

## Tests Added

| Count | File | What it covers |
|---|---|---|
| 9 | `components/EvidenceList.test.tsx` | Empty → null, `<details>/<summary>` semantics, evidence count (single/multiple/singular), collapsed by default, all evidence rendered, long URL safety, semantic HTML, unknown type safety |
| 16 | `app/scans/compare/page.test.tsx` | Missing params (3 variants), successful comparison, concurrent fetch, same-target vs different-target, 404 handling (left/right/both), API error handling, URL preservation/navigation, ID encoding, metadata display |
| 5 | `lib/comparison-selector.test.ts` | Selection gate: 0 selected (disabled), 1 selected (disabled), 2 selected (enabled), same-scan prevention |
| 2 | `components/ScanComparisonSelector.test.tsx` | `aria-expanded="false"`, semantic `<button>` elements |
| 3 | `components/ScanComparison.test.tsx` | "Different targets" warning rendering, same-target no warning, scan targets in overview |

**Total new tests: 35** (plus 5 existing test files extended).

### Coverage of spec's 14 testing requirements:

| # | Requirement | Where |
|---|---|---|
| 1 | Detection without evidence | `DetectionItem.test.tsx` — "renders 'No evidence details are available.'" |
| 2 | One evidence item | `DetectionItem.test.tsx` — "renders singular 'item' for a single evidence entry" |
| 3 | Multiple evidence items | `DetectionItem.test.tsx` — "renders evidence count" |
| 4 | Evidence expansion | `EvidenceList.test.tsx` (NEW) — `<details>`/`<summary>` semantics |
| 5 | Evidence collapse | `EvidenceList.test.tsx` — "is collapsed by default (no open attribute)" |
| 6 | Evidence type/source display | `DetectionItem.test.tsx` + `EvidenceItem.test.tsx` — type labels + source descriptions |
| 7 | Long evidence values safe | `EvidenceItem.test.tsx` + `EvidenceList.test.tsx` — long URL test |
| 8 | Evidence ordering deterministic | `DetectionItem.test.tsx` — "renders evidence sources in deterministic order" + `detection-explainability.test.ts` |
| 9 | Duplicate evidence behavior | `DetectionItem.test.tsx` — "deduplicates evidence in the rendered output" + `evidence-identity.test.ts` |
| 10 | Missing/optional evidence fields | `EvidenceItem.test.tsx` — "renders unknown evidence type without crashing" + `DetectionItem.test.tsx` — "handles zero evidence" |
| 11 | Detection links functional | `DetectionItem.test.tsx` — "preserves known technology link to catalog" |
| 12 | Scan detail list intact | `ScanViews.test.tsx` — 61 tests pass |
| 13 | Comparison behavior intact | `ScanComparison.test.tsx` (34) + `comparison.test.ts` (18) — all pass |
| 14 | Step 56 Re-scan intact | `app/scans/[id]/page.test.tsx` — 7 tests pass |

## Full Validation Results

| Check | Result |
|---|---|
| Vitest | ✅ 1706 passed, 18 skipped (97 test files, 2 skipped) |
| `tsc --noEmit` | ✅ Passes |
| ESLint | ✅ Passes |
| Prettier | ✅ All matched files use Prettier code style |
| `next build` | ✅ Passes (all routes built) |
| madge | ✅ 87 files, no circular dependencies |
| `jsx: "preserve"` | ✅ Intact |

## Confirmation: No Detector/Scoring/Domain Semantics Changed

- `@devlens/core` — **NOT modified**
- Detector pipeline — **NOT modified**
- Crawler — **NOT modified**
- Scoring (`ConfidenceScorer`) — **NOT modified**
- Evidence generation — **NOT modified**
- Persistence schema — **NOT modified**
- `POST /api/scans` contract — **NOT modified**
- `GET /api/scans` / `GET /api/scans/:id` contracts — **NOT modified**
- `validateUrl()` — **NOT modified**

All evidence presentation is strictly in the UI layer (`apps/web/src/`). The UI reads existing `EvidenceResponse[]` from the API and formats it using pure presentation utilities (`evidence-presenter.ts`, `evidence-identity.ts`, `detection-explainability.ts`). No new evidence types, no new scoring formula, no new detection logic.

## Step 56–58 Confirmation

### Step 56: Re-scan Same Target — Intact
- Re-scan link on `/scans/{id}` points to `/scans/new?target=<encoded>` → prefilled form → no auto-submit → new scan created
- `app/scans/[id]/page.test.tsx` (7 tests) all pass ✅
- Existing scan NOT mutated or retried ✅

### Step 57: Scan History & Same-Target Context — Intact
- `/scans` ordered `createdAt DESC, scanId ASC` ✅
- `ScanCard` shows "N scans" badge when target has multiple scans ✅
- `scan-history.test.ts` (7) + `ScanHistory.test.tsx` (9) + `ScanViews.test.tsx` extended — all pass ✅

### Step 58: Compare Scans from History — Intact
- `ScanComparisonSelector` on `/scans` — collapsible two-scan selection ✅
- `/scans/compare?left=<id>&right=<id>` — URL-driven comparison ✅
- `app/scans/compare/page.test.tsx` (16 tests) all pass ✅
- `comparison-selector.test.ts` (21 tests) + `ScanComparisonSelector.test.tsx` (10 tests) all pass ✅
- `ScanComparison.test.tsx` (34 tests) — extended with 3 new tests ✅
- No new endpoints, no new comparison engine ✅

## Scope Confirmation

### In Scope (done)
- ✅ Exposing existing detection evidence (verified already in place)
- ✅ Compact evidence disclosure (`<details>/<summary>`)
- ✅ Deterministic evidence presentation (type ASC → identity ASC sort)
- ✅ Evidence formatting at the UI boundary (`evidence-presenter.ts`, etc.)
- ✅ Accessibility (`:focus-visible` on `.evidenceSummary`, compare controls)
- ✅ Focused tests (35 new tests across 5 files)
- ✅ Invalid-state handling verified (missing params, 404, API errors)

### Out of Scope (NOT touched)
- ✅ New detectors
- ✅ Detector accuracy changes
- ✅ New evidence types
- ✅ New scoring algorithms
- ✅ Confidence formula changes
- ✅ Crawler changes
- ✅ Database schema changes
- ✅ New API endpoints
- ✅ Scan comparison redesign
- ✅ Analytics / charts
- ✅ Authentication
- ✅ Redesign of Scan Detail

No new evidence types, no new scoring, no detector changes. The evidence traceability pipeline was built in prior steps; Step 59 verifies it, adds accessibility polish, and fills test coverage gaps.
