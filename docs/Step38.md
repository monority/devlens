# DevLens — Step 38: Detection Results / Technology Evidence Section

## Context

Step 37 is COMPLETE.

Commit:
9c23d1d — "Step 37: Scan Report Overview Header"

Current validation baseline:

- Typecheck: PASS
- Vitest: 1427 passed, 18 skipped
- ESLint: PASS
- Prettier: PASS
- Next build: PASS
- Madge circular dependency check: PASS
- tsconfig jsx preserve: intact

Step 37 introduced:

- lib/scan-overview.ts
- lib/scan-overview.test.ts
- components/ScanOverview.tsx
- components/ScanOverview.test.tsx

And modified:

- components/ScanViews.tsx
- components/ScanViews.test.tsx
- components/ScanCard.module.css

Completed scans now render ScanOverview.

Important architectural behavior:

- ScanOverview is rendered outside DetectionFilterView.
- Its metrics are therefore stable when detection filters are applied.
- ScanSummarySection remains for pending/running/failed states.
- ScanOverview is pure and has no client boundary.
- Technology count is deduplicated with Set.
- Date formatting is deterministic using UTC methods.

---

# Objective

Implement Step 38:

## "Detection Results / Technology Evidence Section"

Improve the completed scan report so that the detection area presents technologies and their supporting evidence as a structured, readable report.

The goal is NOT to change detection behavior.

The goal is to make the existing detection results substantially easier to understand.

A completed scan should communicate:

1. Which technologies were detected
2. Confidence for each detection
3. How many pieces/types of evidence support the detection
4. What the evidence actually was
5. Where the evidence came from when that information already exists
6. A stable, deterministic ordering

---

# Phase 0 — Inspect first

Before writing code, inspect:

- components/ScanViews.tsx
- components/ScanViews.test.tsx
- components/DetectionFilterView.tsx if present
- all components currently responsible for rendering detections
- domain detection models
- ScanDetailResponse
- Technology
- Detection
- Evidence
- EvidenceType / evidence source models if present
- getEvidenceKey()
- ConfidenceScorer
- scoring pipeline
- Step 37 ScanOverview implementation
- existing CSS conventions

Search for existing detection/evidence presentation logic.

Do NOT create duplicate domain models if suitable existing models already exist.

Document the current rendering path briefly before implementation.

---

# Phase 1 — Define the presentation boundary

If the current data shape is too coupled to rendering, introduce a small pure presentation module.

Prefer something like:

lib/scan-detection-results.ts

Possible responsibility:

getScanDetectionResults(scan: ScanDetailResponse): ScanDetectionResult[]

The exact naming and shape should follow the repository's existing conventions.

The presentation model should contain only information required by the UI.

For example, conceptually:

DetectionResultPresentation {
  technology
  confidence
  evidenceCount
  evidence
}

EvidencePresentation {
  type
  value
  source
}

Do NOT blindly copy this structure if the existing domain models already provide a better boundary.

Requirements:

- pure
- deterministic
- immutable from the caller's perspective
- no React
- no Three.js
- no database access
- no network
- no mutation of the input

---

# Phase 2 — Deterministic ordering

The report must render detections deterministically.

Use the existing score/confidence semantics.

Preferred ordering:

1. highest confidence
2. technology name as deterministic tie-breaker

Do not rely on:

- database insertion order
- object property order
- Set iteration order unless the source ordering is explicitly part of the contract

Evidence ordering must also be deterministic.

If evidence has an existing canonical key or identity helper, reuse it.

Do not invent a second evidence identity algorithm.

---

# Phase 3 — Detection results UI

Create or evolve a presentation component.

Possible name:

components/ScanDetectionResults.tsx

Again, follow repository conventions if another name is more appropriate.

For each detected technology, render a clear result block containing:

### Technology identity

- technology name
- confidence
- optional category/version only if already available

### Evidence summary

- number of supporting evidence items
- evidence types
- concise human-readable evidence values

### Evidence details

When appropriate, expose:

- evidence type
- evidence value
- source URL/path/header/etc.
- other existing source metadata

Do not invent information that does not exist in the scan model.

---

# UX requirements

The result should read like a technical audit report, not a generic dashboard.

Avoid:

- oversized cards
- decorative gradients
- meaningless icons
- excessive badges
- duplicated information
- dashboard clutter

Prefer:

- strong typography hierarchy
- compact rows
- clear evidence grouping
- readable long URLs
- semantic HTML
- accessible labels
- predictable spacing

The existing DevLens visual language should be preserved.

---

# Confidence

Reuse the existing confidence representation.

Do NOT recompute confidence in React.

