# Step 25 — Technology Detection Report

> **Status**: ✅ Complete — all 5 validation checks pass

---

## Overview

Step 25 redesigns the completed scan results section of the `/scans/[id]`
page into a clear, professional technology-detection report. The focus is
exclusively on **presentation and usability** of completed detection
results — no detector logic, scoring algorithms, crawler behavior,
persistence, or API semantics were changed.

**Test count**: 1030 (Step 24 baseline) → **1101** (+71 tests)

---

## Constraints Honored

- **No new dependencies** — React built-ins only
- **No backend changes** — detector logic, scoring, crawler, API, database all untouched
- **No third-party UI libraries** — pure React + CSS Modules
- **Node test environment** — `environment: 'node'`, no jsdom; `renderToString`
  from `react-dom/server` for component rendering
- **No subjective labels** — only API-returned confidence values displayed
- **No re-sorting or re-scoring** — detections rendered in API-returned order

---

## Architecture

```
ScanDetailView  (orchestrator for all states — in ScanViews.tsx)
  ├─ ScanSummary       (scan metadata: target, status, timeline)
  ├─ Snapshot          (HTTP + HTML observations, if available)
  ├─ ScanningState     (pending/running UI — preserved from Step 24)
  ├─ DetectionList     (ranked detection list — preserves API order)
  │     └─ DetectionItem   (technology + confidence + evidence count)
  │         └─ EvidenceList    (collapsible <details> tree)
  │             └─ EvidenceItem  (per-type rendering via presenter)
  └─ EmptyDetections  (completed with zero detections)
```

All new components are **presentation-oriented** — they consume typed API
data (`EvidenceResponse`, `DetectionResponse`, `ScanResponse`, etc.) from
`lib/types.ts`. No domain, database, repository, detector, or crawler
imports reach the web UI.

### The evidence presentation mapping layer

`lib/evidence-presenter.ts` is a **pure module** (zero React/DOM dependencies)
that maps raw evidence data to human-readable presentation primitives:

| Function                  | Returns                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `evidenceTypeLabel(type)` | Human-readable label (e.g. `"HTTP Header"`, `"Script URL"`) |
| `evidenceFields(item)`    | Array of `{ label, value }` pairs for display               |
| `evidenceIsUrl(item)`     | `boolean` — whether the evidence contains a URL             |
| `evidenceUrl(item)`       | `string \| null` — the URL if this is a URL-type evidence   |

This layer intentionally avoids reproducing detector implementation
details — it is purely a presentation mapping (evidence type → human-readable
representation).

---

## Result UI Structure

For a **completed** scan, the detail page shows:

1. **Scan summary** — `ScanSummary` component
   - Scan ID heading (`Scan #xyz`)
   - Status badge (Completed/Failed/Pending/Running) — color **and** text
   - Target URL, hostname
   - Creation/Started/Completed/Failed timestamps (via `<time>` elements)
   - Error code + message (if failed)

2. **Snapshot** (if available) — `Snapshot` component
   - Captured timestamp, final URL, HTTP status code, content type
   - HTML page title and description

3. **Detections** — `DetectionList` component (ordered list `<ol>`)
   - Shows API-returned ranking order (no re-sorting)
   - Detection count in heading: `Detections (N)`
   - Each detection (`DetectionItem`):
     - Technology name (bold)
     - Category (badge-style label)
     - Confidence score: `Confidence: 95%`
     - Evidence count: `3 evidence items` (or `1 evidence item`)
   - Collapsible evidence tree via `<details>` / `<summary>`

4. **Empty state** — `EmptyDetections` component (zero detections)
   - `Detections (0)` heading
   - "The scan completed successfully."
   - "No supported technologies were detected on this site."
   - Explicit message that this is valid, not an error

For **pending/running** scans, the Step 24 `ScanningState` UI is preserved
exactly — "Queued in progress" / "Scanning in progress" with auto-refresh
via `ScanLifecycle`.

---

## Evidence Presentation

All 8 evidence types from the API are supported with dedicated rendering:

| Type                | Label             | Display                                   |
| ------------------- | ----------------- | ----------------------------------------- |
| `http_header`       | HTTP Header       | `Header: {name}: {value}`                 |
| `meta_tag`          | Meta Tag          | `Meta Tag: {name}: {content}`             |
| `script_url`        | Script URL        | Clickable `<a>` link                      |
| `script_content`    | Script Content    | `<code>`-styled snippet                   |
| `html`              | HTML Element      | `Selector: {selector}` + `<code>` snippet |
| `javascript_global` | JavaScript Global | `Global: {globalName}`                    |
| `resource`          | Resource URL      | Clickable `<a>` link                      |
| `link`              | Link              | Clickable `<a>` link                      |

### Unknown evidence type handling

If a future evidence type arrives that the presenter doesn't recognize:

