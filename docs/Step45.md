# DevLens — Step 45 — Comparison UX Audit ONLY

## Context

Step 44 is COMPLETE.

It introduced the first real user-facing entry point to scan comparison:

- `ScanComparisonSelector`
- dual scan selection
- explicit Previous / Current selection
- `/scans/compare?left=...&right=...`
- existing `compareScans()` / `ScanComparison` / comparison route remain untouched
- 1556 tests passed, 18 skipped
- typecheck, ESLint, Prettier, build and circular-dependency checks all pass

Do NOT implement anything yet.

This step is an AUDIT ONLY.

## Objective

Audit the current `/scans/compare` experience and determine the smallest coherent Step 45 implementation that would make scan comparison understandable as a real DevLens product surface.

The goal is NOT to redesign the comparison engine.

The existing domain/comparison semantics are the source of truth.

## Rules

1. Do NOT modify files.
2. Do NOT create files.
3. Do NOT refactor existing comparison logic.
4. Do NOT change domain models.
5. Do NOT change persistence.
6. Do NOT change API contracts.
7. Do NOT change `compareScans()`.
8. Do NOT change evidence identity or scoring.
9. Do NOT change the Step 44 selector.
10. Inspect the existing implementation before making any recommendation.
11. Run existing relevant tests if useful, but do not modify them.
12. Keep the audit focused on the next smallest useful product increment.

## Inspect

Start from the actual repository state.

Inspect at minimum:

- `/scans/compare` page/route
- `ScanComparison`
- comparison domain types
- `compareScans()`
- existing comparison tests
- comparison CSS/module styles
- any existing shared UI components used by the comparison page
- scan metadata models already available
- existing detection/evidence presentation components that could be reused

Search the repository before proposing new abstractions.

## Questions to answer

### 1. Current UX

Describe exactly what a user currently sees after navigating to:

`/scans/compare?left=<scanA>&right=<scanB>`

Identify:

- page structure
- headings
- scan metadata
- technology comparison
- evidence/detection information
- empty states
- invalid query-param behavior
- missing scan behavior
- loading/error behavior if applicable
- responsive behavior

Do not infer anything that is not present in the repository.

### 2. Existing comparison model

Document the actual shape produced by `compareScans()`.

Explain:

- what constitutes a comparison
- how technologies are classified
- how changes are represented
- how detections/evidence are exposed
- whether ordering is deterministic
- whether the current model already contains enough information for a good UI

Do not propose changing the model unless absolutely necessary.

### 3. Existing UI reuse

Find components that could already display:

- technologies
- detections
- evidence
- scan metadata
- status
- confidence
- URLs/domains

Prefer reuse over creating parallel presentation systems.

### 4. Product gaps

Identify the smallest UX gaps preventing the current comparison page from feeling coherent.

Separate them into:

- MUST HAVE for Step 45
- SHOULD HAVE later
- OUT OF SCOPE

Do not create a large redesign roadmap.

### 5. Recommended Step 45 scope

Propose ONE small implementation scope.

It should preferably focus on presenting the existing comparison data better.

For example, if supported by the actual codebase:

- clear Previous / Current scan headers
- compact metadata summary
- Added / Removed / Unchanged sections
- clear empty state
- readable comparison rows
- reuse existing detection/evidence presentation

But do not assume these are needed until you inspect the code.

### 6. Tests

Identify exactly which tests should be added or updated for the proposed implementation.

Prefer:

- pure logic tests where logic is actually needed
- component tests for UI states
- existing comparison tests unchanged unless there is a genuine regression

Do not add tests merely for markup snapshots.

### 7. Validation

Define the exact validation commands that should be run after implementation:

- targeted Vitest
- full Vitest
- TypeScript
- ESLint
- Prettier
- Next build
- circular dependency check if applicable

## Required output

Return a concise but concrete audit report:

# Step 45 Audit

## Current state
...

## Existing comparison model
...

## Existing reusable UI
...

## UX gaps
### MUST
...
### SHOULD
...
### OUT OF SCOPE
...

## Proposed Step 45
...

## Files likely to change
...

## Tests
...

## Validation
...

## Risk / compatibility
...

End with:

`READY FOR IMPLEMENTATION: YES/NO`

Do not implement anything in this step.