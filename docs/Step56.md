# DevLens — Step 56 — Re-scan Same Target

## Context

Steps 44–55 are complete.

Current product surfaces:

- `/` — Home Dashboard
- `/scans/new` — scan creation
- `/scans` — scan history + filtering + comparison
- `/scans/{id}` — scan result
- `/scans/compare` — scan comparison
- `/technologies` — technology catalog
- `/technologies/{id}` — technology detail + detected scans
- Global application navigation
- Scan Detail technology links already connect to Technology Detail
- Technology Detail already connects back to matching scans

Latest validated state:

- 1637 Vitest tests passed
- 18 skipped
- TypeScript passes
- ESLint passes
- Prettier passes
- Next build passes
- madge reports no circular dependencies

## Objective

Add a direct "Re-scan" action to a completed or failed scan so the user can create a new scan for the same target without manually copying/retyping the URL.

Desired flow:

`/scans/{id}`
→ `Re-scan`
→ `/scans/new?target=<existing-target>`
→ existing scan form prefilled
→ user confirms
→ new scan
→ new `/scans/{newId}` result

This should reuse the existing scan creation flow.

Do NOT create a separate scan execution path.

---

# Step 0 — Inspect first

Inspect:

- `ScanDetailView`
- `/scans/[id]/page.tsx`
- `/scans/new/page.tsx`
- `ScanForm`
- scan form validation
- existing query/search parameter handling
- POST `/api/scans`
- existing URL normalization
- current contextual actions
- current tests

Determine:

1. how the target URL is represented in the scan response;
2. whether `ScanForm` already supports an initial/default target;
3. whether `/scans/new` already reads query parameters;
4. whether the existing form can safely be extended with an initial target.

Do not assume any of these.

---

# Required behavior

## 1. Re-scan action

Add a contextual action on the scan detail page:

"Re-scan" or "Scan again"

It should be visible for scans where the existing scan response contains a usable target.

Do not create a new backend endpoint.

Do not execute the scan directly from the detail page.

The action should navigate to the existing `/scans/new` flow.

---

## 2. Preserve the existing target

Pass the existing target to the new-scan page using the smallest appropriate mechanism.

Prefer a URL query parameter if consistent with the current App Router architecture.

Example concept:

`/scans/new?target=https%3A%2F%2Fexample.com`

Do not put arbitrary scan data into the URL.

Only the target necessary to initialize the existing form should be passed.

---

## 3. Prefill, don't auto-submit

This is important.

Opening "Re-scan" must:

- open `/scans/new`
- prefill the target
- NOT automatically submit
- NOT automatically create a scan

The user must explicitly confirm the new scan.

This prevents accidental duplicate scans.

---

## 4. Existing form behavior

Preserve all existing `ScanForm` behavior:

- validation
- normalization
- submission
- loading/submission state
- error handling
- redirect behavior

If the target query parameter is invalid or absent:

- preserve the existing empty-form behavior
- do not bypass validation
- do not crash

Do not create a second URL validation implementation.

---

# Target encoding / security

Use proper URL encoding through the existing framework/API.

Do not manually concatenate an unsafe query string.

Do not trust the query parameter as already validated.

The form's existing validation must remain authoritative.

Do not add new security rules unless the existing implementation requires them.

---

# Where to expose the action

Place the re-scan action in the existing contextual action area of the scan detail page.

Do not duplicate:

- GlobalNav
- scan history navigation
- existing "New scan" action

The distinction should be clear:

- **New scan** → start from a blank target
- **Re-scan** → start with this scan's target prefilled

If the current UI already has a suitable action group, extend it rather than creating another unrelated toolbar.

---

# Failed scans

Determine whether a failed scan still contains a valid target.

If yes, allow re-scan.

If the existing domain/API semantics make the target unavailable, do not fabricate it.

Do not add special retry semantics to the backend.

"Re-scan" always means creating a NEW scan through the normal creation flow.

It must not mutate or retry the existing scan.

---

# Accessibility

The action must:

- be a normal keyboard-accessible link
- have meaningful text
- have visible `:focus-visible` state
- not rely only on color
- preserve the existing heading hierarchy

Follow the existing DevLens styling conventions.

---

# Tests

Add focused tests covering:

1. re-scan action is rendered when a usable target exists
2. re-scan points to `/scans/new`
3. target is correctly URL-encoded
4. target value is preserved
5. missing target does not create a broken re-scan URL
6. `/scans/new` reads the target query parameter
7. existing target is used as the form initial value
8. absent query parameter keeps existing empty-form behavior
9. query parameter does not auto-submit the form
10. existing validation remains authoritative
11. scan detail existing navigation remains intact
12. failed scan behavior follows actual target availability semantics

Prefer pure helper tests for URL construction if useful.

Do not make tests depend on exact CSS implementation.

---

# Architecture constraints

This step MUST NOT modify:

- `@devlens/core`
- detector logic
- crawler
- scoring
- evidence generation
- comparison engine
- persistence schema
- scan execution
- POST `/api/scans` contract

Do not add:

- retry endpoints
- background jobs
- automatic rescan
- scheduled scans
- batch scanning
- authentication
- analytics
- new dependencies

There must remain exactly one scan creation path.

---

# Important implementation rule

Do not automatically add the action everywhere.

The primary required location is:

`/scans/{id}`

Do not add a second "Re-scan" button to every `ScanCard`, scan history, technology detail, or dashboard unless the existing architecture clearly demonstrates that it is necessary.

Keep this increment focused.

---

# Validation

Run:

1. targeted scan-detail tests
2. targeted ScanForm/new-scan tests
3. any new helper tests
4. full Vitest suite
5. `tsc --noEmit`
6. ESLint
7. Prettier
8. `next build`
9. madge circular dependency check

Verify the complete flow:

`existing scan`
→ `Re-scan`
→ `/scans/new?target=...`
→ target prefilled
→ explicit submit
→ new scan ID
→ `/scans/{newId}`

Do not automatically proceed to Step 57.

---

# Final report

Report:

## Inspection

- how the existing form initializes its target
- how the existing scan creation flow works
- where the re-scan action was placed

## Implementation

- files changed
- URL/query strategy
- form initialization
- confirmation behavior
- failed-scan behavior

## Tests

- new tests
- updated tests
- full suite count

## Validation

- TypeScript
- ESLint
- Prettier
- build
- madge

## Scope

Explicitly confirm that scan execution, API contracts, domain logic, detectors, crawler, scoring, persistence, and comparison were untouched.

Do NOT proceed automatically to Step 57.