# DevLens — Step 37: Scan Report Overview Header

## Goal

Improve the completed scan report with a compact **at-a-glance overview header**.

The user should be able to understand the essential result of a scan immediately after opening `/scans/{id}`:

* target
* scan status
* scan date/time
* number of detected technologies
* highest confidence
* number of evidence entries
* quick access to existing actions

This is a presentation/UX improvement based exclusively on existing scan data.

Do not introduce new analysis or modify the scan domain.

---

## 1. Inspect before changing

Inspect:

* `apps/web/src/app/scans/[id]/page.tsx`
* `apps/web/src/components/ScanViews.tsx`
* `apps/web/src/components/ScanLifecycle.tsx`
* `apps/web/src/components/ScanSummary.tsx`
* `apps/web/src/components/ScanInsights.tsx`
* `apps/web/src/components/ExportScanButton.tsx`
* `apps/web/src/components/CopyReportLink.tsx`
* `apps/web/src/lib/scan-insights.ts`
* existing scan detail CSS
* existing scan detail tests

Understand the current visual hierarchy before modifying it.

Do not duplicate existing calculations unnecessarily.

---

## 2. Overview model

Create a small pure presentation model, preferably in a dedicated module such as:

```text
apps/web/src/lib/scan-overview.ts
```

Suggested shape:

```ts id="v1nq4p"
type ScanOverview = {
  target: string;
  status: ScanStatus;
  createdAt: string;
  technologyCount: number;
  evidenceCount: number;
  highestConfidence: number | null;
};
```

Derive values only from the existing `ScanResult`.

Rules:

### target

Use the existing scan target exactly as represented by the current API/domain result.

Do not canonicalize or transform the target.

### status

Use the existing scan status.

Do not create a new status model.

### createdAt

Use the existing scan creation timestamp.

Do not introduce a new timestamp.

### technologyCount

Count unique technology IDs in the final detections.

Do not count duplicate detection records multiple times.

### evidenceCount

Count evidence entries across the final detections.

If duplicate detection IDs somehow exist, do not invent new deduplication semantics here. Prefer the existing final detection structure already returned by the scan pipeline.

### highestConfidence

Return the highest existing detection confidence.

Do not recalculate, normalize, average, or reinterpret confidence.

For zero detections:

```ts id="y7j0dw"
highestConfidence: null
```

---

## 3. Determinism and purity

The overview function must be:

* pure
* synchronous
* deterministic
* immutable
* React-independent
* browser-independent
* network-independent

Do not mutate the scan result.

Do not introduce random IDs or generated timestamps.

---

## 4. UI

Create a dedicated presentation component, for example:

```text
components/ScanOverview.tsx
```

Keep it pure and props-driven.

Suggested visual structure:

```text
TARGET
example.com

COMPLETED
September 16, 2026 · 18:20

4 technologies     9 evidence sources     95 highest confidence
```

Use the project's existing design language.

The exact visual implementation is up to the existing CSS conventions.

Do not introduce:

* cards inside cards
* oversized hero sections
* decorative gradients
* excessive icons
* charts
* gauges
* progress bars
* animations

The overview should be compact.

---

## 5. Target presentation

The target is one of the most important pieces of information.

Display it prominently but safely.

Requirements:

* preserve the actual target
* do not leak scan errors into the target field
* do not create an external navigation link unless the existing UI already does so
* avoid unsafe HTML rendering

Do not expose additional crawler/internal metadata.

---

## 6. Status

Reuse the existing status labels/classes.

Do not create another status-to-label mapping.

Existing states:

* pending
* running
* completed
* failed

For completed scans, the overview is the primary report header.

For pending/running/failed scans, preserve the existing lifecycle UI.

Do not force the overview into states where it would provide misleading information.

---

## 7. Date formatting

The underlying timestamp must remain unchanged.

Presentation formatting may use the existing application conventions.

Requirements:

* deterministic enough for tests
* readable to users
* do not modify the stored timestamp
* do not introduce timezone-specific assumptions into the domain

If the existing application already has a date formatter, reuse it.

Avoid creating multiple competing date-format utilities.

---

## 8. Metrics semantics

Use precise labels.

Prefer:

* `Technologies`
* `Evidence`
* `Highest confidence`

Avoid ambiguous wording such as:

* `Sources` if it could be confused with external sources
* `Accuracy`
* `Reliability`
* `Certainty`
* `Quality`
* `Score` unless referring explicitly to the existing confidence value

