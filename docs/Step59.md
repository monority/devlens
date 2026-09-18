# DevLens — Step 59: Detection Evidence Traceability

## Context

Step 58 — Compare Scans from History is COMPLETE.

Verified state:

- Re-scan creates a new scan.
- Scan history is deterministic and exposes same-target context.
- Two scans can be compared through `/scans/compare?left=<id>&right=<id>`.
- Comparison supports same and different targets.
- Invalid/missing scan IDs are handled safely.
- 1697 Vitest tests pass, 18 skipped.
- tsc, ESLint, Prettier, next build and madge all pass.
- No architectural changes were required in Step 58.

The next increment is to improve the quality and explainability of scan results.

DevLens already has a detection/evidence model. The objective is to expose that existing information clearly in the UI.

Do NOT create a new detection engine.

Do NOT change detector behavior.

Do NOT invent evidence that does not exist.

---

# Step 0 — Inspect before editing

Inspect the actual repository implementation of:

- `Detection`
- `Evidence`
- `Technology`
- detection scoring
- `DetectionItem`
- `DetectionList`
- `ScanDetailView`
- technology detail pages
- existing evidence-related UI
- detector implementations
- evidence key/canonicalization utilities
- existing tests

Answer:

1. What exact fields exist on a Detection?
2. What exact fields exist on Evidence?
3. How are evidence types represented?
4. Is evidence already persisted in the scan result?
5. Does the API already return evidence to the frontend?
6. Does `DetectionItem` currently expose evidence?
7. Is there already a utility for evidence formatting/grouping?
8. Can the UI expose evidence without modifying the scan engine or persistence?

Do not implement anything until these questions are answered from the repository.

---

# Goal

For every detected technology, allow the user to understand:

- that the technology was detected;
- how confident the detection is;
- what evidence supports it;
- where that evidence came from.

The result should remain compact and readable.

This is an observability/explainability feature, not a visual redesign.

---

# 1. Detection evidence in Scan Detail

Inspect the current Scan Detail technology list.

For each detected technology, expose a lightweight evidence summary.

Examples of useful information, depending on the actual domain model:

- evidence type;
- evidence source;
- matched header;
- script URL;
- resource URL;
- link/host evidence;
- evidence count.

Only expose fields that actually exist.

Do not fabricate human-readable explanations when the domain does not provide enough information.

---

# 2. Evidence expansion

If a detection has multiple pieces of evidence, use a compact expandable interaction.

For example:

`3 pieces of evidence`

→ expand

→ evidence rows

The exact presentation should follow the existing DevLens visual language.

Requirements:

- collapsed by default;
- no giant cards;
- no unnecessary modal;
- no new design system;
- all evidence remains accessible;
- long URLs/values must not break the layout.

If the existing application already has an evidence disclosure component, reuse it.

---

# 3. Evidence formatting

Create a presentation-layer formatter only if one does not already exist.

The formatter must:

- preserve the original evidence;
- never mutate domain objects;
- handle missing/optional values safely;
- produce deterministic output;
- avoid leaking internal implementation details unnecessarily.

Do NOT put UI-specific formatting logic into the core detection domain.

---

# 4. Evidence ordering

Evidence must have deterministic ordering.

Prefer existing evidence ordering if already defined.

Otherwise derive a stable presentation order from existing fields.

Possible ordering dimensions:

1. evidence type;
2. canonical evidence key;
3. stable source/value.

Do not rely on object insertion order or database incidental ordering.

Do not change the domain's semantic ordering if one already exists.

---

# 5. Score/context

Inspect how confidence scores are currently displayed.

If the UI already exposes:

- score;
- confidence;
- evidence count;

preserve it.

If evidence makes the score easier to understand, add only a concise contextual relationship such as:

`Confidence: 85 · 3 evidence`

Do NOT invent a new scoring formula.

Do NOT change `ConfidenceScorer`.

Do NOT recalculate scores in the UI.

---

# 6. Technology detail page

Inspect the existing technology detail page.

If it already has scan-specific detections/evidence, reuse the same representation.

Do not create two incompatible evidence presentations.

If the technology detail page does not have scan evidence, do not force it into this step unless the existing data flow makes it trivial and architecturally consistent.

Prefer one canonical evidence presentation component.

---

# 7. API/domain boundaries

Keep responsibilities clean:

- detector → produces domain evidence;
- core/domain → stores evidence and scoring;
- API → serializes existing scan result;
- presentation layer → formats evidence for humans.

Do not move presentation concerns into `@devlens/core`.

Do not add a new API endpoint.

Do not add database tables.

Do not duplicate evidence.

---

# 8. Accessibility

Evidence disclosure must support:

- keyboard interaction;
- visible `:focus-visible`;
- semantic button/disclosure behavior;
- `aria-expanded`;
- an accessible relationship between trigger and content;
- meaningful labels.

Do not rely only on icons.

---

# 9. Tests

Add focused tests for:

### Evidence rendering

1. detection without evidence;
2. detection with one evidence item;
3. detection with multiple evidence items;
4. evidence expansion;
5. evidence collapse;
6. evidence type/source display;
7. long evidence values remain safely rendered.

### Determinism

8. evidence ordering is deterministic;
9. duplicate evidence behavior follows the existing domain contract.

### Safety

10. optional/missing evidence fields do not crash rendering.

### Regression

11. existing detection links remain functional;
12. scan detail technology list remains intact;
13. comparison behavior remains unchanged;
14. Step 56 Re-scan remains unchanged.

Do not test hypothetical fields or behavior that the repository does not actually implement.

---

# 10. Scope

## IN SCOPE

- exposing existing detection evidence;
- compact evidence disclosure;
- deterministic evidence presentation;
- evidence formatting at the UI boundary;
- accessibility;
- focused tests.

## OUT OF SCOPE

- new detectors;
- detector accuracy changes;
- new evidence types;
- new scoring algorithms;
- confidence formula changes;
- crawler changes;
- database schema changes;
- new API endpoints;
- scan comparison redesign;
- analytics;
- historical trend charts;
- authentication;
- redesign of Scan Detail.

Do not proceed to Step 60 automatically.

---

# Validation

Run:

1. focused evidence/detection tests;
2. full Vitest;
3. TypeScript;
4. ESLint;
5. Prettier;
6. next build;
7. madge/circular dependency check.

No regressions are acceptable.

---

# Final report

Return:

1. STATUS
2. Commit
3. Step 0 findings
4. Actual Detection/Evidence data model
5. Existing evidence flow
6. Files changed
7. Evidence presentation implementation
8. Deterministic ordering implementation
9. Accessibility implementation
10. Tests added
11. Full validation results
12. Confirmation that no detector/scoring/domain semantics were changed
13. Confirmation that Steps 56–58 remain intact
14. Any architectural issue discovered
15. Scope confirmation

Do not implement the next step automatically.