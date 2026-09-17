# DevLens — Step 47 — Technology Change Explainability Audit ONLY

## Context

Step 46 is COMPLETE.

The comparison page now provides:

- one page-level H1
- Previous / Current comparison headers
- existing `ScanOverview` on both sides
- technology/evidence/confidence metrics
- `ComparisonSummary`
- back-to-history navigation

Current validation:

- 1568 tests passed
- 18 skipped
- TypeScript: 0 errors
- ESLint: 0 errors
- Prettier: pass
- Next build: pass
- circular dependencies: none

Comparison semantics remain untouched.

## Objective

Audit the CURRENT technology-change presentation on `/scans/compare`.

This is an AUDIT ONLY.

Do not modify source code.

The objective is to determine whether a user can understand:

1. which technologies were added
2. which technologies were removed
3. which technologies changed confidence/score
4. which technologies changed evidence
5. why DevLens considers something changed
6. what evidence supports the change

The comparison engine is the source of truth.

Do not propose changing its semantics unless the audit discovers an actual missing capability that cannot be represented by the existing result.

---

## Rules

1. Do NOT modify files.
2. Do NOT create files.
3. Do NOT refactor.
4. Do NOT modify `compareScans()`.
5. Do NOT modify `ComparisonResult`.
6. Do NOT modify evidence identity.
7. Do NOT modify scoring.
8. Do NOT modify persistence.
9. Do NOT modify API contracts.
10. Do NOT modify Step 44/46 behavior.
11. Inspect existing components before proposing new ones.
12. Prefer reuse of existing detection/evidence UI.
13. Do not design a new system if existing data already supports the requirement.

---

# Inspect

Inspect the actual implementation of:

- `ScanComparison`
- technology change sections
- `ComparisonResult`
- comparison types
- `compareScans()`
- evidence identity
- detection models
- evidence models
- existing:
  - `DetectionList`
  - `DetectionItem`
  - `EvidenceList`
  - `EvidenceItem`
  - `DetectionCoverage`
  - `ScanInsights`
- relevant CSS
- tests covering comparison changes
- scan detail presentation components

Search the repository for existing technology/detection/evidence presentation patterns before proposing anything new.

---

# Audit questions

## 1. Added technologies

For an added technology, determine exactly what the UI currently shows.

Can the user identify:

- technology name
- confidence
- detection method/source
- supporting evidence
- relevant URL/resource/header/script/etc.

If information exists in `ComparisonResult` but is hidden from the UI, explicitly identify it.

---

## 2. Removed technologies

Perform the same audit for removed technologies.

Pay particular attention to whether the UI makes the distinction between:

- technology absent from the current scan
- technology actually contradicted by new evidence

Do not change semantics; only document what the current model/UI communicates.

---

## 3. Score changes

Inspect exactly how score changes are currently rendered.

Determine whether the UI communicates:

- previous score
- current score
- direction
- magnitude
- confidence context

Verify that displayed values come from the existing comparison result.

---

## 4. Evidence changes

Determine what the user actually sees when evidence changes.

Can they answer:

> "What changed in the evidence?"

If the underlying evidence objects already contain enough information, identify the reusable presentation path.

Do not invent an evidence-diff algorithm.

---

## 5. Unchanged technologies

Determine whether unchanged technologies are:

- shown
- hidden
- summarized
- accessible elsewhere

Evaluate whether that is intentional and consistent with the existing product direction.

Do not assume unchanged items need to be added.

---

## 6. Explainability

For every visible change category, document the path:

`ComparisonResult → component → displayed information`

Identify any information loss along that path.

---

## 7. Existing reusable UI

Identify existing components that can improve explainability without creating duplicate presentation systems.

Especially inspect:

- `DetectionItem`
- `DetectionList`
- `EvidenceItem`
- `EvidenceList`
- `ScanInsights`
- existing technology cards/rows

---

# Product gap classification

Classify findings into exactly:

### MUST HAVE

Changes required for a user to understand the existing comparison result.

### SHOULD HAVE

Useful improvements that can wait.

### OUT OF SCOPE

Anything that would require:

- new comparison semantics
- new backend data
- new persistence
- a new evidence-diff engine
- speculative product features

Keep this classification small.

---

# Proposed next increment

If a coherent implementation is justified, propose ONE Step 48 scope.

The scope must:

- be presentation-focused
- reuse existing data
- reuse existing components where possible
- preserve comparison semantics
- have clear acceptance criteria
- have focused tests

Do not propose multiple competing implementations.

---

# Required output

Return:

# Step 47 Audit

## Current technology-change UX
...

## Added technologies
...

## Removed technologies
...

## Score changes
...

## Evidence changes
...

## Unchanged technologies
...

## Explainability gaps
...

## Existing reusable UI
...

## MUST HAVE
...

## SHOULD HAVE
...

## OUT OF SCOPE
...

## Proposed Step 48
...

## Files likely to change
...

## Tests
...

## Validation
...

## Risk
...

End with:

`READY FOR IMPLEMENTATION: YES/NO`

Do not implement anything.