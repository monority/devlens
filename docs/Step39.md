# DevLens — Step 39: Detection Explainability

## Context

Step 38 is COMPLETE.

Commit:

`5599c57` — `Step 38: Detection Results Evidence Report`

Current validation baseline:

* Typecheck: PASS
* Vitest: 1452 passed, 18 skipped
* ESLint: PASS
* Prettier: PASS
* Next build: PASS
* Madge circular dependency check: PASS
* `jsx: "preserve"`: intact

Step 38 introduced:

* `lib/scan-detection-results.ts`
* `components/ScanDetectionResults.tsx`

Detection results are now:

* deterministically sorted
* deduplicated by technology ID
* evidence deduplicated using the existing canonical `evidenceIdentity`
* evidence deterministically sorted
* integrated with `DetectionFilterView`
* stable for completed scans without `initialQuery`

Step 37 introduced the independent `ScanOverview`.

Do not regress either behavior.

---

# Objective

Implement Step 39:

## "Detection Explainability"

Improve the presentation of each technology detection so the user can understand:

1. What was detected
2. How confident DevLens is
3. Why the technology was detected
4. Which evidence supports the detection
5. Where that evidence originated, when such information already exists

This is a presentation/reporting step.

It must NOT modify the detection engine.

---

# Phase 0 — Inspect

Before changing anything inspect:

* `lib/scan-detection-results.ts`
* `components/ScanDetectionResults.tsx`
* existing `DetectionList`
* existing `DetectionItem`
* existing `EvidenceList`
* existing `EvidenceItem`
* `scan-insights.ts`
* `evidenceIdentity`
* Detection
* Evidence
* Technology
* detector implementations
* detector tests
* scoring implementation
* existing CSS

Determine exactly what information is already available.

Do not assume evidence contains fields that do not exist.

Do not invent explanations.

---

# Phase 1 — Presentation model

If useful, introduce a pure presentation boundary.

Possible module:

`lib/detection-explainability.ts`

Possible conceptual model:

```ts
DetectionExplanation {
  technology
  confidence
  evidence
  evidenceSummary
}
```

The exact model must follow the existing repository architecture.

Do not duplicate domain types.

Do not create a second confidence calculation.

Do not create a second evidence identity algorithm.

Reuse existing:

* confidence values
* evidence identity
* technology identity
* evidence types
* evidence source information

The module must be:

* pure
* deterministic
* immutable
* React-free
* database-free
* network-free

---

# Phase 2 — Explainability semantics

For each detection, derive a concise explanation from its existing evidence.

The UI should make the relationship explicit:

Detection
→ supporting evidence
→ evidence source

Example only:

```text
WordPress
92% confidence

Detected from 3 pieces of evidence

robots.txt
/wp-admin/

HTML
/wp-content/

CSS
WordPress-specific signature
```

This is only an illustration.

Use actual repository data.

Never fabricate labels, paths, URLs, detector names or reasons.

---

# Evidence types

Inspect the existing evidence type definitions.

If evidence already distinguishes things such as:

* header
* HTML
* script
* resource
* link
* robots
* CSS
* manifest

then expose those distinctions in the UI.

Do not introduce a new taxonomy unless absolutely necessary.

Evidence type labels should be human-readable.

If an existing formatter exists, reuse it.

Otherwise create a small pure formatter.

---

# Evidence values

Preserve evidence values exactly.

Do not truncate values in the underlying presentation model.

If the UI needs truncation for very long values:

* preserve the complete value in accessible text or an appropriate disclosure
* avoid destroying useful debugging information
* do not silently replace important evidence

URLs must remain readable.

Use semantic links only where the existing evidence represents a safe navigable URL.

Never generate unsafe `href` values.

Never use `dangerouslySetInnerHTML`.

---

# Confidence presentation

Use the existing confidence value.

Do not:

* recalculate confidence
* modify scoring
* introduce thresholds
* invent confidence categories
* label detections "high", "medium", "low" unless the repository already has such semantics

Confidence must remain faithful to the domain value.

---

# UI structure

