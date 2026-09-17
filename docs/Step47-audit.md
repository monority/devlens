# Step 47 Audit

## Current technology-change UX

The comparison page renders via `ScanComparison` (pure presentation component)
driven by `ComparisonResult`. The technology change section (`TechnologyChanges`)
renders four sub-sections:

1. **Added** — list of `TechnologyComparisonItem` with `status === 'added'`
2. **Removed** — list with `status === 'removed'`
3. **Present in both** — list with `status === 'unchanged'`
4. **Score / confidence changes** — table of `TechnologyComparison` where
   `scoreChanged === true`
5. **Evidence changes** — flat table of all `EvidenceComparison` across all
   technologies (section-level, duplicates per-tech display)

Each `TechnologyComparisonItem` renders: a status badge (ADDED/REMOVED/UNCHANGED),
technology name, category, and (for unchanged techs with score changes) an inline
confidence delta. For unchanged techs with evidence changes, it also renders an
inline `EvidenceChangeList` table.

If `hasChanges === false`, the entire section collapses to: "No detection
changes".

**No `getDetectionExplainability()` is called anywhere in the comparison
rendering path.** The explainability pipeline (used by `DetectionItem` on the
scan detail page) is not invoked.

---

## Added technologies

### What the UI shows

For an added technology (`status === 'added'`):

- Status badge: "ADDED" (green)
- Technology name (plain text, no link)
- Category (plain text)
- **No confidence value displayed** — `rightConfidence` exists in
  `TechnologyComparison` (e.g., `80`) but is only rendered when
  `detection.scoreChanged === true`, which is always `false` for added
  technologies (score comparison requires both `leftConfidence` and
  `rightConfidence` to be non-null).
- **No evidence displayed** — `evidenceChanges` is `[]` for added
  technologies (the `compareEvidence()` function only runs for technologies
  present in both scans).

### Information hidden that exists in `ComparisonResult`

- `result.right.detections` contains the full `DetectionResponse` for the
  added technology, including its complete `evidence[]` array.
- `detection.rightConfidence` holds the confidence value.
- This evidence CAN be retrieved by looking up the detection by
  `technology.id` in `result.right.detections`.

### What the user sees

```
ADDED   Vue   frontend
```

That is the entirety. No confidence, no evidence, no detection source.

### Comparison to scan detail page

On the scan detail page (`/scans/{id}`), `DetectionItem` renders the same
detection with:

- "Confidence: 80%"
- Explanation summary ("Detected from HTTP Header evidence.")
- Evidence count ("1 evidence item")
- Per-evidence source descriptions ("HTTP header 'Server'")
- Collapsible evidence tree (`<EvidenceList>`) with type labels and URLs

None of this is available for added technologies on the comparison page.

---

## Removed technologies

### What the UI shows

Identical to added technologies, but mirrored:

- Status badge: "REMOVED" (red)
- Technology name (plain text)
- Category (plain text)
- **No confidence displayed** — `leftConfidence` exists but is not shown
  (same `scoreChanged` gate).
- **No evidence displayed** — `evidenceChanges` is `[]` for removed
  technologies.
- **No information about why it was removed** — the left scan's evidence
  that originally supported the detection is available in
  `result.left.detections` but not surfaced.

### Absent vs. contradicted

The current model cannot distinguish:

- Technology **absent** from current scan (not detected, possibly still present)
- Technology **contradicted** by new evidence (explicitly not detected)

The comparison result only records `status: 'removed'` based on absence from
the right scan's detections. No contradiction analysis exists. The evidence
change table only covers technologies present in both scans.

### What the user sees

```
REMOVED   Angular   framework
```

No confidence, no evidence, no context about what previously supported the
detection.

---

## Score changes

### What the UI shows

For technologies present in both scans with changed confidence:

- **Table view** (`scoreTable`): columns: Technology | Previous | Current |
  Change
  - Previous: `leftConfidence` (e.g., `90`)
  - Current: `rightConfidence` (e.g., `95`)
  - Change: `scoreDelta` with `+`/`-` sign (e.g., `+5`)
- **Inline view** (`TechnologyComparisonItem`): shown in "Present in both"
  list with `leftConfidence → rightConfidence` and `↑`/`↓` arrow

### Communication quality