- `evidenceTypeLabel()` returns `"Evidence"` (not a crash)
- `evidenceFields()` returns `[{ label: 'Data', value: JSON.stringify(item) }]`
- `evidenceIsUrl()` returns `false`
- `evidenceUrl()` returns `null`

The `EvidenceItem` component renders the fallback safely — the raw JSON
data is visible to the user, and the UI continues to function.

### Long value handling

- URLs and snippets use CSS `word-break: break-all` to wrap safely
- No fixed widths that could break on long technical strings
- `<details>`/`<summary>` keeps the initial view compact

---

## Accessibility

- **Semantic HTML**: `<article>`, `<section>`, `<dl>`, `<dt>`, `<dd>`,
  `<ol>`, `<li>`, `<details>`, `<summary>`, `<time>`, `<code>`
- **Keyboard-accessible expansion**: `<details>`/`<summary>` natively
  support keyboard toggle (Space/Enter)
- **No color-only communication**: status badges use text labels alongside
  color (e.g. "Completed" + green background)
- **Links have `rel="noopener noreferrer"`** for externally-targeted URLs
- **Time elements use `dateTime`** attribute for machine-readable timestamps

---

## Responsive Behavior

- Flexible grid layouts (`grid-template-columns: auto 1fr`)
- `flex-wrap` on detection headers and evidence fields
- `word-break: break-all` on targets, URLs, and code snippets
- No fixed-width containers
- Vertical list layout (no wide tables)

---

## CSS Notes

All new styles are added to the existing `ScanCard.module.css` module — no
new CSS files were created. Key additions:

- `.summary`, `.summaryHeader`, `.summaryMeta` — scan metadata layout
- `.scanning` (enhanced) — in-progress state styling
- `.detectionList` (uses `<ol>`) — ranked detection list
- `.detectionItem`, `.detectionHeader` — per-detection layout
- `.techName`, `.category`, `.score` — detection metadata
- `.evidenceTree`, `.evidenceSummary` — collapsible evidence tree
- `.evidenceItem`, `.evidenceType`, `.evidenceFields` — evidence rendering
- `.evidenceUrl`, `.evidenceCode`, `.evidenceValue` — evidence value styling
- `.emptyDetections` — zero-detection state
- `.wordBreak` — safe text wrapping

---

## Files Created

| File                                             | Purpose                                          | Lines |
| ------------------------------------------------ | ------------------------------------------------ | ----- |
| `apps/web/src/lib/evidence-presenter.ts`         | Pure evidence type → label/fields mapping        | ~80   |
| `apps/web/src/components/EvidenceItem.tsx`       | Renders a single evidence item                   | ~50   |
| `apps/web/src/components/EvidenceList.tsx`       | Collapsible `<details>` evidence list            | ~40   |
| `apps/web/src/components/DetectionItem.tsx`      | Single detection with tech info + confidence     | ~45   |
| `apps/web/src/components/DetectionList.tsx`      | Ordered list of detections (preserves API order) | ~35   |
| `apps/web/src/components/ScanSummary.tsx`        | Scan metadata block (target, status, timeline)   | ~85   |
| `apps/web/src/components/EmptyDetections.tsx`    | Zero-detection valid state                       | ~20   |
| `apps/web/src/lib/evidence-presenter.test.ts`    | 30 unit tests for presenter                      |       |
| `apps/web/src/components/EvidenceItem.test.tsx`  | 10 tests (all types, unknown, long values)       |       |
| `apps/web/src/components/DetectionItem.test.tsx` | 8 tests (name, category, score, evidence)        |       |
| `apps/web/src/components/DetectionList.test.tsx` | 7 tests (ranking, empty, many, detection count)  |       |
| `apps/web/src/components/ScanSummary.test.tsx`   | 9 tests (metadata, timestamps, status, error)    |       |

## Files Modified