Evolve `DetectionItem` or introduce a small dedicated explainability presentation component if that creates a cleaner boundary.

Preferred conceptual hierarchy:

```text
Detection
├── Technology identity
├── Confidence
├── Evidence summary
└── Evidence details
    ├── Evidence type
    ├── Evidence value
    └── Source/context
```

The result should resemble a technical audit report.

Avoid:

* dashboard-style giant cards
* decorative gradients
* excessive pills
* redundant badges
* fake "AI explanation" language
* marketing copy
* invented natural-language claims

This is an observability/developer product.

The evidence itself should be the explanation.

---

# Accessibility

Use semantic HTML.

Requirements:

* technology remains a logical heading where appropriate
* confidence is readable as text
* evidence uses list semantics
* evidence type is available to assistive technology
* links have meaningful accessible names
* no information relies only on color
* no information relies only on hover
* keyboard navigation remains intact

---

# Filtering

Do not modify the existing filtering architecture.

Expected behavior:

```text
ScanOverview
    ↓
stable global metrics

DetectionFilterView
    ↓
filtered detections

ScanDetectionResults
    ↓
deterministic results

DetectionItem
    ↓
explanation/evidence
```

Changing a filter must not mutate the original scan data.

Clearing filters must restore the same deterministic ordering.

---

# Empty states

Preserve current behavior for:

### Completed scan with detections

Show detection explanations.

### Completed scan with zero detections

Keep the existing intentional empty state.

Do not show a fake explanation.

### Pending/running

Preserve current state-specific UI.

### Failed

Preserve existing failed-scan behavior unless the current architecture naturally supports the same presentation.

Do not broaden scope unnecessarily.

---

# Tests

Add pure tests if a new presentation module is introduced.

At minimum:

1. one detection
2. multiple detections
3. confidence preservation
4. evidence preservation
5. evidence type preservation
6. exact evidence value preservation
7. deterministic output
8. immutability
9. duplicate evidence remains deduplicated
10. existing evidence identity remains authoritative

Component tests:

1. technology name
2. confidence
3. evidence count
4. evidence type
5. evidence value
6. multiple evidence items
7. multiple detections
8. empty state
9. semantic structure
10. accessible text
11. long evidence values
12. filter integration

Do not test implementation details unnecessarily.

Prefer observable behavior.

---

# Regression requirements

Step 39 must preserve:

* `ScanOverview` outside filtering
* deterministic detection ordering from Step 38
* technology deduplication
* evidence deduplication
* existing `evidenceIdentity`
* existing confidence values
* pending/running/failed behavior
* URL-linked detection filtering
* current detector pipeline
* current scoring behavior

Do not modify:

* detector algorithms
* detector evidence generation
* scoring formula
* crawler behavior
* persistence
* API contracts

unless inspection proves a minimal presentation-only adaptation is required.

---

# CSS

Reuse existing styles and tokens.

Do not introduce a new visual language.

The hierarchy should make this obvious:

1. technology
2. confidence
3. evidence count
4. supporting evidence

Evidence should be compact and scannable.

Do not turn every evidence item into a large card.

Long values must not cause horizontal overflow.

---

# Validation

Run the complete project validation suite:

```text
npm run typecheck
npm test -- --run
npm run lint
npm run format:check
npm run build
npx madge --circular --extensions ts packages apps
```

Also verify:

```text
grep '"jsx": "preserve"'
```

All checks must pass.

Compare the final test count against the Step 38 baseline:

1452 passed, 18 skipped.

Explain any expected increase.

---

# Documentation

Create:

`svgStep39-report.md`

Include:

* objective
* inspected architecture
* presentation boundary
* explainability semantics
* evidence mapping
* accessibility decisions
* files created
* files modified
* tests
* validation
* known limitations
* commit hash

---

# Git

Create exactly one focused commit:

`Step 39: Detection Explainability`

Do not push.

Do not modify unrelated files.

---

# Final response

Return:

## Step 39 — COMPLETE / BLOCKED

### Implementation

* ...

### Explainability

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

Do not claim COMPLETE unless all validation checks pass.