| Question              | Answer                                    |
| --------------------- | ----------------------------------------- |
| Previous score shown? | Yes                                       |
| Current score shown?  | Yes                                       |
| Direction?            | Yes (↑/↓ arrow + positive/negative delta) |
| Magnitude?            | Yes (delta value: `+5`, `-3`)             |
| Confidence context?   | Yes (raw values displayed exactly)        |

### Gap

- The score change table and the inline display are **redundant** — the same
  information is shown in two places (table + inline in the item list).
- No evidence context is provided for score changes — the user doesn't know
  _why_ confidence changed (which evidence was added/removed/valued
  differently). The per-tech `EvidenceChangeList` is shown inline if
  evidence changed, but there's no "detected from X evidence" explanation.

---

## Evidence changes

### What the UI shows

For technologies present in both scans:

1. **Per-technology** (`TechnologyComparisonItem`): if
   `evidenceChanges.some(e => e.status !== 'unchanged')`, renders an inline
   `EvidenceChangeList` table with columns: Status | Type | Evidence.
2. **Section-level** (`TechnologyChanges`): a flat `EvidenceChangeList` table
   aggregating ALL evidence changes across ALL unchanged technologies.

`EvidenceChangeRow` renders:

- Status badge (ADDED/REMOVED/UNCHANGED)
- Type label (evidenceTypeLabel: "HTTP Header", "Meta Tag", etc.)
- Evidence: for URL types, a clickable `<a>`; otherwise, field pairs
  ("Header: Server: nginx") using `evidenceFields()`

### What's hidden

- **No per-evidence origin description** — the scan detail page uses
  `getDetectionExplainability()` which produces "HTTP header 'Server'",
  "Meta tag 'generator'", etc. The comparison page does NOT call
  `getDetectionExplainability()`. Evidence rows show the type label and
  raw field values but no human-readable origin description.
- **No canonical identity** shown — `getEvidenceIdentity()` produces keys
  like `http_header:Server` but these are internal identifiers, not shown
  to the user. This is acceptable (internal).
- **Evidence changes only exist for unchanged technologies** — added/removed
  technologies have `evidenceChanges: []`. The evidence that proves
  addition/removal is not represented in `EvidenceComparison` at all.

---

## Unchanged technologies

### What the UI shows

In the "Present in both (N)" list:

- Status badge: "UNCHANGED"
- Technology name (plain text, no link)
- Category (plain text)
- Score delta (only if `scoreChanged === true`): `leftConfidence → rightConfidence ↑/↓`
- Evidence changes (only if evidence changed): inline `EvidenceChangeList` table

If neither score nor evidence changed, the item is minimal:

```
UNCHANGED   React   frontend
```

### Evaluation

This is reasonable — unchanged technologies are shown for context, with
minimal info when nothing changed. The "Present in both" grouping is
intentional (not hidden, not summarized into a single count).

However:

- Technology names are **plain text** (not links to the technology catalog,
  unlike `DetectionItem` on the scan detail page which links `isKnownTechnology`
  techs to `/technologies/{id}`).
- No evidence is shown for unchanged techs with no changes — the user cannot
  see what evidence supports the "unchanged" status. This is consistent with
  the scan detail page's "no changes = minimal display" pattern.

---

## Explainability gaps

### Path: `ComparisonResult → component → displayed information`

| Change type                 | Data in ComparisonResult                                 | Data in component                                          | Data displayed               | Loss?                                                        |
| --------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| Added                       | `rightConfidence`, `right.detections[].evidence`         | `rightConfidence` (not rendered), evidence (not looked up) | Badge + name + category      | **YES** — confidence and evidence hidden                     |
| Removed                     | `leftConfidence`, `left.detections[].evidence`           | `leftConfidence` (not rendered), evidence (not looked up)  | Badge + name + category      | **YES** — confidence and evidence hidden                     |
| Score change                | `leftConfidence`, `rightConfidence`, `scoreDelta`        | All three rendered                                         | Table row + inline delta     | No                                                           |
| Evidence change             | `evidenceChanges[]` with `left`/`right` evidence items   | Rendered via `EvidenceChangeRow`                           | Status + type + fields/URL   | Partial — no origin description                              |
| Unchanged (no change)       | Full detection in `left.detections` / `right.detections` | Only badge + name + category                               | Minimal item                 | Intentional                                                  |
| Unchanged (score change)    | Both evidence arrays in scan responses                   | `evidenceChanges[]` only                                   | Inline evidence change table | **YES** — per-tech evidence tree not shown                   |
| Unchanged (evidence change) | Both full detections                                     | `evidenceChanges[]` only                                   | Table (Status/Type/Evidence) | Partial — no "Detected from..." summary, no collapsible tree |

