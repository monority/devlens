# DevLens — Step 54 — Scan Creation → First Result UX

## Context

Steps 44–53 are complete.

Current product surfaces:

- `/` — Home Dashboard
- `/scans/new` — scan creation form
- `/scans` — scan history + filtering + comparison
- `/scans/{id}` — detailed scan result
- `/scans/compare` — scan comparison
- `/technologies` — technology catalog
- `/technologies/{id}` — technology detail + real detected scans
- global navigation across the application

Latest validated state:

- 1625 Vitest tests passed
- 18 skipped
- TypeScript passes
- ESLint passes
- Prettier passes
- Next build passes
- madge reports no circular dependencies

## Objective

Improve the complete "create a scan and reach its result" user journey.

The product already has:

`/scans/new`
→ scan creation
→ `/scans/{id}`
→ result

Do not assume this journey is already coherent.

Inspect the actual implementation and make the smallest meaningful product improvement necessary so that a user can clearly understand:

1. what they are submitting;
2. what happens after submission;
3. where they are taken;
4. how to recognize the resulting scan state;
5. how to return to scan history or create another scan.

This is a product UX increment, not a rewrite of scan execution.

---

# Step 0 — Inspect first

Inspect:

- `/scans/new/page.tsx`
- `ScanForm`
- related form components/styles/tests
- scan creation API route
- scan creation handler
- `executeScan`
- scan detail page
- scan polling behavior if present
- existing scan status UI
- existing navigation
- existing `ScanCard`
- existing contextual navigation

Trace the real flow from form submission to final scan detail.

Do not infer behavior from filenames.

---

# Required outcome

After inspection, improve the journey where the current implementation has the clearest UX gap.

The resulting flow should make the following states understandable:

## A. Before submission

The user should clearly understand:

- this creates a website scan
- what input is required
- what valid input looks like
- what action submits the scan

Do not over-explain the crawler or detection engine.

---

## B. During creation / processing

If the existing architecture creates a pending/running scan and redirects to its detail page:

The detail page should clearly communicate that the scan is processing.

Use the existing domain statuses.

Do NOT invent new statuses.

Do NOT fake progress percentages.

Do NOT create fake progress bars.

Do NOT claim a scan is complete before it is complete.

If polling already exists, preserve it.

If polling is missing but the current architecture genuinely requires it for a coherent user journey, implement only the smallest deterministic polling behavior necessary.

Do not build a websocket system or real-time infrastructure.

---

## C. After completion

The user should clearly understand that the scan completed and that useful results are available.

Reuse existing:

- ScanOverview
- ScanInsights
- DetectionList
- DetectionCoverage
- evidence UI
- existing scan status components

Do not duplicate result logic.

---

## D. After failure

If a scan fails:

- show the existing failure state clearly
- expose the existing error information appropriately
- provide a clear path back to scan history
- provide a clear path to start another scan

Do not invent recovery mechanisms that the backend does not support.

Do not silently swallow the error.

---

# Navigation / actions

The scan creation and result journey should provide sensible contextual actions.

At minimum, determine whether the appropriate pages already expose:

- Back to scan history
- Create another scan
- View scan details/result

Use existing routes.

Do not duplicate the global navigation from Step 52.

Global navigation and contextual actions serve different purposes.

---

# Form behavior

Inspect the existing validation carefully.

Preserve all current valid behavior.

If the form currently accepts a URL:

- preserve the existing normalization/validation semantics
- do not create a second URL parser
- do not change domain validation rules unless a concrete bug is discovered

If invalid input is rejected:

- make the error understandable
- keep the user on the form
- do not lose their input unnecessarily

Do not expand the feature into batch scanning, authentication, saved targets, or scheduling.

---

# Error handling

Inspect all existing failure paths:

- invalid input
- API failure
- scan execution failure
- missing scan
- unexpected server error

Improve presentation only where needed.

Do not change domain failure semantics.

Do not expose stack traces or internal implementation details to the user.

---

# Tests

Add focused tests for the actual gap discovered during inspection.

At minimum, ensure coverage for:

1. valid scan creation flow
2. invalid form input
3. submission state / disabled action if applicable
4. successful redirect/navigation to the scan result
5. processing state if applicable
6. completed result state
7. failed scan state
8. contextual navigation back to scans
9. create-another-scan path if implemented
10. no fake progress/status information

Do not test implementation details unnecessarily.

If the existing architecture already correctly handles some of these states, preserve those tests rather than rewriting them.

---

# Architecture constraints

This step MUST NOT redesign:

- `@devlens/core`
- detector pipeline
- crawler
- scoring
- comparison
- technology catalog
- persistence schema
- scan execution algorithm

Do not add:

- WebSockets
- background job infrastructure
- authentication
- analytics
- batch scans
- scheduling
- saved scan targets
- notifications
- new external dependencies

Only improve the existing creation → result journey.

---

# Important implementation rule

Do not automatically implement every possible improvement listed above.

First inspect the real flow.

Then identify the smallest set of changes that produces a materially better end-to-end experience.

Avoid speculative refactoring.

Avoid changing code that already works correctly.

---

# Validation

Run:

1. targeted tests for the affected scan creation/result components
2. full Vitest suite
3. `tsc --noEmit`
4. ESLint
5. Prettier
6. `next build`
7. madge circular dependency check

Verify manually or through existing tests:

`/scans/new`
→ submit valid target
→ resulting scan page
→ processing/completed/failed state as applicable
→ contextual navigation

---

# Final report

Report:

## Inspection findings

- actual current creation flow
- actual redirect behavior
- existing processing/polling behavior
- existing error behavior
- concrete UX gap identified

## Implementation

- files changed
- exact user-flow improvement
- reused components/helpers
- whether polling was modified

## Tests

- new/updated tests
- full suite result

## Validation

- TypeScript
- ESLint
- Prettier
- build
- madge

## Scope

Explicitly confirm that domain, crawler, detectors, scoring, comparison, technology semantics, and persistence were not changed.

Do NOT proceed automatically to Step 55.