# DevLens — Step 36: Scan Report Filtering & Deep Linking

## Goal

Improve the completed scan report with **client-side detection filtering and URL deep linking**.

A user should be able to narrow a completed scan report by:

* technology search
* technology category

The selected state must be represented in the URL so that a report view can be:

* bookmarked
* refreshed without losing the filters
* shared with another user
* opened directly at the same filtered view

This is a UI/navigation feature only.

Do not change the scan API, domain model, detector pipeline, scoring, persistence, or scan result contract.

---

## 1. Inspect before changing

Inspect:

* `apps/web/src/app/scans/[id]/page.tsx`
* `apps/web/src/components/ScanViews.tsx`
* `apps/web/src/components/DetectionList.tsx`
* `apps/web/src/components/DetectionItem.tsx`
* `apps/web/src/components/ScanInsights.tsx`
* `apps/web/src/lib/technology-filter.ts`
* `apps/web/src/lib/technology-catalog.ts`
* existing `/technologies` filtering implementation
* existing `/scans` filtering implementation
* relevant CSS modules
* existing tests

Reuse established filtering and URL-state conventions where possible.

Do not duplicate the technology catalog.

---

## 2. URL contract

Use query parameters on:

```text
/scans/{id}
```

Suggested parameters:

```text
?q=react
&category=library
```

Examples:

```text
/scans/abc123?q=react
/scans/abc123?category=cms
/scans/abc123?q=react&category=library
```

Rules:

* `q` is a case-insensitive substring search
* search against technology name and technology ID
* `category` must match an existing technology catalog category
* invalid category behaves as no category filter
* empty `q` behaves as no search filter
* URL state must be deterministic
* do not put evidence text into the search query
* do not search raw JSON

Do not change the existing scan API.

---

## 3. Filtering model

Create a pure module if the existing filtering utilities cannot be reused cleanly.

Suggested API:

```ts
type DetectionFilters = {
  query: string;
  category: string;
};

function filterDetections(
  detections: Detection[],
  filters: DetectionFilters,
): Detection[];
```

Behavior:

* preserve API detection ranking/order
* do not reorder results
* do not mutate the input
* empty filters return all detections
* both filters are ANDed together
* category is resolved through the existing technology catalog
* unknown technology IDs:

  * remain searchable by ID/name
  * do not match a known category unless explicitly categorized by the existing catalog
* duplicate detections are not introduced or removed by filtering

Do not alter the underlying detection list.

---

## 4. Category source

Use the existing catalog from Step 30.

Do not create:

* a second category map
* a second technology catalog
* hard-coded technology category definitions

If the existing catalog helpers can be extended safely, prefer doing so.

---

## 5. UI

Add a compact filter control above the completed detection list.

Suggested presentation:

```text
Detections

[ Search technologies... ] [ All categories ▼ ]

Showing 4 of 12 detections
```

Requirements:

* search input has an accessible `<label>`
* category select has an accessible `<label>`
* reset button appears when filters are active
* result count is explicit
* empty filtered state is distinct from a scan with zero detections

Example:

```text
No detections match these filters.
[Clear filters]
```

The existing scan summary, insights, evidence, explanation, and composition sections must remain intact.

---

## 6. Client/server architecture

Keep the scan data fetching server-side.

The detail page should:

1. fetch the scan exactly as it does today
2. read URL search parameters
3. pass the initial filter state into a small client-side filtering component

Only the filtering interaction should require client-side state.

Do not convert the entire scan detail page into a client component.

Do not add:

* React Query
* Zustand
* Redux
* URL state libraries
* form libraries
* WebSockets
* polling changes
* server actions

Use native React/Next.js mechanisms already used elsewhere in the application.

---

## 7. URL synchronization

When the user changes:

### Search

Update:

```text
?q=<value>
```

### Category

Update:

```text
?category=<value>
```

### Both

Preserve both parameters:

```text
?q=<value>&category=<value>
```

When clearing a filter:

* remove the corresponding parameter
* do not leave empty parameters such as `q=`

Use `router.replace()` rather than creating browser-history entries for every keystroke/filter change.