### Key findings

1. **Added/removed technologies hide ALL supporting evidence and confidence**
   — the data is in `ComparisonResult.left`/`right` `detections` arrays but
   is never looked up or rendered.

2. **`getDetectionExplainability()` is unused** on the comparison page — the
   explainability pipeline (source descriptions, evidence type summary,
   "Detected from..." text) is only used in `DetectionItem` on scan detail.

3. **`EvidenceChangeRow` duplicates the evidence type summary** that exists in
   `getDetectionExplainability().evidenceTypes` — but doesn't use it, instead
   relying on the raw `EvidenceComparison.type` field.

4. **Technology names are not linked** to the technology catalog in comparison
   (but are linked in `DetectionItem` on scan detail).

---

## Existing reusable UI

### Directly reusable for comparison explainability

| Component                      | What it provides                                                                                                     | Can be reused for                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `DetectionItem`                | Renders a detection with confidence, explainability summary, evidence source descriptions, collapsible evidence tree | Added/removed/unchanged technology evidence display |
| `EvidenceList`                 | Collapsible `<details>` tree of evidence items with type labels + URL links                                          | Evidence display for added/removed techs            |
| `EvidenceItem`                 | Single evidence row with type label + fields + URL links + code formatting                                           | Evidence presentation                               |
| `getDetectionExplainability()` | Summary ("Detected from X evidence"), evidence sources, deduped evidence array                                       | Any detection rendering                             |
| `getDetectionExplanation()`    | Neutral summary string, evidence types, confidence                                                                   | Lightweight explanation                             |
| `evidenceTypeLabel()`          | "HTTP Header", "Meta Tag", etc.                                                                                      | Already used in `EvidenceChangeRow`                 |
| `evidenceFields()`             | Field extraction (name/value pairs)                                                                                  | Already used in `EvidenceChangeRow`                 |
| `getScanOverview()`            | Technology count, evidence count, highest confidence                                                                 | Already used (Step 46)                              |
| `ScanOverview`                 | Presentation of overview metrics                                                                                     | Already used (Step 46)                              |
| `isKnownTechnology()`          | Tech catalog membership check                                                                                        | For linking tech names to `/technologies/{id}`      |

### What would NOT need new components

- No new evidence-diff algorithm needed — `compareScans()` already produces
  `EvidenceComparison[]` with `left`/`right` evidence items.
- No new API calls needed — `ComparisonResult` already contains both full
  `ScanDetailResponse` objects.
- No new domain types needed — `TechnologyComparison` already has
  `leftConfidence`/`rightConfidence`/`evidenceChanges`.

### What is needed

- A function to look up a `DetectionResponse` by `technology.id` from the
  scan's detections array (trivial: `result.right.detisions.find(d =>
