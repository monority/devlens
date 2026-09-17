# DevLens — Step 44 : Scan Comparison Selection UX

## Objective

Make the existing scan-to-scan comparison feature actually usable from the UI.

Step 43 established that comparison is already implemented at the domain, application and presentation levels:

* `compareScans()` exists and is tested
* `ScanComparison` exists and is tested
* `/scans/compare` exists
* comparison error/404/failed states exist
* comparison styling exists

The missing capability is the **user-facing scan selection flow**.

The user must be able to start from scan history, select two completed scans, and navigate to:

```text
/scans/compare?left=<scanId>&right=<scanId>
```

Do not rebuild comparison.

---

# 1. First inspect the existing implementation

Before modifying anything, inspect the actual repository.

At minimum inspect:

* scan history page
* scan history components
* scan listing/query logic
* scan summary/card/list item components
* `/scans/compare`
* `ScanComparison`
* `compareScans()`
* existing navigation/link patterns
* existing client/server component boundaries
* existing tests around scan history
* existing URL/query-param handling

Use the Step 43 audit as context, but verify the current code.

Do not invent a parallel scan-loading mechanism if one already exists.

---

# 2. Desired user flow

The intended flow is:

```text
Scan History
     ↓
Enable comparison
     ↓
Select completed scan A
     ↓
Select completed scan B
     ↓
Compare button becomes available
     ↓
/scans/compare?left=A&right=B
     ↓
Existing ScanComparison UI
```

The user must never need to manually construct the comparison URL.

---

# 3. Selection UX

Implement the smallest coherent selection interface that fits the existing Scan History design.

The UI must make it clear:

* which scans are selectable
* which scans are selected
* that exactly two scans are required
* which scan is the first/left comparison target
* which scan is the second/right comparison target
* when comparison can be launched

Prefer reusing the existing scan list rather than creating a second scan-history representation.

---

# 4. Completed scans only

Comparison should only be selectable for scans that can actually participate in the existing comparison domain logic.

Based on the Step 43 audit, the expected selectable state is:

```text
completed
```

Do not allow:

```text
pending
running
failed
```

unless the existing domain explicitly supports them.

Do not modify the comparison domain merely to accommodate the UI.

If the repository reveals a different established rule, preserve that rule.

---

# 5. Selection behavior

Implement deterministic selection behavior.

Recommended behavior:

### First selection

Selecting a scan sets:

```text
left = scanId
```

### Second selection

Selecting another scan sets:

```text
right = scanId
```

### Third selection

Do not silently replace an existing selection.

Provide an explicit way to:

* deselect a scan
* change one of the two selected scans

The user must remain in control of which scans are compared.

---

# 6. Same-scan protection

Do not allow:

```text
left === right
```

The comparison action must remain disabled until two distinct scans are selected.

If the existing comparison route already handles this defensively, preserve that behavior as a second line of defense.

---

# 7. Navigation

When two valid scans are selected, navigate to:

```text
/scans/compare?left=<leftScanId>&right=<rightScanId>
```

Use the existing application navigation conventions.

Do not introduce a new routing abstraction.

Do not duplicate comparison logic in the history page.

The history page should only be responsible for:

```text
selection
    ↓
navigation
```

The existing comparison route remains responsible for:

```text
query params
    ↓
loading scans
    ↓
compareScans()
    ↓
ScanComparison
```

---

# 8. Preserve the existing comparison page

Do not rewrite `/scans/compare`.

Do not modify:

* `compareScans()` semantics
* comparison domain models
* evidence identity
* detection scoring
* technology catalog
* persistence
* crawler
* scan execution

Only make changes to the comparison page if the new selection flow reveals a concrete integration issue.

If no integration change is required, leave the existing comparison implementation untouched.

---

# 9. Component architecture

Follow the existing repository conventions.

A likely shape is:

```text
ScanHistory
    ↓
ScanComparisonSelector
    ↓
selection state
    ↓
router navigation
```

But **do not create this exact structure blindly**.

Use the existing component architecture discovered during the audit.

The component should remain focused on:

* displaying selectable scans
* maintaining selection state
* validating selection
* navigating

Do not turn it into a generic selection framework.

---

# 10. Loading and data reuse

Reuse the existing scan history data.

Do not:

* create a second API call unnecessarily
* fetch every scan individually
* duplicate server queries
* add a new persistence query
* add a new endpoint

If the existing history page already receives the required scan summaries, pass them into the selector.

If the architecture requires a client/server boundary, keep the boundary as small as possible.

---

# 11. UX states

The selection UI must handle:

### No completed scans

Show an appropriate existing empty state or a minimal message.

Comparison cannot be started.

### One completed scan

Allow it to be selected but make it clear that a second scan is required.

### Two selected scans

Enable the comparison action.

### Two selected scans + action

Navigate to the comparison route.

### Deselection

Return naturally to the previous selection state.

### Invalid selection

The UI should prevent invalid navigation.

---

# 12. Accessibility

The selection mechanism must be keyboard accessible.

Ensure:

* interactive elements are actual buttons/links/controls
* visible selected state
* meaningful accessible labels
* focus states
* no interaction that relies solely on color
* comparison action has a clear disabled state when invalid

Do not introduce an accessibility framework or dependency.

---

# 13. Visual direction

Follow the existing DevLens visual language.

Do not redesign the application.

The selector should feel like part of the existing Scan History interface.

Avoid:

* giant cards
* dashboard-style redesign
* unnecessary animation
* decorative UI
* new visual systems
* unrelated typography changes

The important visual distinction is simply:

```text
unselected
selected as left
selected as right
unavailable
```

---

# 14. Tests

Add focused tests for the new selection behavior.

At minimum cover:

1. completed scans are selectable
2. non-completed scans cannot be selected
3. first selection becomes `left`
4. second selection becomes `right`
5. same scan cannot occupy both sides
6. third selection does not silently overwrite
7. deselection works
8. comparison action is disabled until two valid distinct scans exist
9. valid selection navigates to the expected URL
10. scan IDs are correctly encoded into query parameters

Reuse existing testing conventions.

Do not duplicate tests already covered by the comparison route/domain.

---

# 15. URL behavior

The canonical generated URL must be:

```text
/scans/compare?left=<leftScanId>&right=<rightScanId>
```

Preserve the existing parameter names exactly.

Do not introduce:

```text
first
second
scanA
scanB
source
target
```

if the existing route already uses `left` and `right`.

---

# 16. Scope protection

Do NOT:

* rewrite comparison
* rewrite Scan History
* create a new comparison engine
* modify comparison algorithms
* modify evidence identity
* modify detection scoring
* modify crawler behavior
* modify persistence schema
* add API endpoints
* add dependencies
* redesign the navigation
* redesign the entire Scan Detail page
* add another dashboard metric
* implement rescan
* implement historical evolution
* implement technology detail
* implement exports

This step exists solely to make the already-built comparison capability accessible.

---

# 17. Validation

Run the complete repository validation suite:

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

Run the relevant focused tests separately if the repository conventions support it.

If possible, verify the flow manually:

```text
open scan history
→ select completed scan A
→ select completed scan B
→ click Compare
→ arrive at /scans/compare?left=A&right=B
→ comparison renders
```

Also verify:

```text
one scan selected
→ Compare remains unavailable

same scan selected twice
→ invalid state prevented

failed/running scan
→ not selectable
```

---

# 18. Completion report

Return:

```text
Step 44 — COMPLETE

## Implementation

- files created
- files modified
- selection architecture
- selection behavior
- navigation behavior

## UX

- how users select scan A
- how users select scan B
- how deselection works
- how unavailable scans are represented

## Integration

- existing comparison code reused
- route behavior preserved
- no backend/domain changes

## Tests

- new tests
- total tests
- regressions

## Validation

- typecheck
- tests
- lint
- prettier
- build
- circular dependencies
- jsx preserve

## Manual verification

- history → select A → select B → comparison

## Scope

Explicitly confirm that comparison logic, persistence, crawler and detection pipeline were not unnecessarily modified.

## Git

Commit the completed step with:

Step 44: Scan Comparison Selection UX
```

---

# Definition of Done

Step 44 is complete when a normal user can do this without manually editing a URL:

```text
Scan History
    ↓
select scan A
    ↓
select scan B
    ↓
Compare
    ↓
Scan Comparison
```

The existing comparison implementation must remain the source of truth.

**Golden rule:**

> Do not build comparison. Make the comparison that already exists usable.
