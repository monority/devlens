Goal: make the scan history usable when the number of scans grows.

Step 26 added scan comparison.

Step 27 focuses on finding and narrowing existing scans from `/scans`.

Do NOT modify scan execution, detectors, crawler, scoring, persistence schema, or comparison semantics.

Prefer client-side filtering of the existing GET /api/scans result for this first implementation.

1. Inspect the existing `/scans` page and API response.

Determine:

- current scan list shape
- target URL fields
- status fields
- timestamps
- existing ScanCard components
- existing navigation
- current empty/error states

Reuse existing components and styles.

2. Add a search field.

The `/scans` page should allow searching scans by target URL.

Example:

Search scans
[ example.com ]

Filtering should be:

- case-insensitive
- substring-based
- deterministic

Search should match the target URL.

Do not perform a network request for every keystroke.

3. Add status filtering.

Provide a simple status filter for:

- All
- Pending
- Running
- Completed
- Failed

The filter must operate on the existing API result.

Do not invent statuses.

4. Add deterministic client-side filtering.

The pipeline should conceptually be:

API result
↓
search filter
↓
status filter
↓
existing ordered scan list

Do not re-sort the results.

The ordering returned by the API must remain intact.

5. Preserve URL/API boundaries.

Do not add:

- database queries
- repository methods
- query parameters to the backend
- a new API endpoint

unless the existing implementation makes this genuinely necessary.

For the current scale, filtering the existing history response in the browser is sufficient.

6. Query-string state.

Prefer keeping filters shareable through the URL if this fits the existing Next.js architecture cleanly.

For example:

/scans?q=example.com&status=completed

Requirements:

- refreshing the page preserves filters
- copied URLs preserve filters
- invalid status values fall back safely to "All"

Do not introduce a client-side router/state library.

If using search params requires a client component, keep the client boundary as small as possible.

7. Result count.

Display a small factual count:

12 scans

or:

3 scans matching "example.com"

Do not add fabricated analytics or statistics.

8. Empty filtered state.

Distinguish:

- no scans exist at all
- scans exist but none match the current filters

Example:

No scans yet.

versus:

No scans match the current filters.

Provide a clear way to reset filters.

9. Preserve lifecycle status.

History must continue to display:

- pending
- running
- completed
- failed

Step 24 behavior remains unchanged.

Do NOT add polling to the history page.

10. Preserve existing navigation.

Each scan should still link to:

/scans/[id]

Keep:

- New scan
- Compare two scans

accessible.

Do not redesign navigation unnecessarily.

11. Accessibility.

Search:

- associated label
- keyboard accessible
- sensible input type

Status filter:

- native select or accessible equivalent

Reset:

- keyboard accessible

Do not rely exclusively on color.

12. Tests.

Add pure filtering tests where possible.

Cover:

- no filters
- URL substring
- case-insensitive search
- status filter
- search + status together
- no matching scans
- invalid status
- original ordering preserved
- empty dataset

Add focused UI tests for:

- search field
- status selector
- result count
- empty state
- reset behavior
- links remain correct

Do not test framework internals.

13. Keep architecture simple.

A good structure is:

scans/page.tsx
↓
ScanHistory
↓
ScanFilters
↓
filterScans()
↓
ScanCard

The filtering function should be pure and independent of React.

Do not introduce:

- Redux
- Zustand
- React Query
- SWR
- URL state libraries
- debounce libraries

A small native implementation is enough.

14. Do NOT add:

- server-side search
- pagination
- infinite scrolling
- database indexes
- new API endpoints
- authentication
- saved filters
- analytics
- bulk actions
- scan deletion
- exports
- third-party UI libraries

15. Documentation.

Create:

docs/Step27-report.md

Document:

- filter behavior
- search semantics
- URL state
- status semantics
- empty states
- tests
- validation results

16. Validation.

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps

Success criteria:

- `/scans` supports target URL search
- status filtering works
- search is case-insensitive
- combined filters work
- original API ordering is preserved
- filters can survive page refresh
- invalid status values are safe
- filtered-empty and globally-empty states are distinct
- existing scan links/navigation remain intact
- no history polling is introduced
- no backend changes are required
- no unnecessary dependencies
- all validation checks pass

After completion, report:

- files created
- files modified
- filtering architecture
- URL state behavior
- tests added
- validation results
- important implementation decisions
