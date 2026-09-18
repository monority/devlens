# Step 55 Report — Scan Detail: Detection → Technology Exploration

## Inspection

### Where technology names are rendered

Inspecting every component that renders a technology name in the scan detail / detection
context:

| Component | File | Tech name rendered? | Link to `/technologies/{id}`? |
|---|---|---|---|
| `DetectionItem` | `components/DetectionItem.tsx` | Yes (in `detectionHeader`) | ✅ Known → `<Link>`, unknown → `<span>` |
| `ScanInsights` (detected techs list) | `components/ScanInsights.tsx:98` | Yes | ✅ Known → `<Link>` (`techInsightLink`), unknown → `<span>` |
| `ScanInsights` (composition) | `components/ScanInsights.tsx:130` | Yes | ✅ Known → `<Link>` (`compositionTechName`), unknown → `<span>` |
| `ScanInsights` (evidence matrix) | `components/ScanInsights.tsx:161` | Yes | ✅ Known → `<Link>` (`compositionTechName`), unknown → `<span>` |
| `TechnologyComparisonItem` | `components/ScanComparison.tsx:310` | Yes (comparison context) | ✅ Known → `<Link>` (`techNameLink`), unknown → `<span>` |
| `DetectionCoverage` | `components/DetectionCoverage.tsx` | No (evidence types/counts only) | N/A |
| `ScanOverview` | `components/ScanOverview.tsx` | No (counts only) | N/A |
| `ScanSummary` | `components/ScanViews.tsx` | No (scan metadata only) | N/A |

### Which components consume DetectionItem

`DetectionItem` is consumed ONLY by `DetectionList`. `DetectionList` is consumed by:
- `ScanDetailView` — for failed scans (`scan.status === 'failed'`)
- `ScanDetectionResults` — for completed scans (which `ScanDetailView` renders via
  `ScanDetectionResults` or via `DetectionFilterView` when filtering is active)

Neither `DetectionItem` nor `DetectionList` are used by the comparison view — that
uses its own `TechnologyComparisonItem` component with the same linking pattern.

### Whether a shared component was changed

`DetectionItem`, `ScanInsights`, and `TechnologyComparisonItem` were **not modified**
in this step — the linking was already present in all three. No shared component
behavior was altered.

### Route construction

All links use the canonical technology ID from the detection response:

```tsx
href={`/technologies/${encodeURIComponent(technology.id)}`}
```

- Uses `technology.id` (canonical catalog key), never `technology.name`
- Uses `encodeURIComponent()` for safe URL encoding
- Guarded by `isKnownTechnology(technology.id)` — unknown IDs render as plain text

### Accessibility assessment

| Requirement | Status |
|---|---|
| Meaningful visible text | ✅ Link text is the technology name |
| Normal keyboard navigation | ✅ Standard `<Link>`/`<a>` element, tab-focusable |
| Visible focus state | ⚠️ No `:focus-visible` CSS; relied on browser default outline |
| Not rely solely on color | ✅ Text link, not color-only |
| Preserve heading hierarchy | ✅ Links are within existing `<li>` structure |
| No decorative icons | ✅ None added |

**Gap found and fixed:** The technology link CSS classes (`.techNameLink`,
`.techInsightLink`, `.compositionTechName`) had `:hover` styles but no `:focus-visible`
styles. Added explicit `:focus-visible` styles matching the existing `GlobalNav`
pattern (`outline: 2px solid #2563eb; outline-offset: 1px;`).

### Technology detail continuity

The bidirectional navigation loop is complete:

```
/technologies/{id}
  → "Detected in scans" (TechnologyDetectedInScans)
  → ScanCard "View details →" link
  → /scans/{id}
    → DetectionItem technology name (Link)
    → /technologies/{id}
```

This creates a real exploration loop with no special back-stack state — just normal
app navigation.

---

## Implementation

### Core linking was already in place

The technology name → `/technologies/{id}` linking was already implemented across all
detection rendering components (since initial commit for `DetectionItem`, Step 37 for
`ScanInsights`). No logic changes were needed to `DetectionItem.tsx`,
`ScanInsights.tsx`, or `ScanComparison.tsx`.

### Changes made

1. **`apps/web/src/components/ScanCard.module.css`** — Added `:focus-visible` styles:
   - `.techNameLink:focus-visible` — for scan detail detection items
   - `.techInsightLink:focus-visible` — for scan insights detected technologies list
   - `.compositionTechName:focus-visible` — for composition/evidence matrix tech names
   - `.newScanLink:focus-visible` — for the "New scan" navigation links

2. **`apps/web/src/app/scans/[id]/page.module.css`** — Added `:focus-visible` styles:
   - `.backLink:focus-visible`
   - `.newScanLink:focus-visible`
   - `.compareLink:focus-visible` (added hover style that was missing — `.compareLink`
   had no `:hover` before, unlike `.backLink` and `.newScanLink`)

3. **`apps/web/src/app/scans/new/page.module.css`** — Added `:focus-visible` styles:
   - `.backLink:focus-visible`

### Known/unknown behavior

- **Known technologies** (`isKnownTechnology(id)` returns `true`):
  - Rendered as `<Link href={`/technologies/${encodeURIComponent(id)}`}>` with
    `.techNameLink` (DetectionItem, ScanComparison) or `.techInsightLink` /
    `.compositionTechName` (ScanInsights) class
  - Visible link text = technology display name
  - Focus state now has a visible `outline: 2px solid #2563eb`

