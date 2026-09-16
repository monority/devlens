# DevLens — Step 40: Detection Coverage Summary

## Context

Step 39 is COMPLETE.

Commit:

`b58fdb8` — `Step 39: Detection Explainability`

Current validation baseline:

* Typecheck: PASS
* Vitest: 1471 passed, 18 skipped
* ESLint: PASS
* Prettier: PASS
* Next build: PASS
* Madge circular dependency check: PASS
* `jsx: "preserve"`: intact

Recent report architecture:

```text
ScanDetailView
 ├── ScanOverview
 ├── ScanInsights
 ├── Snapshot / ScanningState
 └── Detections
      ├── DetectionFilterView
      │    ├── DetectionFilters
      │    └── ScanDetectionResults
      │         └── DetectionItem
      │              ├── Technology
      │              ├── Confidence
      │              ├── Evidence summary
      │              ├── Evidence sources
      │              └── Evidence details
      │
      └── fallback ScanDetectionResults
```

Step 39 added:

* `lib/detection-explainability.ts`
* `lib/detection-explainability.test.ts`
* evidence source descriptions in `DetectionItem`
* additional presentation tests
* source-list styling

The current test baseline is 1471 passed / 18 skipped.

---

# Objective

Implement Step 40:

## "Detection Coverage Summary"

Improve the completed scan report with a compact, factual summary of the evidence and detection coverage.

The summary should help answer:

1. How many technologies were detected?
2. How much supporting evidence exists?
3. How many distinct evidence types contributed?
4. Which evidence types are represented?

This is a presentation/reporting feature.

It must NOT modify:

* detector behavior
* scoring
* crawling
* persistence
* API contracts
* evidence generation

---

# Phase 0 — Inspect before implementing

Inspect:

* `ScanInsights`
* `getScanInsights`
* `ScanOverview`
* `getScanOverview`
* `ScanDetectionResults`
* `getScanDetectionResults`
* `DetectionItem`
* evidence models
* `evidenceTypeLabel`
* `evidenceIdentity`
* existing report layout
* existing tests
* existing CSS

This inspection is mandatory.

The primary question is:

## Does existing `ScanInsights` already expose some or all of this information?

If yes:

* do NOT duplicate the same calculation
* reuse or extend the existing pure presentation logic
* preserve existing consumers
* avoid two competing definitions of "evidence count"

---

# Important architectural constraint

There must be a single authoritative meaning for:

* detection count
* unique technology count
* evidence count
* evidence type count

Step 37 already established that `ScanOverview` uses a unique technology count.

Step 38 established deterministic deduplication.

Step 39 established evidence explainability.

Step 40 must build on those semantics.

Do not silently introduce a third counting model.

If two existing modules intentionally use different semantics, document the distinction explicitly before changing anything.

---

# Phase 1 — Define coverage model

If the existing architecture needs a new presentation model, introduce a small pure module.

Possible:

`lib/detection-coverage.ts`

Possible conceptual model:

```ts
DetectionCoverage {
  technologyCount
  detectionCount
  evidenceCount
  evidenceTypeCount
  evidenceTypes
}
```

The exact shape must follow existing conventions.

Do not blindly implement this example.

Determine the correct semantics from the current domain and presentation modules.

The model must be:

* pure
* deterministic
* immutable
* React-free
* database-free
* network-free

---

# Counting semantics

Explicitly define:

## Technology count

Number of unique detected technology IDs.

Reuse Step 37 semantics.

## Detection count

Only expose this if it has a useful meaning distinct from technology count.

If detections are already deduplicated by technology in the report, do not present two identical numbers without a clear reason.

## Evidence count

Use the same evidence identity semantics already established by the project.

Reuse the existing canonical evidence identity.

Do not invent another equality algorithm.

## Evidence type count

Number of distinct evidence types represented by the final report evidence set.

Evidence type comparison must be deterministic.

---

# Evidence type distribution

Expose the represented evidence types in a compact form.

Example:

```text
Evidence coverage

4 technologies
17 evidence items
5 evidence types

HTTP headers · HTML · Scripts · CSS · Resources
```

This is illustrative only.

Use actual data.

Do not invent categories.

If the current scan has no evidence:

```text
No supporting evidence
```

must be represented deliberately.

---

# UI

Create a small presentation component if necessary.

Possible:

`components/DetectionCoverage.tsx`

The exact name should follow repository conventions.

The component should be visually subordinate to `ScanOverview`.

Avoid creating another large dashboard card.

Preferred hierarchy:

```text
ScanOverview
    ↓
Detection coverage
    ↓
Detection results
```

The coverage section should act as a bridge between global scan metrics and individual detections.

---

# Relationship with ScanOverview

Do not duplicate all of ScanOverview.

If ScanOverview already displays:

* Technologies
* Evidence
* Highest confidence

do not simply render:

* Technologies
* Evidence

again.

Instead, provide information that genuinely adds value.

For example:

```text
ScanOverview
  Technologies: 4
  Evidence: 17
  Highest confidence: 96%

Detection coverage
  Evidence types: 5
  HTTP headers · HTML · Scripts · CSS · Resources
```

But only use this structure if it matches the actual data.

The user should not see the same metric twice without a reason.

---

# Relationship with ScanInsights

This is critical.

Do not create:

```text
ScanInsights
DetectionCoverage
ScanOverview
```

with three independently calculated versions of the same statistics.

Determine whether:

* `ScanInsights` should remain the source of existing insight metrics
* `DetectionCoverage` should consume those metrics
* or a lower-level shared pure calculation should become authoritative

Prefer a small shared pure domain/presentation calculation over duplicated formulas.

Do not perform a broad refactor unless required.

---

# Filtering

Coverage must describe the scan, not the currently filtered subset.

Therefore:

```text
ScanOverview
    └── global scan metrics

DetectionCoverage
    └── global scan evidence coverage

DetectionFilterView
    └── filtered presentation only
```

Applying a technology filter must NOT change:

* technology count
* evidence count
* evidence type count

unless the existing product semantics explicitly define coverage as filtered.

Default behavior should be global scan coverage.

Add an integration test proving this.

---

# Determinism

All output must be deterministic.

Evidence type list ordering should use an explicit stable order.

If there is no domain-defined order, sort by human-readable label.

Do not rely on insertion order.

---

# Empty and state behavior

### Completed scan with detections

Render coverage.

### Completed scan with zero detections

Render a meaningful empty state.

Example:

```text
No technology coverage available
```

Use repository tone and existing terminology.

### Pending

Do not render completed coverage.

### Running

Do not render completed coverage.

### Failed

Preserve existing behavior.

Do not broaden scope.

---

# Accessibility

Use semantic HTML.

Requirements:

* meaningful section heading
* metrics represented as text
* evidence types readable by screen readers
* no color-only communication
* no hover-only information
* lists use semantic list elements where appropriate

---

# Tests

If a pure coverage module is introduced, add tests covering:

1. zero detections
2. one technology
3. multiple technologies
4. duplicate technology IDs
5. evidence counting
6. duplicate evidence
7. multiple evidence types
8. duplicate evidence types
9. deterministic evidence type ordering
10. exact value preservation where applicable
11. immutability
12. determinism

Component tests:

1. technology coverage
2. evidence coverage
3. evidence type count
4. evidence type labels
5. empty state
6. semantic section structure
7. no duplicate/conflicting metrics
8. global values remain stable under filters

Integration tests:

1. completed scan renders coverage
2. non-completed scans do not
3. filtering does not change coverage
4. zero-detection scan behaves correctly

Do not test internal implementation details.

---

# CSS / visual design

Reuse existing report styles.

Do not introduce:

* gradients
* oversized cards
* decorative charts
* unnecessary icons
* progress bars that imply a percentage when no percentage exists
* arbitrary "health scores"

The section should look like a technical audit.

Compact example:

```text
Detection coverage

4 technologies     17 evidence     5 evidence types

HTTP headers · HTML · Scripts · CSS · Resources
```

Only render values that actually exist.

---

# No fake analytics

Do NOT introduce:

* "coverage score"
* "detection health"
* "confidence score"
* "site technology maturity"
* "scan quality"
* percentages without a meaningful denominator

Step 40 is factual reporting only.

---

# Validation

Run:

```text
npm run typecheck
npm test -- --run
npm run lint
npm run format:check
npm run build
npx madge --circular --extensions ts packages apps
```

And verify:

```text
grep '"jsx": "preserve"'
```

Expected test count should be greater than or equal to:

1471 passed, 18 skipped

Explain any unexpected regression.

---

# Documentation

Create:

`Step40-report.md`

Include:

* objective
* existing metrics inspected
* counting semantics
* relationship with ScanOverview
* relationship with ScanInsights
* filtering behavior
* deterministic ordering
* files created
* files modified
* tests
* validation
* known limitations
* commit hash

---

# Git

Create exactly one focused commit:

`Step 40: Detection Coverage Summary`

Do not push.

Do not modify unrelated files.

---

# Final response

Return:

## Step 40 — COMPLETE / BLOCKED

### Implementation

* ...

### Coverage semantics

* ...

### Architecture

* ...

### Tests

* ...

### Validation

* Typecheck:
* Tests:
* ESLint:
* Prettier:
* Build:
* Madge:
* JSX preserve:

### Git

* Commit:

### Known limitations

* ...

Do not claim COMPLETE unless all required validation checks pass.
