Goal: make scan execution feel like a real scanning product by exposing the existing scan lifecycle in the UI.

Step 23 completed the creation workflow.

Current flow:

/scans/new
→ POST /api/scans
→ /scans/[id]

Step 24 must improve the scan detail experience for scans that are still running.

IMPORTANT:
Do NOT redesign the backend execution model.
Do NOT introduce background jobs, queues, Redis, WebSockets, SSE, or a new persistence mechanism.

First inspect the existing Scan lifecycle and API response contract.

The domain already has:

pending → running → completed
↘ failed

Use the existing states rather than inventing new ones.

1. Audit only the existing execution behavior needed for this feature.

Determine:

- whether POST /api/scans can currently return a running scan
- whether the scan is executed synchronously
- whether GET /api/scans/:id can observe lifecycle changes
- whether timestamps already expose useful lifecycle information
- whether the existing repository/API already supports everything required

Do not modify infrastructure simply because polling is being introduced.

2. Improve `/scans/[id]`.

The detail page must clearly distinguish:

pending
running
completed
failed

For `completed`:

- show the existing result normally

For `failed`:

- show the existing failure information safely

For `pending` / `running`:

- show a dedicated scanning state
- explain that the scan is in progress
- show available lifecycle timestamps
- do not display a fake detection result
- do not claim completion

3. Add polling only where necessary.

For scans in:

pending
running

the client may periodically request:

GET /api/scans/:id

Use a conservative interval such as 2–3 seconds.

Stop polling immediately when:

completed
failed
404
unrecoverable API error

Do not poll completed scans.

Do not poll the history page.

Do not create a global polling system.

4. Keep the server/client boundary clean.

Preferred architecture:

`/scans/[id]/page.tsx`
↓
initial server fetch
↓
`ScanDetail`
↓
client lifecycle component
↓
typed `fetchScanById()`

Only the component responsible for lifecycle refresh should become a client component.

The initial page should still be server-rendered where practical.

5. Avoid hydration problems.

The initial server-rendered result and the client polling state must have compatible initial data.

Do not use:

- `Date.now()` directly in render
- random IDs
- browser-only APIs during initial render
- client-only state that changes the initial HTML unexpectedly

6. Handle polling failures carefully.

If one polling request fails transiently:

- do not immediately destroy the current scan view
- retain the last known scan state
- show a non-destructive refresh/error indication if useful

If the API definitively returns 404:

- stop polling
- display the existing not-found state

If the API returns a terminal server error:

- stop polling
- display a user-facing error without leaking internal details

Do not implement retry backoff yet.

7. Update the scan creation experience.

After `/scans/new` successfully creates a scan:

- navigate to `/scans/[id]` as today
- let the detail page handle the lifecycle

Do not duplicate polling inside `/scans/new`.

8. Improve `/scans` minimally.

The history list should correctly represent:

- pending
- running
- completed
- failed

Do not add live polling to the history page.

A manual page refresh is sufficient for the history list.

9. Add tests.

API/client:

- fetchScanById remains compatible with polling
- successful refresh
- 404
- API error

Lifecycle component:

- pending state
- running state
- completed state
- failed state
- polling starts only for non-terminal states
- polling stops when terminal
- polling does not occur for completed scans
- polling failure preserves the last known state
- 404 stops polling

Use fake timers/mocked fetch where appropriate.

Do not test React internals.

10. Be careful with timers.

Polling must:

- clean up the interval/timer on unmount
- never create duplicate timers
- stop after terminal state
- not continue after navigation

This should be explicitly tested.

11. Do NOT add:

- WebSockets
- Server-Sent Events
- Redis
- BullMQ
- background workers
- queues
- React Query
- SWR
- Zustand
- global state
- optimistic updates
- progress percentages that are not backed by real data
- fake progress bars

The scan lifecycle is the source of truth.

12. Documentation.

Create:

docs/Step24-report.md

Document:

- lifecycle states exposed
- polling behavior
- polling interval
- terminal conditions
- error behavior
- server/client boundary
- tests
- validation results

13. Validation.

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps

Success criteria:

- `/scans/[id]` accurately represents all scan states
- pending/running scans automatically refresh
- completed/failed scans stop refreshing
- polling is cleaned up correctly
- transient polling errors do not erase the last known result
- 404 stops polling
- no fake progress is displayed
- `/scans` correctly displays lifecycle status without live polling
- `/scans/new` remains unchanged functionally
- no unnecessary dependencies
- no new backend infrastructure
- all validation checks pass

After completion, report:

- files created
- files modified
- polling architecture
- tests added
- validation results
- any important implementation decisions
