# DevLens — Step 41 : Detection Explainability

## Context

Steps 38 and 40 are complete.

Current state:

* `ScanDetectionResults` provides deterministic, deduplicated detection presentation.
* `DetectionCoverage` provides deduplicated evidence coverage information.
* Detection evidence already has a canonical identity through `evidenceIdentity`.
* Detection confidence already exists.
* Existing explanation helpers already exist in the project and must be reused where appropriate.
* The current test suite is green:

  * 1497 tests passed
  * 18 skipped
  * typecheck PASS
  * ESLint PASS
  * Prettier PASS
  * build PASS
  * circular dependencies PASS
  * `jsx: "preserve"` intact.

Do not undo Steps 38 or 40.

---

# Objective

Make the Scan Detail detection results more explainable.

A user looking at:

```text
Technology: WordPress
Confidence: 85%
```

should be able to understand:

```text
Why was WordPress detected?

Evidence
- robots.txt matched WordPress signature
- HTML resource matched WordPress pattern
- /wp-content/... resource observed
```

The exact evidence must come from the existing detection model.

This step is about **presentation and explainability**, not detection.

---

# Core rule

The explainability layer must be pure.

Conceptually:

```text
Detection
    ↓
Existing evidence
    ↓
Existing confidence
    ↓
Explainability model
    ↓
Presentation
```

Never:

```text
Detection
    ↓
Explainability
    ↓
NEW DETECTION LOGIC
```

No new detector should be introduced.

---

# Step 1 — Audit existing explanation infrastructure

Before coding, inspect:

* `getDetectionExplanation()`
* `evidenceTypeLabel()`
* `evidenceFields()`
* `evidenceIdentity`
* existing `DetectionItem`
* existing `EvidenceList`
* existing `EvidenceItem`
* existing confidence presentation
* existing tests.

Determine whether the existing helpers already provide enough information.

Reuse them rather than reimplementing their semantics.

If an existing module already exposes a suitable model, extend it only if necessary.

---

# Step 2 — Define the explainability model

Create or refine a pure model similar to:

```ts
type DetectionExplainability = {
  summary: string
  confidence: number
  evidence: Array<{
    type: string
    label: string
    description: string
    identity: string
  }>
}
```

Do not copy this blindly.

Adapt the exact shape to the repository's existing domain types.

Requirements:

* deterministic;
* derived only from the detection;
* no mutation;
* no network access;
* no database access;
* no React dependency;
* no renderer dependency.

The `identity` must use the existing canonical evidence identity.

---

# Step 3 — Evidence descriptions

Evidence descriptions must be generated exclusively from fields that actually exist.

Examples:

```text
Header
→ Server header matched nginx

Script URL
→ Script URL matched WordPress signature

Resource
→ Resource URL matched WordPress signature
```

Do not invent:

* URLs;
* headers;
* detector names;
* confidence reasons;
* timestamps;
* sources;
* network requests.

If an evidence type cannot be described safely from its existing fields, use its existing generic representation instead of fabricating a description.

---

# Step 4 — Determinism

Explainability output must be deterministic.

Use the same ordering principles already established by Step 38.

For evidence:

```text
type label ASC
→ canonical evidence identity ASC
```

If the existing canonical presentation helper already defines this ordering, reuse it.

Equivalent input ordering must always produce equivalent output ordering.

---

# Step 5 — Deduplication

Do not display duplicate evidence.

Reuse:

```text
evidenceIdentity
```

from the existing implementation.

Do not create a second identity algorithm.

The following must produce the same logical evidence:

```text
Evidence A
Evidence A
Evidence A
```

→ one displayed evidence item.

---

# Step 6 — Integrate with DetectionItem

Inspect the current `DetectionItem`.

Add explainability only if it improves the existing detection presentation without duplicating the entire evidence UI.

Preferred conceptual hierarchy:

```text
DetectionItem
├── Technology
├── Confidence
├── Explanation summary
└── Evidence
```

Do not create another large card/dashboard.

Do not replace `EvidenceList` unless there is a concrete architectural reason.

Prefer composition:

```text
DetectionItem
  ↓
existing explanation
  ↓
existing EvidenceList
```

---

# Step 7 — UI requirements

The UI must remain:

* compact;
* readable;
* accessible;
* deterministic;
* consistent with the existing Scan Detail design.

Avoid:

* giant panels;
* duplicated evidence;
* redundant metrics;
* decorative charts;
* new icons without semantic value;
* animations;
* new dashboard sections.

The user should understand the causal relationship:

```text
Detection
    ↓
Evidence
    ↓
Reason
```

within the existing Scan Detail hierarchy.

---

# Step 8 — Accessibility

Ensure:

* semantic headings where appropriate;
* evidence remains readable without color;
* confidence is not communicated only through color;
* lists use appropriate list semantics;
* no information is hidden exclusively behind hover;
* keyboard users can access all relevant information.

Do not add an accessibility framework.

Use existing project conventions.

---

# Step 9 — Tests

Add focused tests for the pure explainability module.

At minimum cover:

1. empty evidence;
2. single evidence;
3. multiple evidence types;
4. duplicate evidence;
5. deterministic ordering;
6. canonical identity reuse;
7. summary generation;
8. confidence preservation;
9. exact preservation of existing evidence values;
10. immutability;
11. unknown/unsupported evidence fields;
12. integration with `DetectionItem`.

Do not weaken existing tests.

Do not snapshot large unrelated components unless the repository already uses that pattern.

---

# Step 10 — Scope restrictions

Do NOT:

* modify detection algorithms;
* modify detector scoring;
* modify confidence calculation;
* add new detectors;
* add network requests;
* add database queries;
* change crawler behavior;
* add a new state management library;
* add a new UI framework;
* introduce hooks unnecessarily;
* make the component `'use client'` unless strictly required;
* duplicate `evidenceIdentity`;
* duplicate `evidenceTypeLabel`;
* duplicate `evidenceFields`;
* duplicate `getDetectionExplanation()` semantics.

This is an explainability/presentation step.

---

# Step 11 — Validation

Run the repository's standard validation suite.

At minimum:

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

remains intact.

All existing tests must remain green.

---

# Step 12 — Completion report

Report:

## Status

`COMPLETE` / `PARTIAL` / `BLOCKED`

## Implementation

List:

* new modules;
* modified modules;
* integration points.

## Explainability contract

Document:

* summary semantics;
* confidence semantics;
* evidence semantics;
* ordering;
* deduplication.

## Tests

Report:

* new tests;
* total tests;
* skipped tests.

## Validation

Report exact results for:

* typecheck;
* tests;
* lint;
* formatting;
* build;
* circular dependencies.

## Architecture

Explain briefly:

```text
Detection
   ↓
Explainability
   ↓
Existing Evidence Presentation
```

and confirm that detection logic was not modified.

## Git

Report commit hash if committed.

Do not push if credentials are unavailable.

---

# Definition of Done

Step 41 is complete only when:

* explainability is derived exclusively from existing detection data;
* no detector behavior changed;
* no confidence calculation changed;
* evidence uses the existing canonical identity;
* duplicate evidence is removed;
* ordering is deterministic;
* existing evidence presentation remains reusable;
* accessibility is preserved;
* tests cover the pure transformation;
* all existing validation passes.

---

# Recommendation

If complete:

> **Recommended next step: inspect the Scan Detail information architecture before adding another presentation module.**

Do not automatically implement another metrics/coverage component.