The UI must not imply that confidence represents probability or correctness.

If the existing confidence is displayed as a number, preserve its exact value.

---

## 9. Actions

Keep existing actions functional:

* Copy report link
* Export JSON
* Compare scans
* technology links
* evidence disclosure
* detection filters

Do not redesign these actions in this step.

The overview may provide a visually cleaner location for existing actions if this improves hierarchy, but do not duplicate buttons.

---

## 10. Interaction with Step 36

The overview must remain visible when detection filters are active.

For example:

```text
/scans/abc123?q=react
```

must still show:

* original technology count
* original evidence count
* original highest confidence

These metrics describe the scan itself, not the filtered subset.

Do not change them when the detection list is filtered.

The overview must not become filter-dependent.

---

## 11. Lifecycle behavior

### Completed

Show the complete overview.

### Failed

Preserve the existing failed scan presentation.

Do not show misleading detection metrics if the existing failed result does not represent a completed detection set.

### Pending / running

Preserve existing lifecycle behavior.

Do not introduce fake metrics or progress.

Polling behavior must remain unchanged.

---

## 12. Accessibility

Requirements:

* semantic heading hierarchy
* target is clearly identifiable
* status is text, not color-only
* metric labels are associated with their values
* existing buttons remain keyboard accessible
* no information conveyed solely through icons

Do not add ARIA attributes unless they are actually necessary.

Prefer semantic HTML.

---

## 13. Tests

### Pure `scan-overview` tests

Add tests for:

1. completed scan
2. multiple technologies
3. unique technology counting
4. zero detections
5. evidence counting
6. highest confidence
7. highest confidence with equal values
8. confidence value preserved exactly
9. target preserved exactly
10. status preserved
11. createdAt preserved
12. immutability
13. deterministic output

### Component tests

Add tests for:

1. target renders
2. status renders
3. date renders
4. technology count renders
5. evidence count renders
6. highest confidence renders
7. zero-detection state
8. completed report
9. accessibility/semantic structure
10. existing actions remain available
11. overview remains visible when filters are active
12. filtered detections do not alter overview metrics

Do not weaken existing tests.

---

## 14. Integration

Integrate `ScanOverview` into the completed scan detail view.

Recommended hierarchy:

```text
Scan report
  ├── ScanOverview
  ├── Detection filters
  ├── Detection results
  └── Insights
```

Preserve existing content.

Do not duplicate:

* ScanSummary
* ScanInsights
* detection explanations
* technology composition
* technology evidence matrix

If `ScanSummary` overlaps heavily with the new overview, consolidate presentation carefully rather than rendering duplicate information.

The underlying data contracts must remain unchanged.

---

## 15. Scope constraints

Do NOT:

* modify API contracts
* modify database schemas
* modify repositories
* modify detectors
* modify scoring
* modify crawler behavior
* modify evidence semantics
* modify scan lifecycle
* modify filtering semantics
* add dependencies
* add API endpoints
* add client state
* add charts
* add analytics
* add AI/LLM functionality
* add new confidence calculations
* add external metadata

This step is strictly:

**existing scan result → compact report overview → clearer information hierarchy**

---

## 16. Documentation

Create:

```text
docs/Step37-report.md
```

Document:

* objective
* overview model
* metric semantics
* lifecycle behavior
* integration
* accessibility
* tests
* validation
* explicit non-goals

---

## 17. Validation

Run:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps
```

Also verify:

```text
jsx: "preserve"
```

Expected:

* all tests pass
* typecheck passes
* lint passes
* build passes
* no circular dependencies
* no regressions to filtering/polling/evidence UI

---

## 18. Manual QA

Verify a completed scan with:

* 0 detections
* 1 detection
* multiple detections
* multiple evidence types
* duplicate technology IDs if representable by fixtures
* active `q` filter
* active `category` filter
* both filters
* Copy report link
* JSON export
* comparison navigation
* technology links
* evidence disclosure

Also verify:

* overview metrics do not change when filters change
* original detection ranking remains unchanged
* existing insights remain visible
* Technology Composition remains visible
* Technology Evidence remains visible

---

## 19. Final report

At completion report:

1. files created
2. files modified
3. overview model
4. metric semantics
5. lifecycle behavior
6. UI integration
7. tests added
8. validation results
9. manual QA results
10. git commit hash

Do not push to GitHub unless credentials are available.

Keep the implementation narrowly scoped to Step 37.