d.technology.id === techId)`).
- Optional: reuse of `DetectionItem` or a simplified variant for the
  comparison list items.

---

## MUST HAVE

### 1. Show confidence for added/removed technologies

`TechnologyComparison.rightConfidence` (for added) and
`leftConfidence` (for removed) are available but not displayed. The
`TechnologyComparisonItem` only shows the score delta when `scoreChanged`
is true, which is always false for added/removed techs.

**Fix**: Display `rightConfidence` for added techs and `leftConfidence` for
removed techs. This is a one-line change in `TechnologyComparisonItem`.

### 2. Show supporting evidence for added/removed technologies

The evidence for added technologies is in `result.right.detections`. For
removed, it's in `result.left.detections`. Both are available on the
`ComparisonResult` (which carries both full scan responses) but are never
looked up or rendered.

**Fix**: In `TechnologyComparisonItem`, when `status === 'added'`, look up
the right-side detection by `tech.id` from `result.right.detections` and
render its evidence using existing components (`EvidenceList` + `EvidenceItem`
or a simplified variant). When `status === 'removed'`, look up the left-side
detection similarly.

### 3. Distinguish "absent" from "contradicted" for removed technologies

Currently, a removed technology shows the same minimal info regardless of
whether the current scan simply didn't detect it or explicitly contradicted
it. The evidence change table only covers unchanged technologies.

**Note**: This may require a comparison semantics change (the current
`compareScans()` does not track contradictions). This is a **SHOULD HAVE**
rather than MUST HAVE if it requires model changes.

### 4. Back-to-scan-history link on the success path

Not currently present. The comparison page's success path has no way to
navigate back to history except via browser back.

---

## SHOULD HAVE

### 5. Reuse `getDetectionExplainability()` for evidence display

The comparison page's evidence change rows show raw evidence fields but no
origin description ("HTTP header 'Server'"). `getDetectionExplainability()`
already produces these descriptions. Reusing it for added/removed tech
evidence would make the explanation consistent with the scan detail page.

### 6. Remove or collapse the redundant section-level evidence changes table

The section-level `EvidenceChangeList` (flat, all techs)
duplicates information already shown per-technology. It should either be
removed or made collapsible to reduce visual noise.

### 7. Link technology names to the catalog

`DetectionItem` links known technologies to `/technologies/{id}`. The
comparison items render names as plain text. Adding these links would
improve discoverability.

### 8. Collapse redundant score change display

The score changes are shown both as a table and inline in the "Present in
both" list. One of these should be removed or made collapsible.

---

## OUT OF SCOPE

- Modifying `compareScans()` semantics or `ComparisonResult` type
- Adding a new evidence-diff algorithm
- New backend data or API endpoints
- New persistence queries
- New detection or scoring logic
- Historical evolution beyond two scans
- Technology catalog page changes
- Dashboard metrics or trend visualization

---

## Proposed Step 48

### Scope: Surface evidence and confidence for added/removed technologies

Replace the minimal `TechnologyComparisonItem` rendering for added/removed
technologies with a richer display that includes:

1. **Confidence value** (from `rightConfidence`/`leftConfidence`)
2. **Supporting evidence** (looked up from `result.right.detections`/`result.left.detections`
   by `technology.id`, rendered with existing `EvidenceList` + `EvidenceItem`)
3. **Detection explanation** (from `getDetectionExplainability()`)

This reuses existing components and data — no new comparison semantics.

### Files likely to change

| File                                              | Change                                                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/ScanComparison.tsx`      | Enhance `TechnologyComparisonItem` to accept and render detection data; render `EvidenceList` for added/removed techs; add confidence display |
| `apps/web/src/components/ScanCard.module.css`     | Minor style adjustments for evidence in comparison items                                                                                      |
| `apps/web/src/components/ScanComparison.test.tsx` | New tests for added/removed evidence rendering                                                                                                |
| `apps/web/src/lib/comparison.ts`                  | Possibly add a pure helper `findDetectionById(scans, techId)` — or inline a `.find()` call                                                    |

### Tests

- Added technology: verifies confidence value + evidence items are rendered
- Removed technology: verifies confidence value + evidence items are rendered
- Unchanged technology: existing tests remain green
- Identical scans: "No detection changes" still shown
- Score changes table: unchanged

### Validation

Same suite as Step 44/46:
`npx tsc --noEmit`, `npx vitest run`, `npx eslint .`,
`npx prettier --check apps/`, `npx next build`,
`npx madge --circular --extensions ts apps packages`,
`grep '"jsx": "preserve"' apps/web/tsconfig.json`

---

## Risk

| Risk                                                                   | Likelihood | Mitigation                                                                 |
| ---------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| Added/removed evidence makes the comparison section very long          | Medium     | Use collapsible `<details>` (existing `EvidenceList` pattern)              |
| Looking up detection by ID is O(n) per tech — performance              | Low        | Detections arrays are small (< 100 items); `.find()` is negligible         |
| `getDetectionExplainability()` calls may be expensive                  | Low        | It's a pure function tested for performance; called only for visible items |
| Existing test assertions break if HTML structure changes               | Low        | Tests assert on text content, not exact markup; new tests are additive     |
| `ScanComparison.tsx` becomes too large with inline detection rendering | Low        | Could extract a `ComparisonTechnologyDetail` sub-component                 |

READY FOR IMPLEMENTATION: YES
