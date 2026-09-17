# DevLens — Step 48 — Technology Change Explainability

## Context

Step 47 audit is COMPLETE.

Commit:
`504e00e` — "Step 47: Technology Change Explainability Audit"

The audit found a concrete presentation gap:

For ADDED and REMOVED technologies, `ComparisonResult` already contains:

- confidence
- complete detection data
- complete evidence
- technology identity

But `TechnologyComparisonItem` currently renders only:

- technology name
- category
- added/removed status

Confidence and supporting evidence are therefore hidden.

Existing reusable infrastructure already exists:

- `DetectionItem`
- `EvidenceList`
- `EvidenceItem`
- `getDetectionExplainability()`
- `isKnownTechnology()`
- technology catalog
- existing scan-detail presentation patterns

The comparison engine is already sufficient.

## Objective

Improve the comparison page so that ADDED and REMOVED technologies are explainable using the data that already exists.

This is a PRESENTATION-ONLY step.

Do not modify comparison semantics.

---

# Required implementation

## 1. Added technologies

For every added technology:

Show:

- technology name
- category
- current/right confidence
- supporting evidence

The evidence must come from the corresponding detection in:

`result.right.detections`

Match by the existing canonical technology identity used by the comparison model.

Do not invent a second identity mechanism.

---

## 2. Removed technologies

For every removed technology:

Show:

- technology name
- category
- previous/left confidence
- supporting evidence

Evidence must come from:

`result.left.detections`

Again, reuse the existing detection identity.

---

## 3. Explainability

Reuse existing explainability infrastructure where practical.

Prefer:

`getDetectionExplainability()`

for the human-readable detection summary/origin.

Example conceptual output:

    WordPress
    Removed
    Confidence: 92%

    Detected from HTTP header
    Evidence
      Server: nginx
      URL: https://example.com/

Do not fabricate explanations.

Only render information produced from actual detection/evidence data.

If `getDetectionExplainability()` does not fit the existing comparison component cleanly, reuse its underlying existing helpers rather than duplicating explanation logic.

---

## 4. Evidence rendering

Reuse existing:

- `EvidenceList`
- `EvidenceItem`

where compatible.

Do not create a parallel evidence presentation system.

Preserve existing evidence fields and URLs.

Evidence should remain accessible/collapsible if the existing component supports that behavior.

---

## 5. Technology links

If the technology is known to the existing technology catalog, make its name link to the existing technology detail route.

Reuse:

`isKnownTechnology()`

and the existing route convention.

Unknown technologies must remain plain text.

Do not invent routes.

---

## 6. Existing score-change behavior

Do NOT regress the existing score-change presentation.

For technologies where both sides exist:

- previous confidence remains visible
- current confidence remains visible
- score delta remains visible
- existing direction indicator remains intact

Do not replace the current score-change table with the new added/removed presentation.

---

## 7. Evidence changes

Do NOT redesign `evidenceChanges[]` in this step.

Keep the existing evidence-change presentation working.

Do not introduce a new evidence-diff algorithm.

---

# Scope discipline

Do NOT modify:

- `compareScans()`
- `ComparisonResult`
- comparison types
- evidence identity
- scoring
- persistence
- crawler
- API
- Step 44 selector
- Step 46 scan overview
- scan detail behavior

Do not add dependencies.

Do not introduce state management.

Do not create a generic abstraction unless it is genuinely reusable and already justified by the codebase.

Prefer a small helper inside the comparison component or an existing utility.

---

# UX requirements

Added and removed sections must make the difference immediately understandable.

A user should be able to answer:

> What technology appeared/disappeared?

> How confident was DevLens?

> What evidence caused that detection?

The UI should remain compact.

Do not turn every technology row into a huge card.

Use existing DevLens visual language.

Avoid:

- gradients
- excessive cards
- decorative UI
- duplicated information
- unnecessary animations

---

# Tests

Update the existing comparison tests.

Add focused tests for:

### Added technology

- renders technology name
- renders category
- renders confidence
- renders supporting evidence
- renders explainability/origin when available
- known technology uses the existing technology link

### Removed technology

- renders technology name
- renders category
- renders confidence
- renders supporting evidence
- renders explainability/origin when available
- known technology uses the existing technology link

### Edge cases

- detection missing from the source scan → comparison still renders safely
- technology without evidence → no crash / sensible empty state
- unknown technology → no invalid technology link

### Regression

Verify existing:

- score changes
- evidence changes
- zero-change state
- comparison summary
- Previous / Current overview
- back-to-history navigation

remain intact.

Do not snapshot the entire component unless existing tests already use snapshots.

---

# Validation

Run:

1. targeted `ScanComparison.test.tsx`
2. relevant explainability/evidence tests
3. full `vitest run`
4. `tsc --noEmit`
5. ESLint
6. Prettier
7. `next build`
8. circular dependency check

---

# Acceptance criteria

Step 48 is complete when:

- [ ] Added technologies show confidence
- [ ] Added technologies show supporting evidence
- [ ] Removed technologies show confidence
- [ ] Removed technologies show supporting evidence
- [ ] Existing explainability infrastructure is reused where appropriate
- [ ] Known technologies link to their existing detail route
- [ ] Unknown technologies remain safe/plain
- [ ] Existing score-change UI is unchanged
- [ ] Existing evidence-change UI is unchanged
- [ ] Missing detection/evidence is handled safely
- [ ] No comparison-engine code changed
- [ ] No API/domain/persistence changes
- [ ] tests cover the new behavior
- [ ] all previous tests remain green
- [ ] typecheck passes
- [ ] ESLint passes
- [ ] Prettier passes
- [ ] production build passes
- [ ] no circular dependencies

---

# Final report

Return:

## Step 48 — COMPLETE

### Implementation
...

### Added technologies
...

### Removed technologies
...

### Reuse
...

### Comparison semantics
Explicitly confirm unchanged.

### Tests
...

### Validation
...

### Files changed
...

### Scope
Explicitly list major systems not modified.

Do not proceed to another step automatically.