Do NOT create a second scoring formula.

If the repository already has a confidence formatter/presentation helper, reuse it.

Otherwise introduce a small pure formatter rather than embedding formatting logic throughout JSX.

The displayed value must correspond exactly to the existing detection confidence.

---

# Evidence

Evidence is the most important part of this step.

The user should be able to understand:

"Why did DevLens detect this technology?"

For example, conceptually:

WordPress
Confidence: 92%
Evidence: 3

- robots.txt → /wp-admin/
- HTML → /wp-content/
- CSS → WordPress-specific signature

But only render information actually available in the current domain model.

Never fabricate evidence descriptions.

If the current evidence model stores structured information, preserve that structure.

If it only stores a raw value, display the raw value safely.

---

# Filtering

DetectionFilterView already exists.

Do not break it.

Determine how filtering currently works.

The expected behavior is:

- ScanOverview remains unaffected by filters.
- Detection results respond to the existing filter mechanism.
- Filter state should not alter underlying scan data.
- Clearing filters restores the exact deterministic result set.
- No duplicate detections should appear.

Do not introduce a second filtering system unless the current architecture genuinely requires it.

---

# Empty states

Handle:

### Completed scan with detections

Render the full results.

### Completed scan with zero detections

Render a deliberate empty state.

Example concept:

"No technologies detected"

Do not treat this as an error.

### Non-completed scan

Do not render the completed detection report where the existing state-specific UI should remain.

Preserve current pending/running/failed behavior.

---

# Accessibility

Use semantic HTML.

Requirements:

- headings have logical hierarchy
- technology names are readable by screen readers
- confidence is not communicated by color alone
- evidence lists use list semantics where appropriate
- links are real links if they are navigable
- long URLs/values must remain readable without breaking layout
- no information should exist only through hover

---

# Testing

Add pure presentation tests if a presentation module is introduced.

At minimum test:

1. empty detections
2. one detection
3. multiple technologies
4. confidence preservation
5. deterministic confidence ordering
6. alphabetical tie-break
7. evidence count
8. multiple evidence types
9. deterministic evidence ordering
10. duplicate evidence behavior according to existing domain semantics
11. exact evidence value preservation
12. immutability
13. determinism
14. completed scan behavior

Add component tests for:

1. technology name
2. confidence
3. evidence count
4. evidence values
5. evidence type
6. multiple detections
7. empty state
8. semantic headings/lists
9. accessibility-relevant text
10. filter interaction
11. non-completed states remain unchanged

Do not over-test implementation details.

Prefer user-visible behavior and pure transformation contracts.

---

# Integration

Integrate the new results section into the completed scan report.

Do not unnecessarily restructure ScanViews.

The intended conceptual structure is:

ScanDetailView
 ├── ScanOverview
 └── Detection results
      └── existing DetectionFilterView / filtering behavior

Keep the overview independent from filtering.

---

# CSS

Follow the existing ScanCard.module.css conventions.

Do not introduce a new design system.

Prefer existing tokens/variables where available.

The visual hierarchy should distinguish:

- technology
- confidence
- evidence summary
- evidence details

Avoid making every evidence item look like a separate large card.

Think "technical report" rather than "SaaS dashboard".

---

# Security / robustness

Treat all scan-derived strings as untrusted data.

React escaping should remain intact.

Do not use dangerouslySetInnerHTML.

URLs must not become unsafe links.

If rendering an href from scan evidence, validate the URL scheme according to existing repository security conventions.

Do not introduce arbitrary javascript/data URL navigation.

---

# Validation

Run:

npm run typecheck
npm test -- --run
npm run lint
npm run format:check
npm run build
npx madge --circular --extensions ts packages apps

Also inspect git diff.

If repository scripts differ, use the existing equivalent commands.

All checks must pass.

---

# Documentation

Create:

svgStep38-report.md

The report must contain:

- objective
- inspected architecture
- files created
- files modified
- presentation model if introduced
- deterministic ordering rules
- evidence rendering strategy
- filtering behavior
- accessibility decisions
- tests added
- validation results
- known limitations
- commit hash

---

# Git

Create one focused commit:

Step 38: Detection Results Evidence Report

Do NOT push.

Do not modify unrelated files.

---

# Final response format

Return:

## Step 38 — COMPLETE / BLOCKED

### Implementation

- ...

### Architecture

- ...

### Tests

- ...

### Validation

- typecheck:
- tests:
- eslint:
- prettier:
- build:
- madge:

### Git

- commit:

### Known limitations

- ...

If anything is blocked, explain exactly what is blocked and why.

Do not claim COMPLETE unless all required validation checks pass.