Avoid unnecessary navigation if the resulting URL is unchanged.

---

## 8. Lifecycle behavior

Filtering only applies to completed scan detections.

For:

* pending
* running
* failed

preserve the existing behavior exactly.

Do not add polling logic.

When a scan transitions from running to completed:

* the completed detection list becomes filterable
* the current URL filters should be applied

For a completed scan with zero detections:

* preserve the existing empty state
* do not show misleading "0 of 0 filtered" messaging

---

## 9. Interaction details

Search should be:

* case-insensitive
* whitespace-tolerant
* substring-based

Examples:

```text
react
REACT
react dom
wordpress
tail
```

should behave consistently with the existing technology filtering conventions.

Do not debounce unless there is an actual performance requirement.

These scans contain relatively small detection lists; simple filtering is sufficient.

---

## 10. Accessibility

Requirements:

* labelled search input
* labelled category select
* keyboard-accessible reset button
* visible focus states using existing design conventions
* result count readable by assistive technologies
* no color-only indication
* links to technology detail pages remain keyboard accessible

Do not use custom dropdown implementations.

Prefer native:

```html
<input>
<select>
<button>
```

---

## 11. Tests

### Pure filtering tests

Add tests for:

1. empty filters
2. query by technology name
3. query by technology ID
4. case-insensitive search
5. whitespace handling
6. category filtering
7. query + category AND behavior
8. invalid category
9. unknown technology
10. no matches
11. original order preserved
12. input immutability

### Component tests

Test:

1. filters render
2. initial URL/filter state renders correctly
3. search changes update the URL
4. category changes update the URL
5. both parameters are preserved
6. clearing search removes `q`
7. clearing category removes `category`
8. reset clears all filters
9. result count
10. empty filtered state
11. zero-detection completed scan
12. pending state
13. running state
14. failed state
15. technology links remain intact
16. existing evidence/explanation UI remains intact

Do not weaken existing tests.

---

## 12. Documentation

Create:

```text
docs/Step36-report.md
```

Document:

* objective
* URL contract
* filtering semantics
* category resolution
* server/client boundary
* URL synchronization
* accessibility
* tests
* validation
* explicit non-goals

---

## 13. Scope constraints

Do NOT:

* modify the scan API
* modify database schemas
* modify repositories
* modify detectors
* modify scoring
* modify crawler behavior
* modify evidence semantics
* modify scan lifecycle
* add dependencies
* add an API endpoint
* add a state-management library
* add server actions
* add a new catalog
* add AI/LLM functionality
* filter evidence independently
* reorder detections
* recalculate confidence

This step is strictly:

**existing scan result → client-side detection filtering → URL state**

---

## 14. Validation

Run:

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

Expected:

* all existing tests remain green
* all new tests pass
* typecheck passes
* lint passes
* build passes
* no circular dependencies

---

## 15. Manual QA

Verify manually:

### No filters

```text
/scans/{id}
```

All detections are displayed in original ranking order.

### Search

```text
/scans/{id}?q=react
```

Only matching technologies are displayed.

### Category

```text
/scans/{id}?category=cms
```

Only technologies from that catalog category are displayed.

### Combined

```text
/scans/{id}?q=wordpress&category=cms
```

Both constraints apply.

### Clear

Clearing filters returns to:

```text
/scans/{id}
```

### Refresh

Refreshing the page preserves the selected filters.

### Share

Opening the filtered URL directly reproduces the same filtered view.

### Existing functionality

Confirm that:

* confidence values remain unchanged
* explanations remain unchanged
* evidence disclosure remains unchanged
* technology links remain functional
* Technology Composition remains visible
* Technology Evidence remains visible
* polling behavior remains unchanged
* failed/pending/running states remain unchanged

---

## 16. Final report

At completion report:

1. files created
2. files modified
3. filtering model
4. URL contract
5. server/client boundary
6. tests added
7. validation results
8. manual QA results
9. git commit hash

Do not push to GitHub unless credentials are available.

Keep the implementation narrowly scoped to Step 36.