| File                                          | Changes                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/ScanViews.tsx`       | Refactored `ScanDetailView` to use `ScanSummary`, `Snapshot`, `ScanningState`, `DetectionList`/`EmptyDetections`. Added `Snapshot` and `ScanningState` sub-components. Added "New scan" link to `ScansHistory`. Added `statusLabel`/`statusClass` as exports. Removed inline `EvidenceList` function. |
| `apps/web/src/components/ScanViews.test.tsx`  | Updated empty-state test. Added Snapshot tests (HTTP status, content type, final URL, captured, description). Added zero-detection empty state test.                                                                                                                                                  |
| `apps/web/src/components/ScanCard.module.css` | Added 20+ new CSS classes for report presentation, scanning state, empty detections, word-break helpers.                                                                                                                                                                                              |

---

## Evidence Types Covered

All 8 evidence types from the API `EvidenceResponse` union are explicitly
supported and tested:

1. ✅ `html` — selector + snippet
2. ✅ `http_header` — name: value
3. ✅ `meta_tag` — name: content
4. ✅ `script_url` — clickable URL link
5. ✅ `script_content` — code-styled snippet
6. ✅ `javascript_global` — global name
7. ✅ `resource` — clickable URL link
8. ✅ `link` — clickable URL link

Plus safe fallback for **unknown/future** evidence types (JSON representation).

---

## Tests Added

### `evidence-presenter.test.ts` (30 tests)

- `evidenceTypeLabel`: 8 type-specific tests + 1 unknown type
- `evidenceFields`: 8 type-specific tests + 1 unknown type
- `evidenceIsUrl`: 8 tests (correct boolean for each type)
- `evidenceUrl`: 4 tests (URL extraction + null for non-URL)

### `EvidenceItem.test.tsx` (10 tests)

- Each of 8 evidence types renders correctly
- Unknown evidence type does not crash
- Long technical URLs wrap safely

### `DetectionItem.test.tsx` (8 tests)

- Technology name renders
- Category renders
- Confidence score displayed exactly as returned (95%, not "very likely")
- Evidence count renders ("2 evidence items", "1 evidence item")
- Evidence items rendered inside detection
- Exact confidence preserved (87)
- No subjective labels introduced

### `DetectionList.test.tsx` (7 tests)

- Detection count in heading
- API-returned ranking order preserved (no re-sorting)
- Multiple technologies render
- Technology metadata (id, name, category) renders
- Evidence items rendered per detection
- Empty state for zero detections
- Many detections (20) render without truncation
- "pending" word does not appear for completed scans

### `ScanSummary.test.tsx` (9 tests)

- Scan ID in heading
- Target URL renders
- Hostname renders
- Status badge with human-readable label
- Creation timestamp with `<time>` element
- startedAt renders when present
- completedAt renders when present
- Error code + message render when present
- Running scan renders all timestamp fields

### `ScanViews.test.tsx` (15 new/updated tests)

- Snapshot: HTTP status, content type, final URL, captured timestamp, description
- Empty state for zero detections ("The scan completed successfully")
- All 4 lifecycle states (pending/running/completed/failed) preserved

---

## Validation Results

| Check         | Command                                              | Result                                |
| ------------- | ---------------------------------------------------- | ------------------------------------- |
| Typecheck     | `pnpm typecheck`                                     | ✅ All 10 workspaces pass             |
| Tests         | `pnpm test`                                          | ✅ 1101 passed, 18 skipped (57 files) |
| Lint          | `pnpm lint`                                          | ✅ ESLint + Prettier clean            |
| Build         | `pnpm build`                                         | ✅ All packages build successfully    |
| Circular deps | `npx madge --circular --extensions ts packages apps` | ✅ No circular dependency             |

---

## Test Count Progression

| Step                    | Total Tests | New This Step |
| ----------------------- | ----------- | ------------- |
| Baseline (Step 20)      | 916         | —             |
| Step 21 (GET API)       | 943         | +27           |
| Step 22 (Web UI)        | 974         | +31           |
| Step 23 (Scan Creation) | 1006        | +32           |
| Step 24 (Lifecycle)     | 1030        | +24           |
| **Step 25 (Report)**    | **1101**    | **+71**       |

---

## Important Implementation Decisions

1. **`<details>`/`<summary>` for evidence expansion** — chosen over custom
   JavaScript expand/collapse because it is native HTML, keyboard-accessible,
   requires no JS, and works in `renderToString` (SSR). No React state needed
   for the expand/collapse behavior.

2. **Evidence presenter as a pure module** — separates the "evidence type →
   label/fields" mapping from the rendering components. This makes the
   mapping trivially testable (30 pure-function tests) without React, and
   keeps the components focused on presentation.

3. **No `.js` extension on relative value imports in Next.js** — discovered
   that Next.js's webpack resolver fails to resolve `./ScanSummary.js` →
   `.ts` for value imports. Type-only imports with `.js` work (erased at
   compile), but value imports must omit the extension. Type-only imports
   (`import type`) can keep `.js`.

4. **`ScanSummary` component vs. type name conflict** — the `ScanSummary`
   type and `ScanSummary` component share a name. In `ScanViews.tsx`, the
   component is imported with an alias (`ScanSummarySection`) to avoid the
   duplicate identifier error while keeping the type import for `ScanCard`.

5. **Confidence displayed as exact number** — the API returns a single
   `confidence: number` field (0–100). No separate `score` field exists in
   the domain or API contract. The UI displays `"Confidence: N%"` using the
   exact value, with no subjective labels or additional scoring.

6. **API ranking preserved** — `DetectionList` uses `<ol>` (ordered list)
   and renders detections in the exact array order from the API response.
   No client-side sorting, filtering, or pagination.

7. **CSS in existing module** — all Step 25 styles added to
   `ScanCard.module.css` to avoid proliferating CSS module files. Scoped
   class names prevent conflicts with existing styles.

8. **No regression in lifecycle** — pending/running/failed UIs are
   unchanged from Step 24. `ScanningState` preserves the exact text
   ("Queued in progress", "Scanning in progress", "queued and waiting to
   start", "currently running") and the `ScanLifecycle` polling behavior
   is untouched.