- **Unknown technologies** (`isKnownTechnology(id)` returns `false`):
  - Rendered as `<span>` with plain text (no `<technologies/...>` link)
  - No broken links created
  - Category shown as "Unknown", name preserved as visible text

### Reuse

All technology linking uses the same reusable primitives:
- `isKnownTechnology()` from `@/lib/technology-catalog` (checks `TECHNOLOGY_IDS` Set from `@devlens/detectors`)
- `<Link>` from `next/link` (Next.js built-in)
- `encodeURIComponent()` for safe URL construction
- CSS classes from `ScanCard.module.css` (centralized, consistent styling)

No new components, no new dependencies, no duplicated rendering.

---

## Tests

### New tests added

1. **`apps/web/src/components/DetectionItem.test.tsx`** (+2 tests):
   - `uses canonical technology ID in link (not display name)` — Verifies that when
     `technology.id = 'react'` and `technology.name = 'React.js'`, the link href is
     `/technologies/react` (canonical ID), not `/technologies/React.js` (display name).
     Also verifies the display name `React.js` still appears as visible link text.
   - `preserves detection information when technology is linked` — Verifies that when
     a technology is rendered as a link, the category, confidence score, and evidence
     count are all still visible alongside the link.

2. **`apps/web/src/components/DetectionList.test.tsx`** (+1 test):
   - `produces correct catalog links for each known technology` — Renders a `DetectionList`
     with two known technologies (nginx + react) and verifies both `/technologies/nginx`
     and `/technologies/react` links appear, and that the display name (`React.js`) is
     NOT used in the URL.

3. **`apps/web/src/components/ScanViews.test.tsx`** (+1 test):
   - `renders correct catalog links for multiple detected technologies` — Renders
     `ScanDetailView` with two detections and verifies both catalog links are present
     with canonical IDs.

### Existing tests (regression coverage)

All existing tests continue to pass unchanged, confirming:
- `DetectionItem.test.tsx` (26 tests) — known/unknown tech link behavior, detection info preservation
- `ScanViews.test.tsx` (56 tests) — scan detail rendering, filtered view, detection order
- `ScanComparison.test.tsx` (31 tests) — comparison tech links unaffected
- `ScanInsights.test.tsx` — known/unknown tech links in insights sections
- `DetectionList.test.tsx` (9 tests) — detection list rendering and ordering
- `DetectionItem.test.tsx` Step 33/39 explainability tests — evidence rendering intact

### Spec test coverage checklist

| Spec requirement | Covered by |
|---|---|
| Known technology renders as a link | `DetectionItem.test.tsx:149`, `ScanInsights.test.tsx:216` |
| Link points to /technologies/{id} | `DetectionItem.test.tsx:156`, `ScanViews.test.tsx:706` |
| Canonical technology ID is used | `DetectionItem.test.tsx` (new: canonical ID test) |
| Unknown technology remains plain text | `DetectionItem.test.tsx:160`, `ScanInsights.test.tsx:230` |
| Detection information remains visible | `DetectionItem.test.tsx` (new: preserves detection info) |
| Confidence/evidence information intact | `DetectionItem.test.tsx:37-59` |
| Multiple technologies produce correct links | `ScanInsights.test.tsx:216`, `DetectionList.test.tsx` (new) |
| Existing scan detail rendering remains valid | `ScanViews.test.tsx` (all tests) |
| Technology detail route reachable from scan detail | `ScanViews.test.tsx:706`, `DetectionItem.test.tsx:149` |
| Existing comparison behavior not changed | `ScanComparison.test.tsx` (31 tests) |

---

## Validation

| Check | Result |
|---|---|
| Vitest (full suite) | 1637 passed (+4 new), 18 skipped ✅ |
| `tsc --noEmit` | 0 errors ✅ |
| ESLint | PASS ✅ |
| Prettier | All files use Prettier code style ✅ |
| `next build` | PASS (9 routes) ✅ |
| madge circular dependency | No circular dependency found (85 files) ✅ |
| `jsx: "preserve"` | Intact ✅ |

---

## Scope

**Explicitly unchanged (verified):**

| Component/Layer | Status |
|---|---|
| `@devlens/core` — domain model | Untouched |
| `@devlens/crawler` — crawl behavior | Untouched |
| `@devlens/detectors` — detector pipeline, technology catalog | Untouched |
| `@devlens/application` — `executeScan`, `runScan`, `persistResult` | Untouched |
| `@devlens/database` — persistence schema | Untouched |
| `DetectionItem.tsx` — linking already present | No logic changes |
| `ScanInsights.tsx` — linking already present | No logic changes |
| `ScanComparison.tsx` — linking already present | No logic changes |
| `DetectionList.tsx` — rendering pipeline | Untouched |
| `ScanLifecycle.tsx` — polling behavior | Untouched |
| `ScanDetailView.tsx` — detail page orchestrator | Untouched |
| API contracts | No endpoints added or modified |
| Scan execution algorithm | Untouched |
| Comparison semantics | Untouched |

**CSS-only changes:**
- `:focus-visible` accessibility styles added to existing link classes
- `:hover` style added to `.compareLink` (was missing — `.backLink` and
  `.newScanLink` already had it from Step 54)

**New files:**
- `docs/Step55-report.md`
